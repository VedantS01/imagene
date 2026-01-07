/**
 * AudioEngine - Manages audio capture and buffer management
 * 
 * This class handles:
 * - AudioContext initialization (on user gesture)
 * - Microphone access and stream management
 * - AudioWorklet setup and communication
 * - SharedArrayBuffer creation and management
 * - Communication with the processing worker
 */

import { createRingBufferStorage } from './RingBuffer';
import type { 
  AudioEngineConfig, 
  AudioEngineStatus, 
  ErrorCode,
  TranscriptionError 
} from '../types';

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: AudioEngineConfig = {
  targetSampleRate: 22050,
  ringBufferSize: 22050 * 10, // 10 seconds at target sample rate
  fftSize: 2048,
  hopSize: 256,
};

/**
 * Event types emitted by the AudioEngine
 */
export interface AudioEngineEvents {
  statusChange: (status: AudioEngineStatus) => void;
  error: (error: TranscriptionError) => void;
  bufferHealth: (health: number) => void;
}

/**
 * AudioEngine class for managing audio capture pipeline
 */
export class AudioEngine {
  private config: AudioEngineConfig;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private sharedBuffer: SharedArrayBuffer | null = null;
  private processingWorker: Worker | null = null;
  
  private isInitialized: boolean = false;
  private isRecording: boolean = false;
  private inputSampleRate: number = 48000;
  
  // Event listeners
  private eventListeners: Map<keyof AudioEngineEvents, Set<Function>> = new Map();
  
  constructor(config: Partial<AudioEngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Check SharedArrayBuffer support early
    if (typeof SharedArrayBuffer === 'undefined') {
      console.warn(
        'SharedArrayBuffer is not available. ' +
        'Ensure Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy headers are set.'
      );
    }
  }
  
  /**
   * Initialize the audio engine
   * MUST be called after a user gesture (click, touch, etc.)
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }
    
    try {
      // Check for SharedArrayBuffer support
      if (typeof SharedArrayBuffer === 'undefined') {
        throw this.createError(
          'SHARED_BUFFER_UNSUPPORTED',
          'SharedArrayBuffer is not supported. Enable cross-origin isolation.',
          false
        );
      }
      
      // Create AudioContext
      this.audioContext = new AudioContext({
        sampleRate: this.config.targetSampleRate,
        latencyHint: 'interactive',
      });
      
      this.inputSampleRate = this.audioContext.sampleRate;
      
      // Load the AudioWorklet module
      const workletUrl = new URL('./AudioRecorderWorklet.ts', import.meta.url);
      await this.audioContext.audioWorklet.addModule(workletUrl);
      
      // Create the shared ring buffer
      this.sharedBuffer = createRingBufferStorage(this.config.ringBufferSize);
      
      this.isInitialized = true;
      this.emitStatusChange();
      
    } catch (error) {
      if (error instanceof Error && 'code' in error) {
        throw error; // Re-throw our custom errors
      }
      
      throw this.createError(
        'AUDIO_CONTEXT_FAILED',
        `Failed to initialize audio: ${error instanceof Error ? error.message : 'Unknown error'}`,
        true
      );
    }
  }
  
  /**
   * Request microphone access and start recording
   */
  async startRecording(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    if (this.isRecording) {
      return;
    }
    
    try {
      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
          sampleRate: this.config.targetSampleRate,
        },
        video: false,
      });
      
      // Resume AudioContext if suspended
      if (this.audioContext!.state === 'suspended') {
        await this.audioContext!.resume();
      }
      
      // Create source node from microphone
      this.sourceNode = this.audioContext!.createMediaStreamSource(this.mediaStream);
      
      // Create AudioWorklet node
      this.workletNode = new AudioWorkletNode(
        this.audioContext!,
        'audio-recorder-processor',
        {
          numberOfInputs: 1,
          numberOfOutputs: 0,
          channelCount: 1,
          channelCountMode: 'explicit',
          channelInterpretation: 'speakers',
        }
      );
      
      // Set up message handling from worklet
      this.workletNode.port.onmessage = this.handleWorkletMessage.bind(this);
      
      // Initialize the worklet with shared buffer
      this.workletNode.port.postMessage({
        type: 'init',
        sharedBuffer: this.sharedBuffer,
        capacity: this.config.ringBufferSize,
      });
      
      // Connect the audio graph
      this.sourceNode.connect(this.workletNode);
      
      // Tell worklet to start recording
      this.workletNode.port.postMessage({ type: 'start' });
      
      // Notify processing worker of shared buffer
      if (this.processingWorker) {
        // Use BASE_URL for GitHub Pages compatibility
        const baseUrl = import.meta.env.BASE_URL || '/';
        this.processingWorker.postMessage({
          type: 'INIT',
          config: {
            sampleRate: this.inputSampleRate,
            windowSize: this.config.fftSize,
            hopSize: this.config.hopSize,
            modelPath: `${baseUrl}models/basic-pitch.onnx`,
            useWebGPU: await this.checkWebGPUSupport(),
            onsetThreshold: 0.8,
            offsetThreshold: 0.3,
            minNoteDuration: 0.05,
          },
          sharedBuffer: this.sharedBuffer,
        });
        this.processingWorker.postMessage({ type: 'START' });
      }
      
      this.isRecording = true;
      this.emitStatusChange();
      
    } catch (error) {
      // Handle microphone permission denial
      if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          throw this.createError(
            'MIC_PERMISSION_DENIED',
            'Microphone access was denied. Please allow microphone access and try again.',
            true
          );
        }
      }
      
      throw this.createError(
        'AUDIO_CONTEXT_FAILED',
        `Failed to start recording: ${error instanceof Error ? error.message : 'Unknown error'}`,
        true
      );
    }
  }
  
  /**
   * Stop recording
   */
  stopRecording(): void {
    if (!this.isRecording) {
      return;
    }
    
    // Tell worklet to stop
    this.workletNode?.port.postMessage({ type: 'stop' });
    
    // Disconnect audio graph
    this.sourceNode?.disconnect();
    this.workletNode?.disconnect();
    
    // Stop media tracks
    this.mediaStream?.getTracks().forEach(track => track.stop());
    
    // Notify processing worker
    if (this.processingWorker) {
      this.processingWorker.postMessage({ type: 'STOP' });
    }
    
    // Clean up
    this.sourceNode = null;
    this.workletNode = null;
    this.mediaStream = null;
    
    this.isRecording = false;
    this.emitStatusChange();
  }
  
  /**
   * Set the processing worker for communication
   */
  setProcessingWorker(worker: Worker): void {
    this.processingWorker = worker;
  }
  
  /**
   * Get the shared buffer for the processing worker
   */
  getSharedBuffer(): SharedArrayBuffer | null {
    return this.sharedBuffer;
  }
  
  /**
   * Get current engine configuration
   */
  getConfig(): AudioEngineConfig {
    return { ...this.config };
  }
  
  /**
   * Get current status
   */
  getStatus(): AudioEngineStatus {
    return {
      isInitialized: this.isInitialized,
      isRecording: this.isRecording,
      inputSampleRate: this.inputSampleRate,
      bufferHealth: 0, // Updated via worklet messages
      latencyMs: this.calculateLatency(),
    };
  }
  
  /**
   * Add event listener
   */
  on<K extends keyof AudioEngineEvents>(
    event: K,
    callback: AudioEngineEvents[K]
  ): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }
  
  /**
   * Remove event listener
   */
  off<K extends keyof AudioEngineEvents>(
    event: K,
    callback: AudioEngineEvents[K]
  ): void {
    this.eventListeners.get(event)?.delete(callback);
  }
  
  /**
   * Clean up resources
   */
  dispose(): void {
    this.stopRecording();
    
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    this.sharedBuffer = null;
    this.isInitialized = false;
    this.eventListeners.clear();
  }
  
  // ===== Private Methods =====
  
  /**
   * Handle messages from the AudioWorklet
   */
  private handleWorkletMessage(event: MessageEvent): void {
    const { type, ...data } = event.data;
    
    switch (type) {
      case 'initialized':
        console.log('AudioWorklet initialized');
        break;
        
      case 'health':
        this.emit('bufferHealth', data.health);
        break;
        
      case 'error':
        this.emit('error', this.createError(
          'WORKLET_LOAD_FAILED',
          data.message,
          false
        ));
        break;
    }
  }
  
  /**
   * Check WebGPU support
   */
  private async checkWebGPUSupport(): Promise<boolean> {
    if (!navigator.gpu) {
      return false;
    }
    
    try {
      const adapter = await navigator.gpu.requestAdapter();
      return adapter !== null;
    } catch {
      return false;
    }
  }
  
  /**
   * Calculate system latency in milliseconds
   */
  private calculateLatency(): number {
    if (!this.audioContext) {
      return 0;
    }
    
    // Base latency from AudioContext
    const contextLatency = this.audioContext.baseLatency || 0;
    
    // Output latency
    const outputLatency = this.audioContext.outputLatency || 0;
    
    // Buffer latency (rough estimate based on FFT size)
    const bufferLatency = this.config.fftSize / this.inputSampleRate;
    
    // Total latency in milliseconds
    return (contextLatency + outputLatency + bufferLatency) * 1000;
  }
  
  /**
   * Emit a status change event
   */
  private emitStatusChange(): void {
    this.emit('statusChange', this.getStatus());
  }
  
  /**
   * Emit an event to all listeners
   */
  private emit<K extends keyof AudioEngineEvents>(
    event: K,
    data: Parameters<AudioEngineEvents[K]>[0]
  ): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          (callback as Function)(data);
        } catch (error) {
          console.error(`Error in ${event} listener:`, error);
        }
      });
    }
  }
  
  /**
   * Create a TranscriptionError object
   */
  private createError(
    code: ErrorCode,
    message: string,
    recoverable: boolean
  ): TranscriptionError {
    return { code, message, recoverable };
  }
}

/**
 * Singleton instance of the AudioEngine
 */
let audioEngineInstance: AudioEngine | null = null;

/**
 * Get or create the AudioEngine singleton
 */
export function getAudioEngine(config?: Partial<AudioEngineConfig>): AudioEngine {
  if (!audioEngineInstance) {
    audioEngineInstance = new AudioEngine(config);
  }
  return audioEngineInstance;
}

/**
 * Reset the AudioEngine singleton (for testing or cleanup)
 */
export function resetAudioEngine(): void {
  if (audioEngineInstance) {
    audioEngineInstance.dispose();
    audioEngineInstance = null;
  }
}
