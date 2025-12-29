import React from 'react';
import { PianoKey } from './PianoKey';

interface PianoProps {
  activeNotes: Set<string>;
  onNoteDown: (note: string, octave: number) => void;
  onNoteUp: (note: string, octave: number) => void;
}

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const Piano: React.FC<PianoProps> = ({ activeNotes, onNoteDown, onNoteUp }) => {
  // Generate full 88-key range: A0 to C8
  const keys = [];
  
  // A0, A#0, B0
  ['A', 'A#', 'B'].forEach(note => keys.push({ note, octave: 0 }));

  // Octaves 1 to 7
  for (let octave = 1; octave <= 7; octave++) {
    NOTES.forEach(note => keys.push({ note, octave }));
  }

  // C8
  keys.push({ note: 'C', octave: 8 });

  return (
    <div className="flex justify-center items-start p-4 bg-gray-100 rounded-lg shadow-inner overflow-x-auto w-full">
      <div className="flex relative min-w-max">
        {keys.map(({ note, octave }) => {
          const isBlack = note.includes('#');
          return (
            <PianoKey
              key={`${note}${octave}`}
              note={note}
              octave={octave}
              isBlack={isBlack}
              isActive={activeNotes.has(`${note}${octave}`)}
              onMouseDown={onNoteDown}
              onMouseUp={onNoteUp}
            />
          );
        })}
      </div>
    </div>
  );
};
