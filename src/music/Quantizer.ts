/**
 * Quantizer - Convert detected notes to musical time
 * 
 * This module handles:
 * - Beat detection and tempo estimation
 * - Note quantization to musical grid
 * - Duration type assignment
 * - Handling ties and complex rhythms
 */

import type {
  DetectedNote,
  QuantizedNote,
  NoteDurationType,
  TimeSignature,
} from '../types';

/**
 * Duration grid values in beats
 */
const DURATION_GRID: { type: NoteDurationType; beats: number }[] = [
  { type: 'whole', beats: 4 },
  { type: 'half', beats: 2 },
  { type: 'quarter', beats: 1 },
  { type: 'eighth', beats: 0.5 },
  { type: '16th', beats: 0.25 },
  { type: '32nd', beats: 0.125 },
  { type: '64th', beats: 0.0625 },
];

/**
 * Dotted duration multiplier
 */
const DOTTED_MULTIPLIER = 1.5;

/**
 * Configuration for the quantizer
 */
export interface QuantizerConfig {
  /** Beats per minute */
  bpm: number;
  /** Time signature */
  timeSignature: TimeSignature;
  /** Snap tolerance (0-1, percentage of grid unit) */
  snapTolerance: number;
  /** Minimum quantization unit (in beats) */
  minQuantization: number;
  /** Whether to detect triplets */
  detectTriplets: boolean;
}

const DEFAULT_CONFIG: QuantizerConfig = {
  bpm: 120,
  timeSignature: { beats: 4, beatType: 4 },
  snapTolerance: 0.3,
  minQuantization: 0.0625, // 64th note
  detectTriplets: false,
};

/**
 * Simple beat detector using onset intervals
 */
export class BeatDetector {
  private onsetTimes: number[] = [];
  private readonly maxOnsets: number = 100;
  
  /**
   * Add an onset time
   */
  addOnset(time: number): void {
    this.onsetTimes.push(time);
    
    // Keep only recent onsets
    if (this.onsetTimes.length > this.maxOnsets) {
      this.onsetTimes.shift();
    }
  }
  
  /**
   * Estimate BPM from onset intervals
   */
  estimateBPM(): number {
    if (this.onsetTimes.length < 4) {
      return 120; // Default
    }
    
    // Calculate inter-onset intervals
    const intervals: number[] = [];
    for (let i = 1; i < this.onsetTimes.length; i++) {
      intervals.push(this.onsetTimes[i] - this.onsetTimes[i - 1]);
    }
    
    // Filter out very short and very long intervals
    const minInterval = 0.2; // 300 BPM max
    const maxInterval = 2.0; // 30 BPM min
    const validIntervals = intervals.filter(
      i => i >= minInterval && i <= maxInterval
    );
    
    if (validIntervals.length === 0) {
      return 120;
    }
    
    // Find clusters of similar intervals using histogram
    const histogram = new Map<number, number>();
    const binSize = 0.05; // 50ms bins
    
    for (const interval of validIntervals) {
      const bin = Math.round(interval / binSize);
      histogram.set(bin, (histogram.get(bin) || 0) + 1);
    }
    
    // Find most common interval
    let maxCount = 0;
    let dominantBin = 0;
    histogram.forEach((count, bin) => {
      if (count > maxCount) {
        maxCount = count;
        dominantBin = bin;
      }
    });
    
    const dominantInterval = dominantBin * binSize;
    
    // Convert to BPM (considering it might be 1/2, 1/4, etc. of the beat)
    let bpm = 60 / dominantInterval;
    
    // Normalize to typical range (60-180 BPM)
    while (bpm < 60) bpm *= 2;
    while (bpm > 180) bpm /= 2;
    
    return Math.round(bpm);
  }
  
  /**
   * Reset the detector
   */
  reset(): void {
    this.onsetTimes = [];
  }
}

/**
 * Note quantizer for converting raw timings to musical notation
 */
export class NoteQuantizer {
  private config: QuantizerConfig;
  private beatDetector: BeatDetector;
  
  constructor(config: Partial<QuantizerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.beatDetector = new BeatDetector();
  }
  
  /**
   * Update configuration
   */
  setConfig(config: Partial<QuantizerConfig>): void {
    this.config = { ...this.config, ...config };
  }
  
  /**
   * Get current BPM
   */
  getBPM(): number {
    return this.config.bpm;
  }
  
  /**
   * Set BPM
   */
  setBPM(bpm: number): void {
    this.config.bpm = bpm;
  }
  
  /**
   * Add onset time for BPM detection
   */
  addOnset(time: number): void {
    this.beatDetector.addOnset(time);
  }
  
  /**
   * Auto-detect BPM from collected onsets
   */
  autoDetectBPM(): number {
    return this.beatDetector.estimateBPM();
  }
  
  /**
   * Convert time in seconds to beats
   */
  timeToBeat(timeSeconds: number): number {
    return (timeSeconds * this.config.bpm) / 60;
  }
  
  /**
   * Snap a beat position to the quantization grid
   */
  snapToGrid(beat: number): number {
    const gridUnit = this.config.minQuantization;
    const gridPosition = Math.round(beat / gridUnit);
    const snappedBeat = gridPosition * gridUnit;
    
    // Check if within tolerance
    const offset = Math.abs(beat - snappedBeat);
    const tolerance = gridUnit * this.config.snapTolerance;
    
    if (offset <= tolerance) {
      return snappedBeat;
    }
    
    // If not within tolerance, might be a swing or triplet feel
    if (this.config.detectTriplets) {
      const tripletGrid = gridUnit * 2 / 3;
      const tripletPosition = Math.round(beat / tripletGrid);
      const snappedTriplet = tripletPosition * tripletGrid;
      const tripletOffset = Math.abs(beat - snappedTriplet);
      
      if (tripletOffset < offset) {
        return snappedTriplet;
      }
    }
    
    return snappedBeat;
  }
  
  /**
   * Find the best duration type for a beat duration
   */
  findDurationType(durationBeats: number): {
    type: NoteDurationType;
    isDotted: boolean;
    remainderBeats: number;
  } {
    // Try regular durations
    for (const { type, beats } of DURATION_GRID) {
      if (Math.abs(durationBeats - beats) < this.config.minQuantization * 0.5) {
        return { type, isDotted: false, remainderBeats: 0 };
      }
    }
    
    // Try dotted durations
    for (const { type, beats } of DURATION_GRID) {
      const dottedBeats = beats * DOTTED_MULTIPLIER;
      if (Math.abs(durationBeats - dottedBeats) < this.config.minQuantization * 0.5) {
        return { type, isDotted: true, remainderBeats: 0 };
      }
    }
    
    // Find closest fit with remainder for ties
    let bestFit = DURATION_GRID[0];
    let minDiff = Math.abs(durationBeats - bestFit.beats);
    
    for (const duration of DURATION_GRID) {
      const diff = Math.abs(durationBeats - duration.beats);
      if (diff < minDiff) {
        minDiff = diff;
        bestFit = duration;
      }
      
      // Also check dotted
      const dottedDiff = Math.abs(durationBeats - duration.beats * DOTTED_MULTIPLIER);
      if (dottedDiff < minDiff) {
        minDiff = dottedDiff;
        bestFit = duration;
      }
    }
    
    // If duration is longer than best fit, calculate remainder for tie
    const actualBeats = bestFit.beats;
    const remainder = durationBeats - actualBeats;
    
    return {
      type: bestFit.type,
      isDotted: false,
      remainderBeats: remainder > this.config.minQuantization ? remainder : 0,
    };
  }
  
  /**
   * Quantize a single note
   */
  quantizeNote(note: DetectedNote): QuantizedNote[] {
    // Add onset to beat detector for BPM tracking
    this.beatDetector.addOnset(note.startTime);
    
    // Convert to beats
    const startBeat = this.timeToBeat(note.startTime);
    const durationBeats = this.timeToBeat(note.duration);
    
    // Snap start to grid
    const snappedStart = this.snapToGrid(startBeat);
    
    // Quantize duration
    const snappedDuration = this.snapToGrid(durationBeats);
    const clampedDuration = Math.max(snappedDuration, this.config.minQuantization);
    
    // Find best duration type
    const { type, isDotted, remainderBeats } = this.findDurationType(clampedDuration);
    
    // If there's a remainder, we need to create tied notes
    const quantizedNotes: QuantizedNote[] = [];
    
    quantizedNotes.push({
      pitch: note.pitch,
      startBeat: snappedStart,
      durationBeats: isDotted 
        ? this.getDurationBeats(type) * DOTTED_MULTIPLIER 
        : this.getDurationBeats(type),
      durationType: type,
      isDotted,
      velocity: note.velocity,
      tieToNext: remainderBeats > 0,
    });
    
    // Handle ties for long notes
    if (remainderBeats > 0) {
      const tiedNotes = this.createTiedNotes(
        note.pitch,
        snappedStart + quantizedNotes[0].durationBeats,
        remainderBeats,
        note.velocity
      );
      quantizedNotes.push(...tiedNotes);
    }
    
    return quantizedNotes;
  }
  
  /**
   * Create tied notes for long durations
   */
  private createTiedNotes(
    pitch: number,
    startBeat: number,
    remainingBeats: number,
    velocity: number
  ): QuantizedNote[] {
    const notes: QuantizedNote[] = [];
    let currentBeat = startBeat;
    let remaining = remainingBeats;
    
    while (remaining > this.config.minQuantization) {
      const { type, isDotted } = this.findDurationType(remaining);
      const duration = isDotted
        ? this.getDurationBeats(type) * DOTTED_MULTIPLIER
        : this.getDurationBeats(type);
      
      notes.push({
        pitch,
        startBeat: currentBeat,
        durationBeats: Math.min(duration, remaining),
        durationType: type,
        isDotted,
        velocity,
        tieToNext: remaining - duration > this.config.minQuantization,
      });
      
      currentBeat += duration;
      remaining -= duration;
    }
    
    return notes;
  }
  
  /**
   * Get beats for a duration type
   */
  private getDurationBeats(type: NoteDurationType): number {
    const duration = DURATION_GRID.find(d => d.type === type);
    return duration ? duration.beats : 1;
  }
  
  /**
   * Quantize multiple notes
   */
  quantizeNotes(notes: DetectedNote[]): QuantizedNote[] {
    // Sort by start time
    const sorted = [...notes].sort((a, b) => a.startTime - b.startTime);
    
    // Quantize each note
    const quantized: QuantizedNote[] = [];
    for (const note of sorted) {
      quantized.push(...this.quantizeNote(note));
    }
    
    return quantized;
  }
  
  /**
   * Reset the quantizer
   */
  reset(): void {
    this.beatDetector.reset();
  }
}

/**
 * Singleton instance
 */
let quantizerInstance: NoteQuantizer | null = null;

export function getQuantizer(config?: Partial<QuantizerConfig>): NoteQuantizer {
  if (!quantizerInstance) {
    quantizerInstance = new NoteQuantizer(config);
  } else if (config) {
    quantizerInstance.setConfig(config);
  }
  return quantizerInstance;
}

export function resetQuantizer(): void {
  if (quantizerInstance) {
    quantizerInstance.reset();
  }
  quantizerInstance = null;
}
