/**
 * MusicXML Generator
 * 
 * Converts quantized notes into valid MusicXML format
 * for rendering with OpenSheetMusicDisplay.
 */

import type {
  QuantizedNote,
  NoteDurationType,
  TimeSignature,
  DynamicsMarking,
} from '../types';
import { midiToPitchInfo, velocityToDynamics } from '../types';

/**
 * MusicXML generation options
 */
export interface MusicXMLOptions {
  /** Title of the piece */
  title: string;
  /** Composer name */
  composer: string;
  /** Time signature */
  timeSignature: TimeSignature;
  /** Key signature (-7 to 7) */
  keySignature: number;
  /** Divisions per quarter note (higher = more precision) */
  divisions: number;
  /** BPM for tempo marking */
  bpm: number;
  /** Whether to include dynamics */
  includeDynamics: boolean;
}

const DEFAULT_OPTIONS: MusicXMLOptions = {
  title: 'Transcription',
  composer: 'Imagene',
  timeSignature: { beats: 4, beatType: 4 },
  keySignature: 0,
  divisions: 16, // Allows up to 64th notes
  bpm: 120,
  includeDynamics: true,
};

/**
 * MusicXML Generator class
 */
export class MusicXMLGenerator {
  private options: MusicXMLOptions;
  
  constructor(options: Partial<MusicXMLOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }
  
  /**
   * Update options
   */
  setOptions(options: Partial<MusicXMLOptions>): void {
    this.options = { ...this.options, ...options };
  }
  
  /**
   * Generate MusicXML from quantized notes
   */
  generate(notes: QuantizedNote[]): string {
    if (notes.length === 0) {
      return this.generateEmptyScore();
    }
    
    // Sort notes by start beat
    const sorted = [...notes].sort((a, b) => a.startBeat - b.startBeat);
    
    // Group notes into measures
    const measures = this.groupIntoMeasures(sorted);
    
    // Build XML
    const xml = this.buildXML(measures);
    
    return xml;
  }
  
  /**
   * Generate an empty score
   */
  private generateEmptyScore(): string {
    return this.buildXML([]);
  }
  
  /**
   * Group notes into measures based on time signature
   */
  private groupIntoMeasures(notes: QuantizedNote[]): QuantizedNote[][] {
    const beatsPerMeasure = this.options.timeSignature.beats;
    const measures: QuantizedNote[][] = [];
    
    if (notes.length === 0) {
      return [[]];
    }
    
    // Find the total duration
    const lastNote = notes[notes.length - 1];
    const totalBeats = lastNote.startBeat + lastNote.durationBeats;
    const numMeasures = Math.ceil(totalBeats / beatsPerMeasure);
    
    // Initialize measures
    for (let i = 0; i < Math.max(numMeasures, 1); i++) {
      measures.push([]);
    }
    
    // Assign notes to measures
    for (const note of notes) {
      const measureIndex = Math.floor(note.startBeat / beatsPerMeasure);
      if (measureIndex < measures.length) {
        // Adjust start beat to be relative to measure
        const adjustedNote = {
          ...note,
          startBeat: note.startBeat % beatsPerMeasure,
        };
        measures[measureIndex].push(adjustedNote);
      }
    }
    
    return measures;
  }
  
  /**
   * Build the complete MusicXML document
   */
  private buildXML(measures: QuantizedNote[][]): string {
    const { title, composer } = this.options;
    
    const measureXML = measures.map((notes, index) => 
      this.buildMeasure(notes, index + 1, index === 0)
    ).join('\n');
    
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work>
    <work-title>${this.escapeXML(title)}</work-title>
  </work>
  <identification>
    <creator type="composer">${this.escapeXML(composer)}</creator>
    <encoding>
      <software>Imagene Piano Transcription</software>
      <encoding-date>${new Date().toISOString().split('T')[0]}</encoding-date>
    </encoding>
  </identification>
  <part-list>
    <score-part id="P1">
      <part-name>Piano</part-name>
      <score-instrument id="P1-I1">
        <instrument-name>Piano</instrument-name>
      </score-instrument>
    </score-part>
  </part-list>
  <part id="P1">
${measureXML}
  </part>
</score-partwise>`;
  }
  
  /**
   * Build a single measure
   */
  private buildMeasure(notes: QuantizedNote[], measureNumber: number, isFirst: boolean): string {
    const { timeSignature, keySignature, divisions, bpm } = this.options;
    
    // Build attributes for first measure
    let attributesXML = '';
    if (isFirst) {
      attributesXML = `
      <attributes>
        <divisions>${divisions}</divisions>
        <key>
          <fifths>${keySignature}</fifths>
        </key>
        <time>
          <beats>${timeSignature.beats}</beats>
          <beat-type>${timeSignature.beatType}</beat-type>
        </time>
        <clef>
          <sign>G</sign>
          <line>2</line>
        </clef>
      </attributes>
      <direction placement="above">
        <direction-type>
          <metronome>
            <beat-unit>quarter</beat-unit>
            <per-minute>${bpm}</per-minute>
          </metronome>
        </direction-type>
      </direction>`;
    }
    
    // Sort notes by start beat
    const sorted = [...notes].sort((a, b) => a.startBeat - b.startBeat);
    
    // Build note elements
    let notesXML = '';
    let currentBeat = 0;
    let lastDynamics: DynamicsMarking | null = null;
    
    // Group simultaneous notes (chords)
    const noteGroups: QuantizedNote[][] = [];
    let currentGroup: QuantizedNote[] = [];
    
    for (const note of sorted) {
      if (currentGroup.length === 0 || 
          Math.abs(note.startBeat - currentGroup[0].startBeat) < 0.001) {
        currentGroup.push(note);
      } else {
        if (currentGroup.length > 0) {
          noteGroups.push(currentGroup);
        }
        currentGroup = [note];
      }
    }
    if (currentGroup.length > 0) {
      noteGroups.push(currentGroup);
    }
    
    // Process note groups
    for (const group of noteGroups) {
      const firstNote = group[0];
      
      // Add rest if there's a gap
      const gapBeats = firstNote.startBeat - currentBeat;
      if (gapBeats > 0.001) {
        notesXML += this.buildRest(gapBeats);
      }
      
      // Add dynamics if changed
      if (this.options.includeDynamics) {
        const dynamics = velocityToDynamics(firstNote.velocity);
        if (dynamics !== lastDynamics) {
          notesXML += this.buildDynamics(dynamics);
          lastDynamics = dynamics;
        }
      }
      
      // Build notes in the group
      for (let i = 0; i < group.length; i++) {
        const note = group[i];
        notesXML += this.buildNote(note, i > 0);
      }
      
      currentBeat = firstNote.startBeat + firstNote.durationBeats;
    }
    
    // Fill remaining time in measure with rest
    const beatsPerMeasure = this.options.timeSignature.beats;
    const remainingBeats = beatsPerMeasure - currentBeat;
    if (remainingBeats > 0.001 && notes.length > 0) {
      notesXML += this.buildRest(remainingBeats);
    } else if (notes.length === 0) {
      // Empty measure - add whole rest
      notesXML += this.buildWholeRest();
    }
    
    return `    <measure number="${measureNumber}">${attributesXML}${notesXML}
    </measure>`;
  }
  
  /**
   * Build a single note element
   */
  private buildNote(note: QuantizedNote, isChord: boolean): string {
    const pitch = midiToPitchInfo(note.pitch);
    const duration = this.beatsToDivisions(note.durationBeats);
    const type = this.durationTypeToXML(note.durationType);
    
    let chordTag = isChord ? '\n        <chord/>' : '';
    let dotTag = note.isDotted ? '\n        <dot/>' : '';
    let tieStartTag = note.tieToNext ? '\n        <tie type="start"/>' : '';
    
    // Determine stem direction based on pitch
    const stem = note.pitch >= 60 ? 'down' : 'up';
    
    return `
      <note>${chordTag}
        <pitch>
          <step>${pitch.step}</step>${pitch.alter !== 0 ? `
          <alter>${pitch.alter}</alter>` : ''}
          <octave>${pitch.octave}</octave>
        </pitch>
        <duration>${duration}</duration>
        <type>${type}</type>${dotTag}
        <stem>${stem}</stem>${tieStartTag}
      </note>`;
  }
  
  /**
   * Build a rest element
   */
  private buildRest(durationBeats: number): string {
    const duration = this.beatsToDivisions(durationBeats);
    const type = this.findClosestDurationType(durationBeats);
    
    return `
      <note>
        <rest/>
        <duration>${duration}</duration>
        <type>${type}</type>
      </note>`;
  }
  
  /**
   * Build a whole measure rest
   */
  private buildWholeRest(): string {
    const { divisions, timeSignature } = this.options;
    const duration = timeSignature.beats * divisions;
    
    return `
      <note>
        <rest measure="yes"/>
        <duration>${duration}</duration>
      </note>`;
  }
  
  /**
   * Build dynamics direction
   */
  private buildDynamics(dynamics: DynamicsMarking): string {
    return `
      <direction placement="below">
        <direction-type>
          <dynamics>
            <${dynamics}/>
          </dynamics>
        </direction-type>
      </direction>`;
  }
  
  /**
   * Convert beats to divisions
   */
  private beatsToDivisions(beats: number): number {
    return Math.round(beats * this.options.divisions);
  }
  
  /**
   * Convert duration type to MusicXML type name
   */
  private durationTypeToXML(type: NoteDurationType): string {
    const mapping: Record<NoteDurationType, string> = {
      'whole': 'whole',
      'half': 'half',
      'quarter': 'quarter',
      'eighth': 'eighth',
      '16th': '16th',
      '32nd': '32nd',
      '64th': '64th',
    };
    return mapping[type] || 'quarter';
  }
  
  /**
   * Find closest duration type for a beat value
   */
  private findClosestDurationType(beats: number): string {
    const durations: { type: string; beats: number }[] = [
      { type: 'whole', beats: 4 },
      { type: 'half', beats: 2 },
      { type: 'quarter', beats: 1 },
      { type: 'eighth', beats: 0.5 },
      { type: '16th', beats: 0.25 },
      { type: '32nd', beats: 0.125 },
      { type: '64th', beats: 0.0625 },
    ];
    
    let closest = durations[0];
    let minDiff = Math.abs(beats - closest.beats);
    
    for (const d of durations) {
      const diff = Math.abs(beats - d.beats);
      if (diff < minDiff) {
        minDiff = diff;
        closest = d;
      }
    }
    
    return closest.type;
  }
  
  /**
   * Escape special XML characters
   */
  private escapeXML(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

/**
 * Singleton instance
 */
let generatorInstance: MusicXMLGenerator | null = null;

export function getMusicXMLGenerator(options?: Partial<MusicXMLOptions>): MusicXMLGenerator {
  if (!generatorInstance) {
    generatorInstance = new MusicXMLGenerator(options);
  } else if (options) {
    generatorInstance.setOptions(options);
  }
  return generatorInstance;
}

export function resetMusicXMLGenerator(): void {
  generatorInstance = null;
}

/**
 * Convenience function to generate MusicXML from notes
 */
export function generateMusicXML(
  notes: QuantizedNote[],
  options?: Partial<MusicXMLOptions>
): string {
  const generator = getMusicXMLGenerator(options);
  return generator.generate(notes);
}
