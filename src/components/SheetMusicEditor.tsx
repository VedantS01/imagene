/**
 * SheetMusicEditor - Interactive sheet music editing with playback
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { OpenSheetMusicDisplay, IOSMDOptions } from 'opensheetmusicdisplay';
import { getPlaybackEngine, PlaybackEngine } from '../audio/PlaybackEngine';

interface SheetMusicEditorProps {
  musicXML: string;
  title?: string;
  onMusicXMLChange?: (xml: string) => void;
  readOnly?: boolean;
}

export const SheetMusicEditor: React.FC<SheetMusicEditorProps> = ({
  musicXML,
  title = 'Sheet Music',
  onMusicXMLChange: _onMusicXMLChange,
  readOnly: _readOnly = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const playbackRef = useRef<PlaybackEngine | null>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.5);
  const [zoom, setZoom] = useState(1.0);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize OSMD and Playback
  useEffect(() => {
    if (!containerRef.current || isInitialized) return;

    const initOSMD = async () => {
      try {
        console.log('Initializing OSMD...');
        const options: IOSMDOptions = {
          autoResize: true,
          backend: 'svg',
          drawingParameters: 'compacttight',
          drawTitle: true,
          drawComposer: true,
          drawCredits: false,
          drawPartNames: false,
          drawPartAbbreviations: false,
          drawMeasureNumbers: true,
          drawTimeSignatures: true,
        };

        osmdRef.current = new OpenSheetMusicDisplay(containerRef.current!, options);
        console.log('OSMD instance created');
        
        // Initialize playback
        playbackRef.current = getPlaybackEngine();
        await playbackRef.current.initialize();
        console.log('Playback engine initialized');
        
        playbackRef.current.onProgress((time, dur) => {
          setCurrentTime(time);
          setDuration(dur);
        });
        
        playbackRef.current.onEnd(() => {
          setIsPlaying(false);
          setIsPaused(false);
          setCurrentTime(0);
        });
        
        setIsInitialized(true);
        console.log('OSMD initialization complete');
      } catch (err) {
        console.error('Failed to initialize OSMD:', err);
        setError(`Failed to initialize sheet music display: ${err instanceof Error ? err.message : 'Unknown error'}`);
        setIsLoading(false);
      }
    };

    initOSMD();

    return () => {
      playbackRef.current?.dispose();
    };
  }, [isInitialized]);

  // Load MusicXML when it changes
  useEffect(() => {
    if (!osmdRef.current || !musicXML || !isInitialized) {
      console.log('OSMD load skipped:', { 
        hasOSMD: !!osmdRef.current, 
        hasMusicXML: !!musicXML,
        musicXMLLength: musicXML?.length,
        isInitialized 
      });
      return;
    }

    const loadMusic = async () => {
      setIsLoading(true);
      setError(null);

      try {
        console.log('Loading MusicXML into OSMD, length:', musicXML.length);
        await osmdRef.current!.load(musicXML);
        console.log('OSMD load complete, rendering...');
        osmdRef.current!.zoom = zoom;
        osmdRef.current!.render();
        console.log('OSMD render complete');
        
        // Load into playback engine
        playbackRef.current?.loadMusicXML(musicXML);
        setDuration(playbackRef.current?.getDuration() || 0);
        
        setIsLoading(false);
      } catch (err) {
        console.error('Failed to load MusicXML:', err);
        setError(`Failed to load sheet music: ${err instanceof Error ? err.message : 'Unknown error'}`);
        setIsLoading(false);
      }
    };

    loadMusic();
  }, [musicXML, isInitialized, zoom]);

  // Playback controls
  const handlePlay = useCallback(async () => {
    if (!playbackRef.current) return;
    
    await playbackRef.current.initialize();
    playbackRef.current.play();
    setIsPlaying(true);
    setIsPaused(false);
  }, []);

  const handlePause = useCallback(() => {
    playbackRef.current?.pause();
    setIsPaused(true);
  }, []);

  const handleStop = useCallback(() => {
    playbackRef.current?.stop();
    setIsPlaying(false);
    setIsPaused(false);
    setCurrentTime(0);
  }, []);

  const handleSeek = useCallback((time: number) => {
    playbackRef.current?.seek(time);
    setCurrentTime(time);
  }, []);

  const handleVolumeChange = useCallback((newVolume: number) => {
    setVolume(newVolume);
    playbackRef.current?.setVolume(newVolume);
  }, []);

  const handleZoomIn = useCallback(() => {
    const newZoom = Math.min(zoom + 0.1, 2.0);
    setZoom(newZoom);
    if (osmdRef.current) {
      osmdRef.current.zoom = newZoom;
      osmdRef.current.render();
    }
  }, [zoom]);

  const handleZoomOut = useCallback(() => {
    const newZoom = Math.max(zoom - 0.1, 0.5);
    setZoom(newZoom);
    if (osmdRef.current) {
      osmdRef.current.zoom = newZoom;
      osmdRef.current.render();
    }
  }, [zoom]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([musicXML], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]/gi, '_')}.musicxml`;
    a.click();
    URL.revokeObjectURL(url);
  }, [musicXML, title]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="sheet-editor">
      <style>{`
        .sheet-editor {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: #fafafa;
        }
        
        .editor-toolbar {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 12px 20px;
          background: #fff;
          border-bottom: 1px solid #e0e0e0;
          flex-wrap: wrap;
        }
        
        .toolbar-section {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .toolbar-section.playback {
          flex: 1;
          min-width: 200px;
        }
        
        .toolbar-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border: none;
          border-radius: 8px;
          background: #f0f0f0;
          color: #333;
          font-size: 18px;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .toolbar-btn:hover {
          background: #e0e0e0;
        }
        
        .toolbar-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .toolbar-btn.primary {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          width: 48px;
          height: 48px;
          font-size: 20px;
        }
        
        .toolbar-btn.primary:hover {
          transform: scale(1.05);
        }
        
        .progress-container {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 150px;
        }
        
        .progress-bar {
          flex: 1;
          height: 6px;
          background: #e0e0e0;
          border-radius: 3px;
          cursor: pointer;
          position: relative;
        }
        
        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
          border-radius: 3px;
          transition: width 0.1s linear;
        }
        
        .time-display {
          font-size: 12px;
          color: #666;
          font-family: monospace;
          white-space: nowrap;
        }
        
        .volume-control {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .volume-slider {
          width: 80px;
          height: 4px;
          -webkit-appearance: none;
          background: #e0e0e0;
          border-radius: 2px;
          outline: none;
        }
        
        .volume-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 14px;
          height: 14px;
          background: #667eea;
          border-radius: 50%;
          cursor: pointer;
        }
        
        .zoom-control {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        
        .zoom-label {
          font-size: 12px;
          color: #666;
          min-width: 40px;
          text-align: center;
        }
        
        .sheet-container {
          flex: 1;
          overflow: auto;
          padding: 20px;
          background: #fff;
        }
        
        .sheet-display {
          min-height: 400px;
        }
        
        .loading-overlay {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 60px;
          color: #666;
        }
        
        .loading-spinner {
          width: 40px;
          height: 40px;
          border: 3px solid #e0e0e0;
          border-top-color: #667eea;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin-right: 12px;
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        
        .error-message {
          padding: 20px;
          background: #ffebee;
          color: #c62828;
          border-radius: 8px;
          margin: 20px;
        }
        
        .toolbar-divider {
          width: 1px;
          height: 32px;
          background: #e0e0e0;
        }
      `}</style>

      <div className="editor-toolbar">
        {/* Playback Controls */}
        <div className="toolbar-section playback">
          <button
            className="toolbar-btn"
            onClick={handleStop}
            title="Stop"
            disabled={!isPlaying && !isPaused}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
              <rect x="6" y="6" width="12" height="12" rx="1"/>
            </svg>
          </button>
          
          {isPlaying && !isPaused ? (
            <button
              className="toolbar-btn primary"
              onClick={handlePause}
              title="Pause"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
                <rect x="6" y="4" width="4" height="16" rx="1"/>
                <rect x="14" y="4" width="4" height="16" rx="1"/>
              </svg>
            </button>
          ) : (
            <button
              className="toolbar-btn primary"
              onClick={handlePlay}
              title="Play"
              disabled={!musicXML}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
                <path d="M8 5.14v14l11-7-11-7z"/>
              </svg>
            </button>
          )}

          <div className="progress-container">
            <span className="time-display">{formatTime(currentTime)}</span>
            <div
              className="progress-bar"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const percent = (e.clientX - rect.left) / rect.width;
                handleSeek(percent * duration);
              }}
            >
              <div
                className="progress-fill"
                style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
              />
            </div>
            <span className="time-display">{formatTime(duration)}</span>
          </div>
        </div>

        <div className="toolbar-divider" />

        {/* Volume */}
        <div className="toolbar-section volume-control">
          <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
            {volume > 0 ? (
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
            ) : (
              <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
            )}
          </svg>
          <input
            type="range"
            className="volume-slider"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
          />
        </div>

        <div className="toolbar-divider" />

        {/* Zoom */}
        <div className="toolbar-section zoom-control">
          <button className="toolbar-btn" onClick={handleZoomOut} title="Zoom Out">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
          <span className="zoom-label">{Math.round(zoom * 100)}%</span>
          <button className="toolbar-btn" onClick={handleZoomIn} title="Zoom In">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
        </div>

        <div className="toolbar-divider" />

        {/* Download */}
        <button
          className="toolbar-btn"
          onClick={handleDownload}
          title="Download MusicXML"
          disabled={!musicXML}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
          </svg>
        </button>
      </div>

      <div className="sheet-container">
        {isLoading && (
          <div className="loading-overlay">
            <div className="loading-spinner" />
            <span>Loading sheet music...</span>
          </div>
        )}
        
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}
        
        <div ref={containerRef} className="sheet-display" />
      </div>
    </div>
  );
};

export default SheetMusicEditor;
