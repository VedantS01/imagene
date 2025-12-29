import React, { useEffect, useRef } from 'react';
import { PianoPlayer } from '../../lib/audio';

interface WaveformVisualizerProps {
  player: PianoPlayer;
}

export const WaveformVisualizer: React.FC<WaveformVisualizerProps> = ({ player }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const width = canvas.width;
      const height = canvas.height;
      const data = player.getWaveformData();

      ctx.clearRect(0, 0, width, height);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#60a5fa'; // blue-400
      ctx.beginPath();

      const sliceWidth = width * 1.0 / data.length;
      let x = 0;

      for (let i = 0; i < data.length; i++) {
        const v = data[i]; // -1 to 1
        const y = (v + 1) / 2 * height;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();

      requestRef.current = requestAnimationFrame(draw);
    };

    // Always draw to show idle state or active state
    requestRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(requestRef.current);
    };
  }, [player]);

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={100}
      className="w-full h-24 bg-gray-900 rounded-lg border border-gray-700 shadow-inner"
    />
  );
};
