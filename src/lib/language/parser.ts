import type { PianoScript } from './types';

/**
 * Parses a PianoScript string into an array of NoteEvents.
 * Expected syntax per line: "NoteOctave @ StartTime s for Duration s"
 * Example: "C4 @ 0.5s for 1.0s"
 */
export function parsePianoScript(script: string): PianoScript {
  const lines = script.split('\n');
  const events: PianoScript = [];

  const regex = /^([A-G][#b]?)(\d+)\s*@\s*([\d.]+)\s*s\s*for\s*([\d.]+)\s*s$/i;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) continue;

    const match = trimmed.match(regex);
    if (match) {
      const [, note, octaveStr, startStr, durationStr] = match;
      events.push({
        note: note.toUpperCase(),
        octave: parseInt(octaveStr, 10),
        startTime: parseFloat(startStr),
        duration: parseFloat(durationStr),
      });
    } else {
      console.warn(`Invalid PianoScript line ignored: "${trimmed}"`);
    }
  }

  // Sort events by start time
  return events.sort((a, b) => a.startTime - b.startTime);
}
