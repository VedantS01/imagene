export interface NoteEvent {
  note: string;      // e.g., "C", "D#", "Fb"
  octave: number;    // e.g., 4
  startTime: number; // in seconds
  duration: number;  // in seconds
}

export type PianoScript = NoteEvent[];
