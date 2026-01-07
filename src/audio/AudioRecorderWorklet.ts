/**
 * AudioRecorderWorklet - Custom AudioWorkletProcessor for real-time audio capture
 * 
 * This processor runs on the audio rendering thread, receiving audio samples
 * from the microphone and writing them to a SharedArrayBuffer-based ring buffer.
 * 
 * CRITICAL PERFORMANCE CONSTRAINTS:
 * - No memory allocation (new, push, concat, etc.) in process()
 * - No async operations
 * - No console.log in hot path
 * - Process must complete in < 3ms for 128 samples at 48kHz
 */

/**
 * Ring buffer state indices
 */
const STATE_WRITE_INDEX = 0;
const STATE_READ_INDEX = 1;

/**
 * Message types for communication with main thread
 */
interface InitMessage {
  type: 'init';
  sharedBuffer: SharedArrayBuffer;
  capacity: number;
}

interface ControlMessage {
  type: 'start' | 'stop' | 'clear';
}

type WorkletMessage = InitMessage | ControlMessage;

/**
 * AudioRecorderProcessor - Captures audio and writes to ring buffer
 */
class AudioRecorderProcessor extends AudioWorkletProcessor {
  private isInitialized: boolean = false;
  private isRecording: boolean = false;
  private states: Int32Array | null = null;
  private storage: Float32Array | null = null;
  private capacity: number = 0;
  
  // Statistics (sent periodically, not every frame)
  private sampleCounter: number = 0;
  private droppedSamples: number = 0;
  private lastHealthReport: number = 0;
  private readonly HEALTH_REPORT_INTERVAL: number = 4800; // ~100ms at 48kHz
  
  constructor() {
    super();
    
    this.port.onmessage = (event: MessageEvent<WorkletMessage>) => {
      this.handleMessage(event.data);
    };
  }
  
  /**
   * Handle messages from the main thread
   */
  private handleMessage(message: WorkletMessage): void {
    switch (message.type) {
      case 'init':
        this.initializeBuffer(message.sharedBuffer, message.capacity);
        break;
      case 'start':
        if (this.isInitialized) {
          this.isRecording = true;
          this.sampleCounter = 0;
          this.droppedSamples = 0;
        }
        break;
      case 'stop':
        this.isRecording = false;
        break;
      case 'clear':
        this.clearBuffer();
        break;
    }
  }
  
  /**
   * Initialize views into the shared buffer
   */
  private initializeBuffer(sharedBuffer: SharedArrayBuffer, capacity: number): void {
    try {
      // Create views - 8 bytes for state (2 x Int32), rest for storage
      this.states = new Int32Array(sharedBuffer, 0, 2);
      this.storage = new Float32Array(sharedBuffer, 8);
      this.capacity = capacity;
      this.isInitialized = true;
      
      this.port.postMessage({ type: 'initialized' });
    } catch (error) {
      this.port.postMessage({ 
        type: 'error', 
        message: 'Failed to initialize shared buffer' 
      });
    }
  }
  
  /**
   * Clear the ring buffer
   */
  private clearBuffer(): void {
    if (this.states) {
      Atomics.store(this.states, STATE_WRITE_INDEX, 0);
      Atomics.store(this.states, STATE_READ_INDEX, 0);
    }
  }
  
  /**
   * Get available write space in the buffer
   */
  private getAvailableWrite(): number {
    if (!this.states) return 0;
    
    const writeIndex = Atomics.load(this.states, STATE_WRITE_INDEX);
    const readIndex = Atomics.load(this.states, STATE_READ_INDEX);
    
    let available: number;
    if (writeIndex >= readIndex) {
      available = this.capacity - 1 - (writeIndex - readIndex);
    } else {
      available = readIndex - writeIndex - 1;
    }
    
    return available;
  }
  
  /**
   * Push samples to the ring buffer
   * NO MEMORY ALLOCATION - uses pre-existing typed array views
   */
  private pushToBuffer(samples: Float32Array): number {
    if (!this.states || !this.storage) return 0;
    
    const available = this.getAvailableWrite();
    const toWrite = Math.min(available, samples.length);
    
    if (toWrite === 0) {
      return 0; // Buffer full
    }
    
    let writeIndex = Atomics.load(this.states, STATE_WRITE_INDEX);
    
    // Calculate chunks for wrap-around
    const firstChunk = Math.min(toWrite, this.capacity - writeIndex);
    const secondChunk = toWrite - firstChunk;
    
    // Write first chunk - manual loop to avoid allocation
    for (let i = 0; i < firstChunk; i++) {
      this.storage[writeIndex + i] = samples[i];
    }
    
    // Write second chunk if wrapping
    if (secondChunk > 0) {
      for (let i = 0; i < secondChunk; i++) {
        this.storage[i] = samples[firstChunk + i];
      }
    }
    
    // Atomic update of write index
    const newWriteIndex = (writeIndex + toWrite) % this.capacity;
    Atomics.store(this.states, STATE_WRITE_INDEX, newWriteIndex);
    
    return toWrite;
  }
  
  /**
   * Calculate buffer health for monitoring
   */
  private getBufferHealth(): number {
    if (!this.states) return 0;
    
    const writeIndex = Atomics.load(this.states, STATE_WRITE_INDEX);
    const readIndex = Atomics.load(this.states, STATE_READ_INDEX);
    
    let filled: number;
    if (writeIndex >= readIndex) {
      filled = writeIndex - readIndex;
    } else {
      filled = this.capacity - readIndex + writeIndex;
    }
    
    return filled / this.capacity;
  }
  
  /**
   * Main processing function - called for each audio block
   * 
   * @param inputs Array of inputs, each containing channels
   * @param _outputs Not used for recording
   * @param _parameters Not used
   * @returns true to keep processor alive
   */
  process(
    inputs: Float32Array[][],
    _outputs: Float32Array[][],
    _parameters: Record<string, Float32Array>
  ): boolean {
    // Fast path if not recording
    if (!this.isRecording || !this.isInitialized) {
      return true;
    }
    
    // Get first input, first channel (mono)
    const input = inputs[0];
    if (!input || input.length === 0) {
      return true;
    }
    
    const channelData = input[0];
    if (!channelData || channelData.length === 0) {
      return true;
    }
    
    // Write to ring buffer
    const written = this.pushToBuffer(channelData);
    
    // Track statistics
    this.sampleCounter += channelData.length;
    if (written < channelData.length) {
      this.droppedSamples += channelData.length - written;
    }
    
    // Periodic health report (not every frame to reduce message overhead)
    if (this.sampleCounter - this.lastHealthReport >= this.HEALTH_REPORT_INTERVAL) {
      this.lastHealthReport = this.sampleCounter;
      this.port.postMessage({
        type: 'health',
        health: this.getBufferHealth(),
        samplesProcessed: this.sampleCounter,
        droppedSamples: this.droppedSamples,
      });
    }
    
    return true;
  }
}

// Register the processor
registerProcessor('audio-recorder-processor', AudioRecorderProcessor);
