/**
 * RingBuffer - Lock-free circular buffer using SharedArrayBuffer
 * 
 * This implementation allows thread-safe communication between the
 * AudioWorklet (producer/high-priority audio thread) and the Web Worker
 * (consumer/processing thread) without blocking either thread.
 * 
 * Memory Layout:
 * - Bytes 0-7: State array (Int32Array) [writeIndex, readIndex]
 * - Bytes 8+: Audio sample storage (Float32Array)
 * 
 * The buffer uses Atomics for thread-safe index management, ensuring
 * proper synchronization without locks.
 */

/**
 * Configuration for creating a RingBuffer
 */
export interface RingBufferConfig {
  /** Capacity in number of float samples */
  capacity: number;
}

/**
 * Offsets in the state Int32Array
 */
const STATE_WRITE_INDEX = 0;
const STATE_READ_INDEX = 1;

/**
 * Byte offsets in SharedArrayBuffer
 */
const STATES_BYTE_OFFSET = 0;
const STATES_BYTE_LENGTH = 8; // 2 x Int32 = 8 bytes
const STORAGE_BYTE_OFFSET = 8;

/**
 * Creates a SharedArrayBuffer for the ring buffer
 * This should only be called once, from the main thread
 */
export function createRingBufferStorage(capacity: number): SharedArrayBuffer {
  // Calculate total size: 8 bytes for states + 4 bytes per float sample
  const totalBytes = STATES_BYTE_LENGTH + capacity * Float32Array.BYTES_PER_ELEMENT;
  
  // Check if SharedArrayBuffer is available
  if (typeof SharedArrayBuffer === 'undefined') {
    throw new Error(
      'SharedArrayBuffer is not available. Ensure the page is served with ' +
      'Cross-Origin-Opener-Policy: same-origin and ' +
      'Cross-Origin-Embedder-Policy: require-corp headers.'
    );
  }
  
  const buffer = new SharedArrayBuffer(totalBytes);
  
  // Initialize state indices to 0
  const states = new Int32Array(buffer, STATES_BYTE_OFFSET, 2);
  Atomics.store(states, STATE_WRITE_INDEX, 0);
  Atomics.store(states, STATE_READ_INDEX, 0);
  
  return buffer;
}

/**
 * RingBuffer class for lock-free audio data transfer
 * 
 * Usage:
 * - Create with createRingBufferStorage() on main thread
 * - Pass SharedArrayBuffer to both AudioWorklet and Web Worker
 * - Create RingBuffer instance in each context
 * - AudioWorklet calls push() to write samples
 * - Web Worker calls pull() to read samples
 */
export class RingBuffer {
  private readonly states: Int32Array;
  private readonly storage: Float32Array;
  private readonly capacity: number;
  
  /**
   * Create a RingBuffer view over a SharedArrayBuffer
   * @param sharedBuffer The SharedArrayBuffer created by createRingBufferStorage
   */
  constructor(sharedBuffer: SharedArrayBuffer) {
    // Create views into the shared memory
    this.states = new Int32Array(sharedBuffer, STATES_BYTE_OFFSET, 2);
    this.storage = new Float32Array(sharedBuffer, STORAGE_BYTE_OFFSET);
    this.capacity = this.storage.length;
    
    if (this.capacity <= 0) {
      throw new Error('Invalid buffer capacity');
    }
  }
  
  /**
   * Get the current capacity of the buffer
   */
  getCapacity(): number {
    return this.capacity;
  }
  
  /**
   * Get the number of samples available to read
   * Thread-safe read of current buffer fill level
   */
  availableRead(): number {
    const writeIndex = Atomics.load(this.states, STATE_WRITE_INDEX);
    const readIndex = Atomics.load(this.states, STATE_READ_INDEX);
    
    if (writeIndex >= readIndex) {
      return writeIndex - readIndex;
    } else {
      return this.capacity - readIndex + writeIndex;
    }
  }
  
  /**
   * Get the number of samples that can be written
   * Thread-safe read of available write space
   */
  availableWrite(): number {
    // Leave one slot empty to distinguish full from empty
    return this.capacity - 1 - this.availableRead();
  }
  
  /**
   * Get buffer health as a percentage (0-1)
   */
  getHealth(): number {
    return this.availableRead() / this.capacity;
  }
  
  /**
   * Push audio samples into the buffer (producer side)
   * 
   * CRITICAL: This method is designed to be called from AudioWorkletProcessor.
   * It does NOT allocate any memory to avoid GC pauses.
   * 
   * @param data Audio samples to push
   * @returns Number of samples actually written (may be less than input if buffer full)
   */
  push(data: Float32Array): number {
    const available = this.availableWrite();
    const toWrite = Math.min(available, data.length);
    
    if (toWrite === 0) {
      return 0; // Buffer full, drop samples
    }
    
    let writeIndex = Atomics.load(this.states, STATE_WRITE_INDEX);
    
    // Calculate how much we can write before wrapping
    const firstChunk = Math.min(toWrite, this.capacity - writeIndex);
    const secondChunk = toWrite - firstChunk;
    
    // Write first chunk (up to end of buffer)
    for (let i = 0; i < firstChunk; i++) {
      this.storage[writeIndex + i] = data[i];
    }
    
    // Write second chunk (from start of buffer, if wrapping)
    if (secondChunk > 0) {
      for (let i = 0; i < secondChunk; i++) {
        this.storage[i] = data[firstChunk + i];
      }
    }
    
    // Update write index atomically
    const newWriteIndex = (writeIndex + toWrite) % this.capacity;
    Atomics.store(this.states, STATE_WRITE_INDEX, newWriteIndex);
    
    return toWrite;
  }
  
  /**
   * Pull audio samples from the buffer (consumer side)
   * 
   * @param output Pre-allocated buffer to receive samples
   * @returns Number of samples actually read
   */
  pull(output: Float32Array): number {
    const available = this.availableRead();
    const toRead = Math.min(available, output.length);
    
    if (toRead === 0) {
      return 0; // Buffer empty
    }
    
    let readIndex = Atomics.load(this.states, STATE_READ_INDEX);
    
    // Calculate how much we can read before wrapping
    const firstChunk = Math.min(toRead, this.capacity - readIndex);
    const secondChunk = toRead - firstChunk;
    
    // Read first chunk
    for (let i = 0; i < firstChunk; i++) {
      output[i] = this.storage[readIndex + i];
    }
    
    // Read second chunk (if wrapping)
    if (secondChunk > 0) {
      for (let i = 0; i < secondChunk; i++) {
        output[firstChunk + i] = this.storage[i];
      }
    }
    
    // Update read index atomically
    const newReadIndex = (readIndex + toRead) % this.capacity;
    Atomics.store(this.states, STATE_READ_INDEX, newReadIndex);
    
    return toRead;
  }
  
  /**
   * Peek at samples without consuming them
   * Useful for overlapping window analysis
   * 
   * @param output Pre-allocated buffer to receive samples
   * @param offset Offset from current read position
   * @returns Number of samples actually peeked
   */
  peek(output: Float32Array, offset: number = 0): number {
    const available = this.availableRead();
    
    if (offset >= available) {
      return 0;
    }
    
    const toRead = Math.min(available - offset, output.length);
    
    if (toRead === 0) {
      return 0;
    }
    
    let readIndex = Atomics.load(this.states, STATE_READ_INDEX);
    readIndex = (readIndex + offset) % this.capacity;
    
    // Calculate how much we can read before wrapping
    const firstChunk = Math.min(toRead, this.capacity - readIndex);
    const secondChunk = toRead - firstChunk;
    
    // Read first chunk
    for (let i = 0; i < firstChunk; i++) {
      output[i] = this.storage[readIndex + i];
    }
    
    // Read second chunk (if wrapping)
    if (secondChunk > 0) {
      for (let i = 0; i < secondChunk; i++) {
        output[firstChunk + i] = this.storage[i];
      }
    }
    
    return toRead;
  }
  
  /**
   * Skip samples without reading them
   * Useful after peeking when ready to advance
   * 
   * @param count Number of samples to skip
   * @returns Number of samples actually skipped
   */
  skip(count: number): number {
    const available = this.availableRead();
    const toSkip = Math.min(available, count);
    
    if (toSkip === 0) {
      return 0;
    }
    
    const readIndex = Atomics.load(this.states, STATE_READ_INDEX);
    const newReadIndex = (readIndex + toSkip) % this.capacity;
    Atomics.store(this.states, STATE_READ_INDEX, newReadIndex);
    
    return toSkip;
  }
  
  /**
   * Clear all data from the buffer
   * Should only be called when no other thread is accessing
   */
  clear(): void {
    Atomics.store(this.states, STATE_WRITE_INDEX, 0);
    Atomics.store(this.states, STATE_READ_INDEX, 0);
  }
  
  /**
   * Check if buffer is empty
   */
  isEmpty(): boolean {
    return this.availableRead() === 0;
  }
  
  /**
   * Check if buffer is full (or nearly full)
   */
  isFull(): boolean {
    return this.availableWrite() === 0;
  }
}

/**
 * High-level wrapper for reading from ring buffer with windowing support
 * Used by the processing worker for overlapping window analysis
 */
export class WindowedRingBufferReader {
  private readonly ringBuffer: RingBuffer;
  private readonly windowSize: number;
  private readonly hopSize: number;
  private readonly windowBuffer: Float32Array;
  private samplesProcessed: number = 0;
  
  constructor(ringBuffer: RingBuffer, windowSize: number, hopSize: number) {
    this.ringBuffer = ringBuffer;
    this.windowSize = windowSize;
    this.hopSize = hopSize;
    this.windowBuffer = new Float32Array(windowSize);
  }
  
  /**
   * Check if a full window is available for reading
   */
  hasWindow(): boolean {
    return this.ringBuffer.availableRead() >= this.windowSize;
  }
  
  /**
   * Get the next window of samples with overlapping
   * Returns null if not enough samples available
   */
  getNextWindow(): Float32Array | null {
    if (!this.hasWindow()) {
      return null;
    }
    
    // Peek at the full window
    const peeked = this.ringBuffer.peek(this.windowBuffer, 0);
    
    if (peeked < this.windowSize) {
      return null;
    }
    
    // Skip by hop size (not full window) for overlap
    this.ringBuffer.skip(this.hopSize);
    this.samplesProcessed += this.hopSize;
    
    // Return a copy to avoid race conditions
    return new Float32Array(this.windowBuffer);
  }
  
  /**
   * Get current timestamp in samples
   */
  getSamplesProcessed(): number {
    return this.samplesProcessed;
  }
  
  /**
   * Get current timestamp in seconds (requires sample rate)
   */
  getTimeInSeconds(sampleRate: number): number {
    return this.samplesProcessed / sampleRate;
  }
  
  /**
   * Reset the reader state
   */
  reset(): void {
    this.samplesProcessed = 0;
    this.ringBuffer.clear();
  }
}
