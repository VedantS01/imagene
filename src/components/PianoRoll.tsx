/**
 * PianoRoll - Real-time visualization of detected notes
 * 
 * Renders a scrolling piano roll visualization showing
 * active notes and their probabilities.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { usePianoRollData, useDetectedNotes } from '../store';

interface PianoRollProps {
  width?: number;
  height?: number;
  className?: string;
}

const PIANO_MIN_MIDI = 21;
// PIANO_MAX_MIDI = 108 (unused, kept for reference)
const NUM_KEYS = 88;

const KEY_COLORS = {
  white: '#f8f8f8',
  black: '#333',
  activeWhite: '#4CAF50',
  activeBlack: '#388E3C',
  background: '#1a1a2e',
  gridLine: '#2a2a4e',
};

/**
 * Check if a MIDI note is a black key
 */
function isBlackKey(midi: number): boolean {
  const note = midi % 12;
  return [1, 3, 6, 8, 10].includes(note);
}

/**
 * PianoRoll component
 */
export const PianoRoll: React.FC<PianoRollProps> = ({
  width = 800,
  height = 400,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const pianoRollData = usePianoRollData();
  const detectedNotes = useDetectedNotes();
  
  // Piano keyboard width
  const keyboardWidth = 60;
  const rollWidth = width - keyboardWidth;
  const keyHeight = height / NUM_KEYS;
  
  /**
   * Draw the piano keyboard on the left
   */
  const drawKeyboard = useCallback((ctx: CanvasRenderingContext2D) => {
    for (let i = 0; i < NUM_KEYS; i++) {
      const midi = PIANO_MIN_MIDI + (NUM_KEYS - 1 - i);
      const y = i * keyHeight;
      const isBlack = isBlackKey(midi);
      
      // Check if this key is active
      const isActive = detectedNotes.some(
        (note) => note.pitch === midi && note.isActive
      );
      
      // Draw key
      if (isBlack) {
        ctx.fillStyle = isActive ? KEY_COLORS.activeBlack : KEY_COLORS.black;
        ctx.fillRect(0, y, keyboardWidth * 0.7, keyHeight);
      } else {
        ctx.fillStyle = isActive ? KEY_COLORS.activeWhite : KEY_COLORS.white;
        ctx.fillRect(0, y, keyboardWidth, keyHeight);
        ctx.strokeStyle = '#ccc';
        ctx.strokeRect(0, y, keyboardWidth, keyHeight);
      }
      
      // Label for C notes
      if (midi % 12 === 0) {
        ctx.fillStyle = isBlack ? '#fff' : '#333';
        ctx.font = '10px sans-serif';
        ctx.fillText(`C${Math.floor(midi / 12) - 1}`, 2, y + keyHeight - 2);
      }
    }
  }, [keyHeight, detectedNotes]);
  
  /**
   * Draw the note roll area
   */
  const drawRoll = useCallback((ctx: CanvasRenderingContext2D) => {
    // Background
    ctx.fillStyle = KEY_COLORS.background;
    ctx.fillRect(keyboardWidth, 0, rollWidth, height);
    
    // Grid lines for each key
    ctx.strokeStyle = KEY_COLORS.gridLine;
    ctx.lineWidth = 0.5;
    for (let i = 0; i < NUM_KEYS; i++) {
      const y = i * keyHeight;
      ctx.beginPath();
      ctx.moveTo(keyboardWidth, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    
    // Draw active notes from piano roll data
    if (pianoRollData && pianoRollData.length > 0) {
      const numFrames = Math.floor(pianoRollData.length / NUM_KEYS);
      const frameWidth = rollWidth / Math.max(numFrames, 1);
      
      for (let frame = 0; frame < numFrames; frame++) {
        for (let pitch = 0; pitch < NUM_KEYS; pitch++) {
          const probability = pianoRollData[frame * NUM_KEYS + pitch];
          
          if (probability > 0.1) {
            const midi = PIANO_MIN_MIDI + pitch;
            const keyIndex = NUM_KEYS - 1 - (midi - PIANO_MIN_MIDI);
            const x = keyboardWidth + frame * frameWidth;
            const y = keyIndex * keyHeight;
            
            // Color based on probability
            ctx.fillStyle = `rgba(76, 175, 80, ${probability})`;
            ctx.fillRect(x, y, frameWidth + 1, keyHeight);
          }
        }
      }
    }
    
    // Draw detected notes
    const now = Date.now() / 1000;
    const visibleDuration = 5; // 5 seconds visible
    
    for (const note of detectedNotes) {
      const noteStart = note.startTime;
      const noteEnd = note.endTime ?? now;
      
      // Calculate x position based on time
      const startX = keyboardWidth + ((now - noteStart) / visibleDuration) * rollWidth;
      const endX = keyboardWidth + ((now - noteEnd) / visibleDuration) * rollWidth;
      
      // Skip if not visible
      if (endX > width || startX < keyboardWidth) continue;
      
      const keyIndex = NUM_KEYS - 1 - (note.pitch - PIANO_MIN_MIDI);
      const y = keyIndex * keyHeight;
      const noteWidth = Math.max(startX - endX, 2);
      
      // Draw note block
      const isBlack = isBlackKey(note.pitch);
      ctx.fillStyle = note.isActive
        ? (isBlack ? KEY_COLORS.activeBlack : KEY_COLORS.activeWhite)
        : 'rgba(76, 175, 80, 0.7)';
      
      ctx.fillRect(endX, y + 1, noteWidth, keyHeight - 2);
      
      // Border
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.strokeRect(endX, y + 1, noteWidth, keyHeight - 2);
    }
  }, [pianoRollData, detectedNotes, keyboardWidth, rollWidth, height, keyHeight, width]);
  
  /**
   * Main render loop
   */
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Draw components
    drawKeyboard(ctx);
    drawRoll(ctx);
    
    // Continue animation loop
    animationRef.current = requestAnimationFrame(render);
  }, [width, height, drawKeyboard, drawRoll]);
  
  /**
   * Start/stop animation loop
   */
  useEffect(() => {
    animationRef.current = requestAnimationFrame(render);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [render]);
  
  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={`piano-roll ${className}`}
      style={{
        borderRadius: '8px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
      }}
    />
  );
};

export default PianoRoll;
