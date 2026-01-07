/**
 * Controls - Recording controls and settings panel
 */

import React from 'react';
import { useTranscription } from '../hooks';
import { useAppStore, useBpm, useRecordingState } from '../store';

interface ControlsProps {
  className?: string;
}

/**
 * Controls component
 */
export const Controls: React.FC<ControlsProps> = ({ className = '' }) => {
  const { start, stop, clear, isRecording, isInitializing, error, bufferHealth } =
    useTranscription();
  
  const recordingState = useRecordingState();
  const bpm = useBpm();
  const setBpm = useAppStore((s) => s.setBpm);
  const isAutoDetectBpm = useAppStore((s) => s.isAutoDetectBpm);
  const setAutoDetectBpm = useAppStore((s) => s.setAutoDetectBpm);
  const onsetThreshold = useAppStore((s) => s.onsetThreshold);
  const offsetThreshold = useAppStore((s) => s.offsetThreshold);
  const setThresholds = useAppStore((s) => s.setThresholds);
  
  const handleRecordToggle = async () => {
    if (isRecording) {
      stop();
    } else {
      await start();
    }
  };
  
  const handleBpmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value > 0 && value <= 300) {
      setBpm(value);
    }
  };
  
  const handleOnsetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    setThresholds(value, offsetThreshold);
  };
  
  const handleOffsetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    setThresholds(onsetThreshold, value);
  };
  
  return (
    <div className={`controls ${className}`} style={styles.container}>
      {/* Main Controls */}
      <div style={styles.mainControls}>
        <button
          onClick={handleRecordToggle}
          disabled={isInitializing || recordingState === 'processing'}
          style={{
            ...styles.recordButton,
            backgroundColor: isRecording ? '#d32f2f' : '#4CAF50',
          }}
        >
          {isInitializing ? (
            <span style={styles.buttonContent}>
              <span style={styles.spinner} />
              Initializing...
            </span>
          ) : isRecording ? (
            <span style={styles.buttonContent}>
              <StopIcon />
              Stop Recording
            </span>
          ) : (
            <span style={styles.buttonContent}>
              <MicIcon />
              Start Recording
            </span>
          )}
        </button>
        
        <button
          onClick={clear}
          disabled={isRecording}
          style={styles.clearButton}
        >
          Clear
        </button>
      </div>
      
      {/* Status Indicators */}
      <div style={styles.statusRow}>
        <div style={styles.statusItem}>
          <span style={styles.statusLabel}>Status:</span>
          <span style={{
            ...styles.statusValue,
            color: recordingState === 'recording' ? '#4CAF50' : 
                   recordingState === 'error' ? '#d32f2f' : '#666',
          }}>
            {recordingState === 'idle' && 'Ready'}
            {recordingState === 'initializing' && 'Initializing...'}
            {recordingState === 'recording' && 'Recording'}
            {recordingState === 'processing' && 'Processing...'}
            {recordingState === 'error' && 'Error'}
          </span>
        </div>
        
        {isRecording && (
          <div style={styles.statusItem}>
            <span style={styles.statusLabel}>Buffer:</span>
            <div style={styles.bufferBar}>
              <div
                style={{
                  ...styles.bufferFill,
                  width: `${bufferHealth * 100}%`,
                  backgroundColor: bufferHealth > 0.8 ? '#ff9800' : 
                                   bufferHealth > 0.5 ? '#4CAF50' : '#2196F3',
                }}
              />
            </div>
          </div>
        )}
      </div>
      
      {/* Error Display */}
      {error && (
        <div style={styles.error}>
          <span>{error}</span>
        </div>
      )}
      
      {/* Settings */}
      <div style={styles.settings}>
        <h3 style={styles.settingsTitle}>Settings</h3>
        
        <div style={styles.settingRow}>
          <label style={styles.label}>
            <input
              type="checkbox"
              checked={isAutoDetectBpm}
              onChange={(e) => setAutoDetectBpm(e.target.checked)}
              style={styles.checkbox}
            />
            Auto-detect BPM
          </label>
        </div>
        
        <div style={styles.settingRow}>
          <label style={styles.label}>BPM:</label>
          <input
            type="number"
            value={bpm}
            onChange={handleBpmChange}
            disabled={isAutoDetectBpm}
            min={40}
            max={300}
            style={styles.numberInput}
          />
        </div>
        
        <div style={styles.settingRow}>
          <label style={styles.label}>
            Onset Threshold: {onsetThreshold.toFixed(2)}
          </label>
          <input
            type="range"
            value={onsetThreshold}
            onChange={handleOnsetChange}
            min={0.1}
            max={1}
            step={0.05}
            style={styles.slider}
          />
        </div>
        
        <div style={styles.settingRow}>
          <label style={styles.label}>
            Offset Threshold: {offsetThreshold.toFixed(2)}
          </label>
          <input
            type="range"
            value={offsetThreshold}
            onChange={handleOffsetChange}
            min={0.1}
            max={0.9}
            step={0.05}
            style={styles.slider}
          />
        </div>
      </div>
    </div>
  );
};

// Icons
const MicIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
  </svg>
);

const StopIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '20px',
    backgroundColor: '#fff',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
  },
  mainControls: {
    display: 'flex',
    gap: '12px',
    marginBottom: '16px',
  },
  recordButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '12px 24px',
    fontSize: '16px',
    fontWeight: 600,
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    minWidth: '180px',
  },
  buttonContent: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  clearButton: {
    padding: '12px 24px',
    fontSize: '16px',
    backgroundColor: '#f5f5f5',
    color: '#333',
    border: '1px solid #ddd',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  statusRow: {
    display: 'flex',
    gap: '24px',
    marginBottom: '16px',
    padding: '12px',
    backgroundColor: '#f5f5f5',
    borderRadius: '4px',
  },
  statusItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  statusLabel: {
    fontSize: '14px',
    color: '#666',
  },
  statusValue: {
    fontSize: '14px',
    fontWeight: 600,
  },
  bufferBar: {
    width: '100px',
    height: '8px',
    backgroundColor: '#ddd',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  bufferFill: {
    height: '100%',
    transition: 'width 0.2s ease, background-color 0.2s ease',
  },
  error: {
    padding: '12px',
    backgroundColor: '#ffebee',
    color: '#d32f2f',
    borderRadius: '4px',
    marginBottom: '16px',
    fontSize: '14px',
  },
  settings: {
    borderTop: '1px solid #eee',
    paddingTop: '16px',
  },
  settingsTitle: {
    margin: '0 0 16px 0',
    fontSize: '14px',
    fontWeight: 600,
    color: '#333',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  settingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '12px',
  },
  label: {
    fontSize: '14px',
    color: '#666',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    minWidth: '160px',
  },
  checkbox: {
    width: '16px',
    height: '16px',
  },
  numberInput: {
    width: '80px',
    padding: '8px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '4px',
  },
  slider: {
    flex: 1,
    maxWidth: '200px',
  },
  spinner: {
    width: '16px',
    height: '16px',
    border: '2px solid rgba(255,255,255,0.3)',
    borderTopColor: '#fff',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
};

export default Controls;
