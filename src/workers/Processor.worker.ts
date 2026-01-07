/**
 * ProcessorWorker - Web Worker for DSP and ML Inference
 * 
 * This worker handles the heavy lifting of:
 * - Reading audio from the SharedArrayBuffer ring buffer
 * - Computing spectral features (Mel Spectrogram / CQT)
 * - Running ONNX inference for piano transcription
 * - Post-processing model outputs
 * - Sending detected notes back to the main thread
 * 
 * Running in a separate thread ensures the UI remains responsive.
 */

import * as ort from 'onnxruntime-web';
import type {
  WorkerInboundMessage,
  WorkerOutboundMessage,
  ProcessorConfig,
  DetectedNote,
  ActiveNoteState,
} from '../types';

// ============================================================================
// Constants
// ============================================================================

const PIANO_MIN_MIDI = 21;
const NUM_PIANO_KEYS = 88;
const DEFAULT_SAMPLE_RATE = 22050;
const DEFAULT_WINDOW_SIZE = 2048;
const DEFAULT_HOP_SIZE = 256;

// Processing window settings
const PROCESSING_WINDOW_SECONDS = 2.0;
const PROCESSING_HOP_SECONDS = 0.5; // 75% overlap for smooth transitions

// ============================================================================
// Ring Buffer Reader (Worker-side)
// ============================================================================

class WorkerRingBuffer {
  private states: Int32Array;
  private storage: Float32Array;
  private capacity: number;
  
  constructor(sharedBuffer: SharedArrayBuffer) {
    this.states = new Int32Array(sharedBuffer, 0, 2);
    this.storage = new Float32Array(sharedBuffer, 8);
    this.capacity = this.storage.length;
  }
  
  availableRead(): number {
    const writeIndex = Atomics.load(this.states, 0);
    const readIndex = Atomics.load(this.states, 1);
    
    if (writeIndex >= readIndex) {
      return writeIndex - readIndex;
    } else {
      return this.capacity - readIndex + writeIndex;
    }
  }
  
  pull(output: Float32Array): number {
    const available = this.availableRead();
    const toRead = Math.min(available, output.length);
    
    if (toRead === 0) return 0;
    
    let readIndex = Atomics.load(this.states, 1);
    const firstChunk = Math.min(toRead, this.capacity - readIndex);
    const secondChunk = toRead - firstChunk;
    
    for (let i = 0; i < firstChunk; i++) {
      output[i] = this.storage[readIndex + i];
    }
    
    if (secondChunk > 0) {
      for (let i = 0; i < secondChunk; i++) {
        output[firstChunk + i] = this.storage[i];
      }
    }
    
    const newReadIndex = (readIndex + toRead) % this.capacity;
    Atomics.store(this.states, 1, newReadIndex);
    
    return toRead;
  }
  
  peek(output: Float32Array, offset: number = 0): number {
    const available = this.availableRead();
    if (offset >= available) return 0;
    
    const toRead = Math.min(available - offset, output.length);
    if (toRead === 0) return 0;
    
    let readIndex = Atomics.load(this.states, 1);
    readIndex = (readIndex + offset) % this.capacity;
    
    const firstChunk = Math.min(toRead, this.capacity - readIndex);
    const secondChunk = toRead - firstChunk;
    
    for (let i = 0; i < firstChunk; i++) {
      output[i] = this.storage[readIndex + i];
    }
    
    if (secondChunk > 0) {
      for (let i = 0; i < secondChunk; i++) {
        output[firstChunk + i] = this.storage[i];
      }
    }
    
    return toRead;
  }
  
  skip(count: number): number {
    const available = this.availableRead();
    const toSkip = Math.min(available, count);
    if (toSkip === 0) return 0;
    
    const readIndex = Atomics.load(this.states, 1);
    const newReadIndex = (readIndex + toSkip) % this.capacity;
    Atomics.store(this.states, 1, newReadIndex);
    
    return toSkip;
  }
  
  getHealth(): number {
    return this.availableRead() / this.capacity;
  }
}

// ============================================================================
// Feature Extraction
// ============================================================================

/**
 * Compute Mel Spectrogram from audio samples
 * Uses manual computation when Essentia.js is not available
 */
class MelSpectrogramExtractor {
  private readonly sampleRate: number;
  private readonly fftSize: number;
  private readonly hopSize: number;
  private readonly numMelBins: number;
  private readonly melFilterbank: Float32Array[];
  private readonly hannWindow: Float32Array;
  
  constructor(
    sampleRate: number = DEFAULT_SAMPLE_RATE,
    fftSize: number = DEFAULT_WINDOW_SIZE,
    hopSize: number = DEFAULT_HOP_SIZE,
    numMelBins: number = 256
  ) {
    this.sampleRate = sampleRate;
    this.fftSize = fftSize;
    this.hopSize = hopSize;
    this.numMelBins = numMelBins;
    
    // Pre-compute Hann window
    this.hannWindow = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i++) {
      this.hannWindow[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (fftSize - 1)));
    }
    
    // Pre-compute Mel filterbank
    this.melFilterbank = this.createMelFilterbank();
  }
  
  /**
   * Create Mel filterbank matrix
   */
  private createMelFilterbank(): Float32Array[] {
    const fMin = 20;
    const fMax = this.sampleRate / 2;
    const numFftBins = this.fftSize / 2 + 1;
    
    // Convert to Mel scale
    const melMin = this.hzToMel(fMin);
    const melMax = this.hzToMel(fMax);
    
    // Create evenly spaced Mel points
    const melPoints = new Float32Array(this.numMelBins + 2);
    for (let i = 0; i < melPoints.length; i++) {
      melPoints[i] = melMin + (i * (melMax - melMin)) / (this.numMelBins + 1);
    }
    
    // Convert back to Hz
    const hzPoints = melPoints.map(mel => this.melToHz(mel));
    
    // Convert to FFT bin indices
    const binPoints = hzPoints.map(hz => 
      Math.round((this.fftSize * hz) / this.sampleRate)
    );
    
    // Create filterbank
    const filterbank: Float32Array[] = [];
    for (let m = 0; m < this.numMelBins; m++) {
      const filter = new Float32Array(numFftBins);
      const left = binPoints[m];
      const center = binPoints[m + 1];
      const right = binPoints[m + 2];
      
      // Rising slope
      for (let k = left; k < center && k < numFftBins; k++) {
        filter[k] = (k - left) / (center - left);
      }
      
      // Falling slope
      for (let k = center; k <= right && k < numFftBins; k++) {
        filter[k] = (right - k) / (right - center);
      }
      
      filterbank.push(filter);
    }
    
    return filterbank;
  }
  
  private hzToMel(hz: number): number {
    return 2595 * Math.log10(1 + hz / 700);
  }
  
  private melToHz(mel: number): number {
    return 700 * (Math.pow(10, mel / 2595) - 1);
  }
  
  /**
   * Compute magnitude spectrum using simple DFT
   * (In production, use Essentia.js FFT for performance)
   */
  private computeFFT(frame: Float32Array): Float32Array {
    const N = frame.length;
    const numBins = N / 2 + 1;
    const magnitudes = new Float32Array(numBins);
    
    // Apply window
    const windowed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      windowed[i] = frame[i] * this.hannWindow[i];
    }
    
    // Simple DFT (replace with FFT in production)
    for (let k = 0; k < numBins; k++) {
      let real = 0;
      let imag = 0;
      
      for (let n = 0; n < N; n++) {
        const angle = -2 * Math.PI * k * n / N;
        real += windowed[n] * Math.cos(angle);
        imag += windowed[n] * Math.sin(angle);
      }
      
      magnitudes[k] = Math.sqrt(real * real + imag * imag);
    }
    
    return magnitudes;
  }
  
  /**
   * Extract Mel spectrogram from audio
   */
  extract(audio: Float32Array): Float32Array[] {
    const numFrames = Math.floor((audio.length - this.fftSize) / this.hopSize) + 1;
    const melFrames: Float32Array[] = [];
    
    for (let frame = 0; frame < numFrames; frame++) {
      const start = frame * this.hopSize;
      const frameData = audio.slice(start, start + this.fftSize);
      
      // Compute magnitude spectrum
      const magnitudes = this.computeFFT(frameData);
      
      // Apply Mel filterbank
      const melFrame = new Float32Array(this.numMelBins);
      for (let m = 0; m < this.numMelBins; m++) {
        let sum = 0;
        for (let k = 0; k < magnitudes.length; k++) {
          sum += magnitudes[k] * this.melFilterbank[m][k];
        }
        // Log scaling
        melFrame[m] = Math.log(Math.max(sum, 1e-10));
      }
      
      melFrames.push(melFrame);
    }
    
    return melFrames;
  }
  
  /**
   * Convert Mel frames to tensor format for ONNX
   */
  toTensor(melFrames: Float32Array[]): Float32Array {
    const numFrames = melFrames.length;
    const tensor = new Float32Array(1 * numFrames * this.numMelBins);
    
    for (let t = 0; t < numFrames; t++) {
      for (let f = 0; f < this.numMelBins; f++) {
        tensor[t * this.numMelBins + f] = melFrames[t][f];
      }
    }
    
    return tensor;
  }
}

// ============================================================================
// Note Decoder with Hysteresis
// ============================================================================

class NoteDecoder {
  private activeNotes: Map<number, ActiveNoteState> = new Map();
  private onsetThreshold: number;
  private offsetThreshold: number;
  private minDurationSeconds: number;
  private sampleRate: number;
  private hopSize: number;
  
  constructor(
    onsetThreshold: number = 0.8,
    offsetThreshold: number = 0.3,
    minDurationSeconds: number = 0.05,
    sampleRate: number = DEFAULT_SAMPLE_RATE,
    hopSize: number = DEFAULT_HOP_SIZE
  ) {
    this.onsetThreshold = onsetThreshold;
    this.offsetThreshold = offsetThreshold;
    this.minDurationSeconds = minDurationSeconds;
    this.sampleRate = sampleRate;
    this.hopSize = hopSize;
  }
  
  setThresholds(onset: number, offset: number): void {
    this.onsetThreshold = onset;
    this.offsetThreshold = offset;
  }
  
  /**
   * Process a frame of piano roll probabilities
   * Returns newly completed notes
   */
  processFrame(
    frameProbabilities: Float32Array,
    onsetProbabilities: Float32Array | null,
    frameIndex: number,
    baseTimestamp: number
  ): DetectedNote[] {
    const completedNotes: DetectedNote[] = [];
    const frameTime = baseTimestamp + (frameIndex * this.hopSize) / this.sampleRate;
    
    for (let pitch = 0; pitch < NUM_PIANO_KEYS; pitch++) {
      const midiNote = pitch + PIANO_MIN_MIDI;
      const probability = frameProbabilities[pitch];
      const onsetProb = onsetProbabilities ? onsetProbabilities[pitch] : probability;
      
      const isActive = this.activeNotes.has(midiNote);
      
      if (isActive) {
        // Note is currently active - check for offset
        if (probability < this.offsetThreshold) {
          const activeNote = this.activeNotes.get(midiNote)!;
          const duration = frameTime - activeNote.startTime;
          
          // Only emit if duration exceeds minimum
          if (duration >= this.minDurationSeconds) {
            completedNotes.push({
              pitch: midiNote,
              startTime: activeNote.startTime,
              endTime: frameTime,
              duration,
              velocity: Math.round(activeNote.velocityEstimate * 127),
              confidence: activeNote.peakProbability,
              isActive: false,
            });
          }
          
          this.activeNotes.delete(midiNote);
        } else {
          // Update peak probability
          const activeNote = this.activeNotes.get(midiNote)!;
          if (probability > activeNote.peakProbability) {
            activeNote.peakProbability = probability;
          }
        }
      } else {
        // Note is not active - check for onset
        if (onsetProb >= this.onsetThreshold || probability >= this.onsetThreshold) {
          this.activeNotes.set(midiNote, {
            pitch: midiNote,
            startTime: frameTime,
            startFrame: frameIndex,
            peakProbability: probability,
            velocityEstimate: onsetProb, // Use onset probability as velocity proxy
          });
        }
      }
    }
    
    return completedNotes;
  }
  
  /**
   * Get all currently active notes
   */
  getActiveNotes(): DetectedNote[] {
    const notes: DetectedNote[] = [];
    const currentTime = Date.now() / 1000; // Approximate current time
    
    this.activeNotes.forEach((state, midiNote) => {
      notes.push({
        pitch: midiNote,
        startTime: state.startTime,
        duration: currentTime - state.startTime,
        velocity: Math.round(state.velocityEstimate * 127),
        confidence: state.peakProbability,
        isActive: true,
      });
    });
    
    return notes;
  }
  
  /**
   * Force-close all active notes (e.g., when stopping)
   */
  closeAllNotes(endTime: number): DetectedNote[] {
    const closedNotes: DetectedNote[] = [];
    
    this.activeNotes.forEach((state, midiNote) => {
      const duration = endTime - state.startTime;
      if (duration >= this.minDurationSeconds) {
        closedNotes.push({
          pitch: midiNote,
          startTime: state.startTime,
          endTime,
          duration,
          velocity: Math.round(state.velocityEstimate * 127),
          confidence: state.peakProbability,
          isActive: false,
        });
      }
    });
    
    this.activeNotes.clear();
    return closedNotes;
  }
  
  /**
   * Reset decoder state
   */
  reset(): void {
    this.activeNotes.clear();
  }
}

// ============================================================================
// Main Processor Class
// ============================================================================

class AudioProcessor {
  private config: ProcessorConfig | null = null;
  private ringBuffer: WorkerRingBuffer | null = null;
  private session: ort.InferenceSession | null = null;
  private melExtractor: MelSpectrogramExtractor | null = null;
  private noteDecoder: NoteDecoder | null = null;
  
  private isRunning: boolean = false;
  private processingInterval: number | null = null;
  private processedSamples: number = 0;
  
  // Demo mode flag - when model isn't available
  private demoMode: boolean = false;
  
  // Buffers (pre-allocated to avoid GC)
  private audioBuffer: Float32Array | null = null;
  
  async initialize(config: ProcessorConfig, sharedBuffer: SharedArrayBuffer): Promise<void> {
    this.config = config;
    this.ringBuffer = new WorkerRingBuffer(sharedBuffer);
    
    // Initialize feature extractor
    this.melExtractor = new MelSpectrogramExtractor(
      config.sampleRate,
      config.windowSize,
      config.hopSize,
      256 // Mel bins
    );
    
    // Initialize note decoder
    this.noteDecoder = new NoteDecoder(
      config.onsetThreshold,
      config.offsetThreshold,
      config.minNoteDuration,
      config.sampleRate,
      config.hopSize
    );
    
    // Pre-allocate buffers
    const windowSamples = Math.floor(PROCESSING_WINDOW_SECONDS * config.sampleRate);
    this.audioBuffer = new Float32Array(windowSamples);
    
    // Load ONNX model
    await this.loadModel(config.modelPath, config.useWebGPU);
    
    self.postMessage({ type: 'READY' } as WorkerOutboundMessage);
  }
  
  private async loadModel(modelPath: string, _useWebGPU: boolean): Promise<void> {
    try {
      // Configure ONNX Runtime environment BEFORE creating session
      // For newer onnxruntime-web (1.17+), the WASM files are auto-bundled
      // We just need to ensure we use the WASM backend only
      
      // Disable multi-threading to avoid SharedArrayBuffer conflicts
      ort.env.wasm.numThreads = 1;
      
      // Use the default WASM paths (bundled with the package)
      // Don't set custom paths - let ONNX Runtime handle it
      
      // Only use WASM backend - WebGPU requires additional setup
      const executionProviders: ort.InferenceSession.ExecutionProviderConfig[] = ['wasm'];
      
      console.log('Configuring ONNX Runtime with WASM backend...');
      
      // Create session options
      const sessionOptions: ort.InferenceSession.SessionOptions = {
        executionProviders,
        graphOptimizationLevel: 'basic',
      };
      
      // Check if model file exists by trying to fetch it first
      console.log('Loading model from:', modelPath);
      const response = await fetch(modelPath);
      if (!response.ok) {
        throw new Error(`Model file not found at ${modelPath}. Please download a Basic Pitch ONNX model and place it in public/models/`);
      }
      
      // Load model from ArrayBuffer for better error handling
      const modelBuffer = await response.arrayBuffer();
      this.session = await ort.InferenceSession.create(modelBuffer, sessionOptions);
      
      console.log('ONNX model loaded successfully');
      console.log('Input names:', this.session.inputNames);
      console.log('Output names:', this.session.outputNames);
      
    } catch (error) {
      console.error('Failed to load ONNX model:', error);
      console.warn('Switching to DEMO MODE - simulating note detection');
      this.demoMode = true;
      // In demo mode, we still send READY so the app works
      // The processAudio method will simulate note detection
    }
  }
  
  start(): void {
    if (this.isRunning || !this.ringBuffer) {
      return;
    }
    
    this.isRunning = true;
    this.processedSamples = 0;
    this.noteDecoder?.reset();
    
    // Start processing loop
    this.processingInterval = self.setInterval(() => {
      this.processAudio();
    }, 100) as unknown as number; // Process every 100ms
  }
  
  stop(): void {
    this.isRunning = false;
    
    if (this.processingInterval !== null) {
      self.clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    
    // Close any remaining active notes
    if (this.noteDecoder) {
      const endTime = this.processedSamples / (this.config?.sampleRate || DEFAULT_SAMPLE_RATE);
      const closedNotes = this.noteDecoder.closeAllNotes(endTime);
      
      if (closedNotes.length > 0) {
        self.postMessage({
          type: 'NOTES_DETECTED',
          notes: closedNotes,
          timestamp: endTime,
        } as WorkerOutboundMessage);
      }
    }
  }
  
  setThresholds(onset: number, offset: number): void {
    this.noteDecoder?.setThresholds(onset, offset);
  }
  
  private async processAudio(): Promise<void> {
    if (!this.ringBuffer || !this.config || !this.audioBuffer) {
      return;
    }
    
    const windowSamples = Math.floor(PROCESSING_WINDOW_SECONDS * this.config.sampleRate);
    const hopSamples = Math.floor(PROCESSING_HOP_SECONDS * this.config.sampleRate);
    
    // Check if we have enough data
    const available = this.ringBuffer.availableRead();
    if (available < windowSamples) {
      return;
    }
    
    // Read audio window (peek, don't consume yet)
    const read = this.ringBuffer.peek(this.audioBuffer, 0);
    if (read < windowSamples) {
      return;
    }
    
    // Report buffer health
    self.postMessage({
      type: 'BUFFER_HEALTH',
      health: this.ringBuffer.getHealth(),
    } as WorkerOutboundMessage);
    
    try {
      let notes: DetectedNote[];
      
      if (this.demoMode) {
        // Demo mode: simulate note detection based on audio amplitude
        notes = this.simulateNoteDetection(this.audioBuffer);
      } else {
        // Real mode: process through model
        notes = await this.runInference(this.audioBuffer);
      }
      
      if (notes.length > 0) {
        const timestamp = this.processedSamples / this.config.sampleRate;
        self.postMessage({
          type: 'NOTES_DETECTED',
          notes,
          timestamp,
        } as WorkerOutboundMessage);
      }
      
      // Skip by hop size (not full window) for overlap
      this.ringBuffer.skip(hopSamples);
      this.processedSamples += hopSamples;
      
    } catch (error) {
      console.error('Inference error:', error);
      self.postMessage({
        type: 'ERROR',
        message: `Inference failed: ${error}`,
        code: 'INFERENCE_FAILED',
      } as WorkerOutboundMessage);
    }
  }
  
  /**
   * Demo mode: simulate note detection based on audio energy
   * This allows testing the UI without a real model
   */
  private simulateNoteDetection(audio: Float32Array): DetectedNote[] {
    if (!this.config) return [];
    
    // Calculate RMS energy of the audio
    let sumSquares = 0;
    for (let i = 0; i < audio.length; i++) {
      sumSquares += audio[i] * audio[i];
    }
    const rms = Math.sqrt(sumSquares / audio.length);
    
    // If signal is loud enough, detect some notes
    if (rms < 0.01) {
      return [];
    }
    
    const notes: DetectedNote[] = [];
    const timestamp = this.processedSamples / this.config.sampleRate;
    const duration = PROCESSING_HOP_SECONDS;
    
    // Simulate detecting 1-3 random notes based on amplitude
    const numNotes = Math.min(3, Math.floor(rms * 30) + 1);
    
    // Use a simple frequency analysis to pick notes
    // Calculate dominant frequencies using zero-crossing rate
    let zeroCrossings = 0;
    for (let i = 1; i < audio.length; i++) {
      if ((audio[i] >= 0) !== (audio[i - 1] >= 0)) {
        zeroCrossings++;
      }
    }
    
    // Estimate frequency from zero-crossing rate
    const estimatedFreq = (zeroCrossings / 2) * (this.config.sampleRate / audio.length);
    
    // Convert to MIDI note (A4 = 440Hz = MIDI 69)
    const baseMidi = Math.round(69 + 12 * Math.log2(estimatedFreq / 440));
    
    // Generate plausible notes around the estimated pitch
    for (let i = 0; i < numNotes; i++) {
      const midiNote = Math.max(21, Math.min(108, baseMidi + (i * 4) - 2)); // Piano range
      const velocity = Math.floor(Math.min(127, rms * 500));
      
      notes.push({
        pitch: midiNote,
        startTime: timestamp,
        endTime: timestamp + duration,
        duration: duration,
        velocity,
        confidence: Math.min(1, rms * 10),
        isActive: false, // Demo notes are complete
      });
    }
    
    // Generate fake piano roll data for visualization
    const fakeRoll = new Float32Array(NUM_PIANO_KEYS * 10); // 10 frames
    for (const note of notes) {
      const keyIndex = note.pitch - 21; // Offset for piano range
      if (keyIndex >= 0 && keyIndex < NUM_PIANO_KEYS) {
        for (let frame = 0; frame < 10; frame++) {
          fakeRoll[frame * NUM_PIANO_KEYS + keyIndex] = note.confidence;
        }
      }
    }
    
    self.postMessage({
      type: 'PIANO_ROLL_UPDATE',
      pianoRoll: fakeRoll,
      timestamp,
    } as WorkerOutboundMessage);
    
    return notes;
  }
  
  private async runInference(audio: Float32Array): Promise<DetectedNote[]> {
    if (!this.session || !this.melExtractor || !this.noteDecoder || !this.config) {
      return [];
    }
    
    // Extract Mel spectrogram
    const melFrames = this.melExtractor.extract(audio);
    
    if (melFrames.length === 0) {
      return [];
    }
    
    // Convert to tensor
    const tensorData = this.melExtractor.toTensor(melFrames);
    
    // Create ONNX tensor - shape depends on model
    // Basic Pitch expects [batch, time, features]
    const inputTensor = new ort.Tensor(
      'float32',
      tensorData,
      [1, melFrames.length, 256]
    );
    
    // Run inference
    const feeds: Record<string, ort.Tensor> = {};
    feeds[this.session.inputNames[0]] = inputTensor;
    
    const results = await this.session.run(feeds);
    
    // Process outputs
    // Basic Pitch outputs: onset probabilities and frame probabilities
    const outputNames = this.session.outputNames;
    const frameOutput = results[outputNames[0]];
    
    if (!frameOutput) {
      return [];
    }
    
    const frameData = frameOutput.data as Float32Array;
    const numFrames = melFrames.length;
    
    // Decode notes from probability matrix
    const allNotes: DetectedNote[] = [];
    const baseTimestamp = this.processedSamples / this.config.sampleRate;
    
    // Skip edge frames (first and last 10%) to avoid artifacts
    const skipFrames = Math.floor(numFrames * 0.1);
    
    for (let frame = skipFrames; frame < numFrames - skipFrames; frame++) {
      // Extract frame probabilities
      const frameProbabilities = new Float32Array(NUM_PIANO_KEYS);
      for (let p = 0; p < NUM_PIANO_KEYS; p++) {
        frameProbabilities[p] = frameData[frame * NUM_PIANO_KEYS + p];
      }
      
      // Process through note decoder
      const notes = this.noteDecoder.processFrame(
        frameProbabilities,
        null, // No separate onset output for now
        frame,
        baseTimestamp
      );
      
      allNotes.push(...notes);
    }
    
    // Send piano roll update for visualization
    if (frameData.length > 0) {
      self.postMessage({
        type: 'PIANO_ROLL_UPDATE',
        pianoRoll: frameData,
        timestamp: baseTimestamp,
      } as WorkerOutboundMessage);
    }
    
    return allNotes;
  }
}

// ============================================================================
// Worker Message Handler
// ============================================================================

const processor = new AudioProcessor();

self.onmessage = async (event: MessageEvent<WorkerInboundMessage>) => {
  const message = event.data;
  
  switch (message.type) {
    case 'INIT':
      await processor.initialize(message.config, message.sharedBuffer);
      break;
      
    case 'START':
      processor.start();
      break;
      
    case 'STOP':
      processor.stop();
      break;
      
    case 'SET_THRESHOLD':
      processor.setThresholds(message.onset, message.offset);
      break;
      
    default:
      console.warn('Unknown message type:', message);
  }
};

// Signal that worker is ready
self.postMessage({ type: 'READY' } as WorkerOutboundMessage);
