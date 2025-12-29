import { describe, it, expect } from 'vitest';
import { parsePianoScript } from './parser';
import { generatePianoScript } from './generator';
import type { NoteEvent } from './types';

describe('PianoScript Language Engine', () => {
  it('should parse a valid script correctly', () => {
    const script = `
      C4 @ 0.0s for 1.0s
      E4 @ 0.5s for 0.5s
    `;
    const events = parsePianoScript(script);
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ note: 'C', octave: 4, startTime: 0, duration: 1 });
    expect(events[1]).toEqual({ note: 'E', octave: 4, startTime: 0.5, duration: 0.5 });
  });

  it('should ignore invalid lines and comments', () => {
    const script = `
      // This is a comment
      # Another comment
      InvalidLine
      G4 @ 1.0s for 1.0s
    `;
    const events = parsePianoScript(script);
    expect(events).toHaveLength(1);
    expect(events[0].note).toBe('G');
  });

  it('should generate a script from events', () => {
    const events: NoteEvent[] = [
      { note: 'A', octave: 4, startTime: 0, duration: 1 },
      { note: 'B', octave: 4, startTime: 1, duration: 1 },
    ];
    const script = generatePianoScript(events);
    expect(script).toContain('A4 @ 0.000s for 1.000s');
    expect(script).toContain('B4 @ 1.000s for 1.000s');
  });

  it('should be reversible (parse -> generate -> parse)', () => {
    const originalScript = "C4 @ 0.000s for 1.000s\nD4 @ 1.000s for 1.000s";
    const events = parsePianoScript(originalScript);
    const generated = generatePianoScript(events);
    expect(generated).toBe(originalScript);
  });
});
