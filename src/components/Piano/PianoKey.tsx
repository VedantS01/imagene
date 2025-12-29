import React from 'react';

interface PianoKeyProps {
  note: string; // e.g., "C", "D#", "E"
  octave: number;
  isBlack: boolean;
  isActive: boolean;
  onMouseDown: (note: string, octave: number) => void;
  onMouseUp: (note: string, octave: number) => void;
}

export const PianoKey: React.FC<PianoKeyProps> = ({
  note,
  octave,
  isBlack,
  isActive,
  onMouseDown,
  onMouseUp,
}) => {
  const baseClass = isBlack
    ? "w-8 h-32 -mx-4 z-10 text-white bg-black border border-gray-800 rounded-b-md"
    : "w-12 h-48 bg-white text-black border border-gray-300 rounded-b-md z-0";
  
  const activeClass = isActive
    ? "bg-yellow-400 !text-black" // Yellow highlight, force black text for visibility
    : "";

  return (
    <div
      className={`${baseClass} ${activeClass} flex items-end justify-center pb-2 select-none cursor-pointer relative transition-colors duration-75`}
      onMouseDown={() => onMouseDown(note, octave)}
      onMouseUp={() => onMouseUp(note, octave)}
      onMouseLeave={() => onMouseUp(note, octave)}
    >
      <span className="text-xs font-bold pointer-events-none">
        {note}{octave}
      </span>
    </div>
  );
};
