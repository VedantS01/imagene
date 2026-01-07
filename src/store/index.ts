/**
 * Application State Store using Zustand
 * 
 * Manages global application state including:
 * - Recording state
 * - Detected notes
 * - MusicXML output
 * - Settings and configuration
 */

import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import type {
  AppState,
  RecordingState,
  DetectedNote,
  QuantizedNote,
  TimeSignature,
} from '../types';

/**
 * Initial state values
 */
const initialState = {
  recordingState: 'idle' as RecordingState,
  bufferHealth: 0,
  detectedNotes: [] as DetectedNote[],
  quantizedNotes: [] as QuantizedNote[],
  musicXML: null as string | null,
  bpm: 120,
  isAutoDetectBpm: true,
  timeSignature: { beats: 4, beatType: 4 } as TimeSignature,
  onsetThreshold: 0.8,
  offsetThreshold: 0.3,
  error: null as string | null,
  pianoRollData: null as Float32Array | null,
};

/**
 * Create the Zustand store
 */
export const useAppStore = create<AppState>()(
  devtools(
    subscribeWithSelector((set, _get) => ({
      // State
      ...initialState,

      // Actions
      setRecordingState: (state: RecordingState) => 
        set({ recordingState: state }, false, 'setRecordingState'),

      setBufferHealth: (health: number) => 
        set({ bufferHealth: health }, false, 'setBufferHealth'),

      addNotes: (notes: DetectedNote[]) =>
        set(
          (state) => ({
            detectedNotes: [...state.detectedNotes, ...notes],
          }),
          false,
          'addNotes'
        ),

      clearNotes: () =>
        set(
          { 
            detectedNotes: [], 
            quantizedNotes: [],
            musicXML: null 
          },
          false,
          'clearNotes'
        ),

      setQuantizedNotes: (notes: QuantizedNote[]) =>
        set({ quantizedNotes: notes }, false, 'setQuantizedNotes'),

      setMusicXML: (xml: string | null) =>
        set({ musicXML: xml }, false, 'setMusicXML'),

      setBpm: (bpm: number) =>
        set({ bpm }, false, 'setBpm'),

      setAutoDetectBpm: (auto: boolean) =>
        set({ isAutoDetectBpm: auto }, false, 'setAutoDetectBpm'),

      setTimeSignature: (ts: TimeSignature) =>
        set({ timeSignature: ts }, false, 'setTimeSignature'),

      setThresholds: (onset: number, offset: number) =>
        set(
          { onsetThreshold: onset, offsetThreshold: offset },
          false,
          'setThresholds'
        ),

      setError: (error: string | null) =>
        set({ error }, false, 'setError'),

      setPianoRollData: (data: Float32Array | null) =>
        set({ pianoRollData: data }, false, 'setPianoRollData'),
    })),
    { name: 'ImageneStore' }
  )
);

/**
 * Selector hooks for specific state slices
 */
export const useRecordingState = () => useAppStore((state) => state.recordingState);
export const useBufferHealth = () => useAppStore((state) => state.bufferHealth);
export const useDetectedNotes = () => useAppStore((state) => state.detectedNotes);
export const useQuantizedNotes = () => useAppStore((state) => state.quantizedNotes);
export const useMusicXML = () => useAppStore((state) => state.musicXML);
export const useBpm = () => useAppStore((state) => state.bpm);
export const useTimeSignature = () => useAppStore((state) => state.timeSignature);
export const useError = () => useAppStore((state) => state.error);
export const usePianoRollData = () => useAppStore((state) => state.pianoRollData);

/**
 * Action hooks
 */
export const useAppActions = () => ({
  setRecordingState: useAppStore((state) => state.setRecordingState),
  setBufferHealth: useAppStore((state) => state.setBufferHealth),
  addNotes: useAppStore((state) => state.addNotes),
  clearNotes: useAppStore((state) => state.clearNotes),
  setQuantizedNotes: useAppStore((state) => state.setQuantizedNotes),
  setMusicXML: useAppStore((state) => state.setMusicXML),
  setBpm: useAppStore((state) => state.setBpm),
  setAutoDetectBpm: useAppStore((state) => state.setAutoDetectBpm),
  setTimeSignature: useAppStore((state) => state.setTimeSignature),
  setThresholds: useAppStore((state) => state.setThresholds),
  setError: useAppStore((state) => state.setError),
  setPianoRollData: useAppStore((state) => state.setPianoRollData),
});

/**
 * Reset store to initial state
 */
export const resetStore = () => {
  useAppStore.setState(initialState);
};
