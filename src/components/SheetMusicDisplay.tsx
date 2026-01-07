/**
 * SheetMusicDisplay - Renders MusicXML using OpenSheetMusicDisplay
 * 
 * Wrapper component for OSMD that handles loading and rendering
 * of generated MusicXML sheet music.
 */

import React, { useEffect, useRef, useState } from 'react';
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import { useMusicXML } from '../store';

interface SheetMusicDisplayProps {
  className?: string;
}

/**
 * SheetMusicDisplay component
 */
export const SheetMusicDisplay: React.FC<SheetMusicDisplayProps> = ({
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const musicXML = useMusicXML();
  
  /**
   * Initialize OSMD instance
   */
  useEffect(() => {
    if (!containerRef.current) return;
    
    // Create OSMD instance
    osmdRef.current = new OpenSheetMusicDisplay(containerRef.current, {
      autoResize: true,
      backend: 'svg',
      drawTitle: true,
      drawComposer: true,
      drawCredits: false,
      drawPartNames: false,
      drawPartAbbreviations: false,
      drawingParameters: 'compact',
    });
    
    return () => {
      osmdRef.current = null;
    };
  }, []);
  
  /**
   * Load and render MusicXML when it changes
   */
  useEffect(() => {
    if (!osmdRef.current || !musicXML) {
      return;
    }
    
    const loadSheet = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        await osmdRef.current!.load(musicXML);
        osmdRef.current!.render();
      } catch (err) {
        console.error('Failed to render sheet music:', err);
        setError(err instanceof Error ? err.message : 'Failed to render');
      } finally {
        setIsLoading(false);
      }
    };
    
    loadSheet();
  }, [musicXML]);
  
  if (!musicXML) {
    return (
      <div className={`sheet-music-empty ${className}`} style={styles.empty}>
        <svg
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          style={{ opacity: 0.5 }}
        >
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
        <p style={styles.emptyText}>
          Record some music to see the transcription here
        </p>
      </div>
    );
  }
  
  return (
    <div className={`sheet-music-container ${className}`} style={styles.container}>
      {isLoading && (
        <div style={styles.loading}>
          <div style={styles.spinner} />
          <span>Rendering sheet music...</span>
        </div>
      )}
      
      {error && (
        <div style={styles.error}>
          <p>Error: {error}</p>
        </div>
      )}
      
      <div
        ref={containerRef}
        style={{
          ...styles.display,
          opacity: isLoading ? 0.5 : 1,
        }}
      />
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    minHeight: '300px',
    backgroundColor: '#fff',
    borderRadius: '8px',
    overflow: 'auto',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
  },
  display: {
    width: '100%',
    padding: '20px',
    transition: 'opacity 0.3s ease',
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '300px',
    color: '#888',
    backgroundColor: '#f5f5f5',
    borderRadius: '8px',
    border: '2px dashed #ddd',
  },
  emptyText: {
    marginTop: '16px',
    fontSize: '14px',
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    padding: '20px',
    color: '#666',
  },
  spinner: {
    width: '20px',
    height: '20px',
    border: '2px solid #ddd',
    borderTopColor: '#4CAF50',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  error: {
    padding: '20px',
    color: '#d32f2f',
    backgroundColor: '#ffebee',
    borderRadius: '4px',
    margin: '10px',
  },
};

export default SheetMusicDisplay;
