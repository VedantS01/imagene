/**
 * Core type definitions for the Imagene Piano Transcription Application
 * 
 * This file contains all shared interfaces and types used across
 * the audio engine, processing worker, and UI components.
 */

// ============================================================================
// Audio Engine Types
// ============================================================================

/**
 * Configuration for the audio engine initialization
 */
export interface AudioEngineConfig {
  /** Target sample rate for processing (model input rate) */
  targetSampleRate: number;
  /** Size of the ring buffer in samples */
  ringBufferSize: number;
  /** FFT size for spectral analysis */
  fftSize: number;
  /** Hop size for overlapping windows */
  hopSize: number;
}

/**
 * Status of the audio engine
 */
export interface AudioEngineStatus {
  isInitialized: boolean;
  isRecording: boolean;
  inputSampleRate: number;
  bufferHealth: number; // 0-1, percentage of buffer filled
  latencyMs: number;
}

/**
 * Ring buffer state indices (stored in Int32Array)
 */
export interface RingBufferState {
  writeIndex: number;
  readIndex: number;
}

/**
 * Shared memory layout for the ring buffer
 */
export interface RingBufferLayout {
  /** State array: [writeIndex, readIndex] */
  statesOffset: number;
  statesLength: number;
  /** Audio data storage */
  storageOffset: number;
  storageLength: number;
}

// ============================================================================
// Processing Worker Types
// ============================================================================

/**
 * Messages sent from main thread to processing worker
 */
export type WorkerInboundMessage =
  | { type: 'INIT'; config: ProcessorConfig; sharedBuffer: SharedArrayBuffer }
  | { type: 'START' }
  | { type: 'STOP' }
  | { type: 'SET_THRESHOLD'; onset: number; offset: number }
  | { type: 'SET_BPM'; bpm: number };

/**
 * Messages sent from processing worker to main thread
 */
export type WorkerOutboundMessage =
  | { type: 'READY' }
  | { type: 'NOTES_DETECTED'; notes: DetectedNote[]; timestamp: number }
  | { type: 'PIANO_ROLL_UPDATE'; pianoRoll: Float32Array; timestamp: number }
  | { type: 'BEAT_DETECTED'; bpm: number; beatPositions: number[] }
  | { type: 'MUSIC_XML_READY'; xml: string }
  | { type: 'ERROR'; message: string; code: ErrorCode }
  | { type: 'BUFFER_HEALTH'; health: number };

/**
 * Configuration for the processing worker
 */
export interface ProcessorConfig {
  /** Sample rate of the audio data */
  sampleRate: number;
  /** Window size in samples for analysis */
  windowSize: number;
  /** Hop size in samples */
  hopSize: number;
  /** Path to the ONNX model */
  modelPath: string;
  /** Use WebGPU if available */
  useWebGPU: boolean;
  /** Onset threshold for hysteresis */
  onsetThreshold: number;
  /** Offset threshold for hysteresis */
  offsetThreshold: number;
  /** Minimum note duration in seconds */
  minNoteDuration: number;
}

// ============================================================================
// Music Representation Types
// ============================================================================

/**
 * MIDI note number (0-127)
 */
export type MidiNote = number;

/**
 * Velocity value (0-127)
 */
export type Velocity = number;

/**
 * A detected note from the transcription process
 */
export interface DetectedNote {
  /** MIDI pitch (21-108 for standard piano) */
  pitch: MidiNote;
  /** Start time in seconds */
  startTime: number;
  /** End time in seconds (undefined if note is still active) */
  endTime?: number;
  /** Duration in seconds */
  duration: number;
  /** Velocity (0-127) */
  velocity: Velocity;
  /** Confidence score from the model (0-1) */
  confidence: number;
  /** Whether the note is currently active */
  isActive: boolean;
}

/**
 * A note quantized to musical time
 */
export interface QuantizedNote {
  /** MIDI pitch */
  pitch: MidiNote;
  /** Start position in beats */
  startBeat: number;
  /** Duration in beats */
  durationBeats: number;
  /** Musical duration type */
  durationType: NoteDurationType;
  /** Is this note dotted? */
  isDotted: boolean;
  /** Velocity */
  velocity: Velocity;
  /** Tie to next note? */
  tieToNext: boolean;
}

/**
 * Musical note duration types
 */
export type NoteDurationType =
  | 'whole'
  | 'half'
  | 'quarter'
  | 'eighth'
  | '16th'
  | '32nd'
  | '64th';

/**
 * Dynamics marking
 */
export type DynamicsMarking = 'ppp' | 'pp' | 'p' | 'mp' | 'mf' | 'f' | 'ff' | 'fff';

/**
 * Pitch representation for MusicXML
 */
export interface PitchInfo {
  step: 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';
  alter: -1 | 0 | 1; // flat, natural, sharp
  octave: number;
}

/**
 * Time signature
 */
export interface TimeSignature {
  beats: number;
  beatType: number;
}

/**
 * Key signature (-7 to 7, negative = flats, positive = sharps)
 */
export type KeySignature = number;

// ============================================================================
// Piano Roll Types
// ============================================================================

/**
 * Piano roll frame data
 */
export interface PianoRollFrame {
  /** Timestamp in seconds */
  time: number;
  /** Probability for each pitch (88 keys) */
  pitchProbabilities: Float32Array;
  /** Onset probability for each pitch */
  onsetProbabilities: Float32Array;
}

/**
 * Active note state for hysteresis tracking
 */
export interface ActiveNoteState {
  pitch: MidiNote;
  startTime: number;
  startFrame: number;
  peakProbability: number;
  velocityEstimate: number;
}

// ============================================================================
// Visualization Types
// ============================================================================

/**
 * Spectrogram data for visualization
 */
export interface SpectrogramData {
  /** Magnitude data (frequency x time) */
  magnitudes: Float32Array[];
  /** Frequency bins */
  frequencies: number[];
  /** Time stamps */
  times: number[];
}

/**
 * Waveform data for visualization
 */
export interface WaveformData {
  /** Amplitude samples */
  samples: Float32Array;
  /** Sample rate */
  sampleRate: number;
}

// ============================================================================
// Application State Types
// ============================================================================

/**
 * Recording state
 */
export type RecordingState = 'idle' | 'initializing' | 'recording' | 'processing' | 'error';

/**
 * Application store state
 */
export interface AppState {
  // Recording state
  recordingState: RecordingState;
  setRecordingState: (state: RecordingState) => void;

  // Buffer health (0-1)
  bufferHealth: number;
  setBufferHealth: (health: number) => void;

  // Detected notes
  detectedNotes: DetectedNote[];
  addNotes: (notes: DetectedNote[]) => void;
  clearNotes: () => void;

  // Quantized notes
  quantizedNotes: QuantizedNote[];
  setQuantizedNotes: (notes: QuantizedNote[]) => void;

  // MusicXML output
  musicXML: string | null;
  setMusicXML: (xml: string | null) => void;

  // Tempo
  bpm: number;
  setBpm: (bpm: number) => void;
  isAutoDetectBpm: boolean;
  setAutoDetectBpm: (auto: boolean) => void;

  // Time signature
  timeSignature: TimeSignature;
  setTimeSignature: (ts: TimeSignature) => void;

  // Thresholds
  onsetThreshold: number;
  offsetThreshold: number;
  setThresholds: (onset: number, offset: number) => void;

  // Error state
  error: string | null;
  setError: (error: string | null) => void;

  // Piano roll visualization data
  pianoRollData: Float32Array | null;
  setPianoRollData: (data: Float32Array | null) => void;
}

// ============================================================================
// Error Types
// ============================================================================

export type ErrorCode =
  | 'MIC_PERMISSION_DENIED'
  | 'AUDIO_CONTEXT_FAILED'
  | 'WORKLET_LOAD_FAILED'
  | 'MODEL_LOAD_FAILED'
  | 'SHARED_BUFFER_UNSUPPORTED'
  | 'WEBGPU_UNAVAILABLE'
  | 'INFERENCE_FAILED'
  | 'UNKNOWN';

export interface TranscriptionError {
  code: ErrorCode;
  message: string;
  recoverable: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Piano key constants
 */
export const PIANO_KEYS = {
  /** MIDI number of lowest piano key (A0) */
  MIN_MIDI: 21,
  /** MIDI number of highest piano key (C8) */
  MAX_MIDI: 108,
  /** Total number of piano keys */
  NUM_KEYS: 88,
} as const;

/**
 * Model constants (Basic Pitch defaults)
 */
export const MODEL_CONSTANTS = {
  /** Expected sample rate */
  SAMPLE_RATE: 22050,
  /** Window size in samples */
  WINDOW_SIZE: 2048,
  /** Hop size in samples */
  HOP_SIZE: 256,
  /** Number of output pitch bins */
  NUM_PITCHES: 88,
  /** Model input window in seconds */
  INPUT_WINDOW_SECONDS: 2.0,
} as const;

/**
 * Convert MIDI note number to pitch info
 */
export function midiToPitchInfo(midi: MidiNote): PitchInfo {
  const noteNames: Array<{ step: PitchInfo['step']; alter: PitchInfo['alter'] }> = [
    { step: 'C', alter: 0 },
    { step: 'C', alter: 1 },
    { step: 'D', alter: 0 },
    { step: 'D', alter: 1 },
    { step: 'E', alter: 0 },
    { step: 'F', alter: 0 },
    { step: 'F', alter: 1 },
    { step: 'G', alter: 0 },
    { step: 'G', alter: 1 },
    { step: 'A', alter: 0 },
    { step: 'A', alter: 1 },
    { step: 'B', alter: 0 },
  ];

  const noteIndex = midi % 12;
  const octave = Math.floor(midi / 12) - 1;
  const note = noteNames[noteIndex];

  return {
    step: note.step,
    alter: note.alter,
    octave,
  };
}

/**
 * Convert velocity to dynamics marking
 */
export function velocityToDynamics(velocity: Velocity): DynamicsMarking {
  if (velocity < 16) return 'ppp';
  if (velocity < 32) return 'pp';
  if (velocity < 48) return 'p';
  if (velocity < 64) return 'mp';
  if (velocity < 80) return 'mf';
  if (velocity < 96) return 'f';
  if (velocity < 112) return 'ff';
  return 'fff';
}

/**
 * Duration type to MusicXML divisions
 */
export function durationTypeToMusicXML(
  type: NoteDurationType,
  divisionsPerQuarter: number
): { duration: number; type: string } {
  const multipliers: Record<NoteDurationType, number> = {
    whole: 4,
    half: 2,
    quarter: 1,
    eighth: 0.5,
    '16th': 0.25,
    '32nd': 0.125,
    '64th': 0.0625,
  };

  return {
    duration: Math.round(multipliers[type] * divisionsPerQuarter),
    type,
  };
}
