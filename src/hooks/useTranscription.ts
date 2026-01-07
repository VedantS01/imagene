/**
 * useTranscription - Custom hook for managing the transcription pipeline
 * 
 * This hook orchestrates:
 * - Audio engine initialization
 * - Processing worker communication
 * - Note detection and quantization
 * - MusicXML generation
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store';
import { AudioEngine, getAudioEngine } from '../audio';
import { getQuantizer, generateMusicXML } from '../music';
import type { 
  WorkerOutboundMessage, 
  TranscriptionError 
} from '../types';

/**
 * Return type for the useTranscription hook
 */
export interface TranscriptionController {
  /** Start recording and transcription */
  start: () => Promise<void>;
  /** Stop recording and finalize transcription */
  stop: () => void;
  /** Clear all transcription data */
  clear: () => void;
  /** Export the generated MusicXML */
  exportMusicXML: () => string | null;
  /** Current recording state */
  isRecording: boolean;
  /** Whether the system is initializing */
  isInitializing: boolean;
  /** Current error if any */
  error: string | null;
  /** Current buffer health (0-1) */
  bufferHealth: number;
}

/**
 * Custom hook for transcription management
 */
export function useTranscription(): TranscriptionController {
  const audioEngineRef = useRef<AudioEngine | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  
  // Get store state and actions
  const recordingState = useAppStore((s) => s.recordingState);
  const bufferHealth = useAppStore((s) => s.bufferHealth);
  const error = useAppStore((s) => s.error);
  const isAutoDetectBpm = useAppStore((s) => s.isAutoDetectBpm);
  
  const setRecordingState = useAppStore((s) => s.setRecordingState);
  const setBufferHealth = useAppStore((s) => s.setBufferHealth);
  const setError = useAppStore((s) => s.setError);
  const addNotes = useAppStore((s) => s.addNotes);
  const clearNotes = useAppStore((s) => s.clearNotes);
  const setPianoRollData = useAppStore((s) => s.setPianoRollData);
  const setQuantizedNotes = useAppStore((s) => s.setQuantizedNotes);
  const setMusicXML = useAppStore((s) => s.setMusicXML);
  const setBpm = useAppStore((s) => s.setBpm);
  
  /**
   * Initialize the processing worker
   */
  const initializeWorker = useCallback(() => {
    if (workerRef.current) {
      return workerRef.current;
    }
    
    const worker = new Worker(
      new URL('../workers/Processor.worker.ts', import.meta.url),
      { type: 'module' }
    );
    
    worker.onmessage = (event: MessageEvent<WorkerOutboundMessage>) => {
      const message = event.data;
      
      switch (message.type) {
        case 'READY':
          console.log('Processing worker ready');
          break;
          
        case 'NOTES_DETECTED':
          addNotes(message.notes);
          break;
          
        case 'PIANO_ROLL_UPDATE':
          setPianoRollData(message.pianoRoll);
          break;
          
        case 'BUFFER_HEALTH':
          setBufferHealth(message.health);
          break;
          
        case 'BEAT_DETECTED':
          if (isAutoDetectBpm) {
            setBpm(message.bpm);
          }
          break;
          
        case 'ERROR':
          setError(message.message);
          console.error('Worker error:', message.message);
          break;
      }
    };
    
    worker.onerror = (error) => {
      console.error('Worker error:', error);
      setError(`Worker error: ${error.message}`);
    };
    
    workerRef.current = worker;
    return worker;
  }, [addNotes, setPianoRollData, setBufferHealth, setBpm, setError, isAutoDetectBpm]);
  
  /**
   * Start recording and transcription
   */
  const start = useCallback(async () => {
    if (recordingState === 'recording') {
      return;
    }
    
    setIsInitializing(true);
    setError(null);
    setRecordingState('initializing');
    
    try {
      // Initialize audio engine
      const audioEngine = getAudioEngine();
      audioEngineRef.current = audioEngine;
      
      // Initialize worker
      const worker = initializeWorker();
      
      // Set up worker communication
      audioEngine.setProcessingWorker(worker);
      
      // Set up audio engine events
      audioEngine.on('error', (err: TranscriptionError) => {
        setError(err.message);
        setRecordingState('error');
      });
      
      audioEngine.on('bufferHealth', (health: number) => {
        setBufferHealth(health);
      });
      
      // Start recording
      await audioEngine.startRecording();
      
      setRecordingState('recording');
      setIsInitializing(false);
      
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start recording';
      setError(message);
      setRecordingState('error');
      setIsInitializing(false);
    }
  }, [recordingState, initializeWorker, setRecordingState, setError, setBufferHealth]);
  
  /**
   * Stop recording and finalize transcription
   */
  const stop = useCallback(() => {
    if (recordingState !== 'recording') {
      return;
    }
    
    setRecordingState('processing');
    
    // Stop audio engine
    if (audioEngineRef.current) {
      audioEngineRef.current.stopRecording();
    }
    
    // Stop worker
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'STOP' });
    }
    
    // Process collected notes
    setTimeout(() => {
      finalizeTranscription();
    }, 100);
  }, [recordingState, setRecordingState]);
  
  /**
   * Finalize transcription - quantize notes and generate MusicXML
   */
  const finalizeTranscription = useCallback(() => {
    const notes = useAppStore.getState().detectedNotes;
    const currentBpm = useAppStore.getState().bpm;
    const currentTimeSignature = useAppStore.getState().timeSignature;
    
    if (notes.length === 0) {
      setRecordingState('idle');
      return;
    }
    
    // Quantize notes
    const quantizer = getQuantizer({
      bpm: currentBpm,
      timeSignature: currentTimeSignature,
    });
    
    // Auto-detect BPM if enabled
    if (useAppStore.getState().isAutoDetectBpm) {
      notes.forEach(note => quantizer.addOnset(note.startTime));
      const detectedBpm = quantizer.autoDetectBPM();
      setBpm(detectedBpm);
      quantizer.setBPM(detectedBpm);
    }
    
    const quantized = quantizer.quantizeNotes(notes);
    setQuantizedNotes(quantized);
    
    // Generate MusicXML
    const xml = generateMusicXML(quantized, {
      bpm: quantizer.getBPM(),
      timeSignature: currentTimeSignature,
      title: 'Piano Transcription',
      composer: 'Imagene',
    });
    
    setMusicXML(xml);
    setRecordingState('idle');
  }, [setRecordingState, setQuantizedNotes, setMusicXML, setBpm]);
  
  /**
   * Clear all transcription data
   */
  const clear = useCallback(() => {
    clearNotes();
    setPianoRollData(null);
    setError(null);
  }, [clearNotes, setPianoRollData, setError]);
  
  /**
   * Export MusicXML
   */
  const exportMusicXML = useCallback(() => {
    return useAppStore.getState().musicXML;
  }, []);
  
  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      
      if (audioEngineRef.current) {
        audioEngineRef.current.dispose();
        audioEngineRef.current = null;
      }
    };
  }, []);
  
  return {
    start,
    stop,
    clear,
    exportMusicXML,
    isRecording: recordingState === 'recording',
    isInitializing,
    error,
    bufferHealth,
  };
}
