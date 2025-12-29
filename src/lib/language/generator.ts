import type { PianoScript } from './types';

/**
 * Generates a PianoScript string from an array of NoteEvents.
 */
export function generatePianoScript(events: PianoScript): string {
  return events
    .map(event => {
      return `${event.note}${event.octave} @ ${event.startTime.toFixed(3)}s for ${event.duration.toFixed(3)}s`;
    })
    .join('\n');
}
