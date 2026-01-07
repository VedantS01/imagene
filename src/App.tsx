/**
 * App - Main application component with tabbed navigation
 * 
 * Features:
 * - Library: Browse and play sample music pieces
 * - Record: Live transcription from microphone
 * - Upload: Import MIDI/MusicXML files
 * - Saved pieces persist in IndexedDB
 */

import React, { useEffect, useState, useCallback } from 'react';
import { PianoRoll, SheetMusicDisplay, Controls } from './components';
import { MusicLibrary } from './components/MusicLibrary';
import { SheetMusicEditor } from './components/SheetMusicEditor';
import { FileUpload } from './components/FileUpload';
import { useAppStore } from './store';
import { useSavedPiecesStore } from './store/savedPieces';
import { storageService, type SavedPiece } from './services/storage';
import type { LibraryPiece } from './data/musicLibrary';

type TabType = 'library' | 'record' | 'upload';

/**
 * Check if SharedArrayBuffer is available
 */
function checkSharedArrayBufferSupport(): boolean {
  try {
    new SharedArrayBuffer(1);
    return true;
  } catch {
    return false;
  }
}

/**
 * SavedPiecesList component - renders the list of saved recordings and uploads
 */
interface SavedPiecesListProps {
  pieces: SavedPiece[];
  selectedId?: string;
  onSelect: (piece: SavedPiece) => void;
  onDelete: (id: string) => void;
}

const SavedPiecesList: React.FC<SavedPiecesListProps> = ({ pieces, selectedId, onSelect, onDelete }) => {
  if (pieces.length === 0) return null;
  
  return (
    <div className="saved-pieces-section">
      <h3 className="saved-section-title">My Saved Pieces</h3>
      <div className="saved-pieces-list">
        {pieces.map((piece) => (
          <div 
            key={piece.id}
            className={`saved-piece-item ${selectedId === piece.id ? 'selected' : ''}`}
            onClick={() => onSelect(piece)}
          >
            <div className="saved-piece-info">
              <span className="saved-piece-title">{piece.title}</span>
              <span className="saved-piece-meta">
                {piece.source === 'recording' ? 'Recording' : 'Upload'} • {new Date(piece.createdAt).toLocaleDateString()}
              </span>
            </div>
            <button 
              className="delete-saved-btn"
              onClick={(e) => { e.stopPropagation(); onDelete(piece.id); }}
              title="Delete"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Main App component
 */
const App: React.FC = () => {
  const [isSupported, setIsSupported] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('library');
  const [selectedPiece, setSelectedPiece] = useState<LibraryPiece | null>(null);
  const [selectedMusicXML, setSelectedMusicXML] = useState<string | null>(null);
  const [uploadedMusic, setUploadedMusic] = useState<{ xml: string; name: string } | null>(null);
  const [selectedSavedPiece, setSelectedSavedPiece] = useState<SavedPiece | null>(null);
  
  const detectedNotes = useAppStore((s) => s.detectedNotes);
  const musicXML = useAppStore((s) => s.musicXML);
  
  // Saved pieces store - destructure the store for better type inference
  const store = useSavedPiecesStore();
  const savedPieces = store.pieces as SavedPiece[];
  const { loadPieces, addPiece, deletePiece } = store;
  
  // Load saved pieces on mount
  useEffect(() => {
    loadPieces();
  }, [loadPieces]);
  
  useEffect(() => {
    setIsSupported(checkSharedArrayBufferSupport());
  }, []);

  const handleSelectPiece = useCallback((piece: LibraryPiece, musicXML: string) => {
    setSelectedPiece(piece);
    setSelectedMusicXML(musicXML);
  }, []);

  const handleUploadedMusic = useCallback(async (xml: string, name: string) => {
    setUploadedMusic({ xml, name });
    
    // Save to IndexedDB
    try {
      const piece = storageService.createUploadedPiece(name, xml, name);
      await addPiece(piece);
      console.log('Upload saved to storage');
    } catch (err) {
      console.error('Failed to save upload:', err);
    }
  }, [addPiece]);

  // Save recording when musicXML is generated
  const handleSaveRecording = useCallback(async () => {
    if (!musicXML) return;
    
    const title = `Recording ${new Date().toLocaleString()}`;
    try {
      const piece = storageService.createRecordingPiece(title, musicXML);
      await addPiece(piece);
      console.log('Recording saved to storage');
    } catch (err) {
      console.error('Failed to save recording:', err);
    }
  }, [musicXML, addPiece]);

  const handleSelectSavedPiece = useCallback((piece: SavedPiece) => {
    setSelectedSavedPiece(piece);
  }, []);

  const handleDeleteSavedPiece = useCallback(async (id: string) => {
    try {
      await deletePiece(id);
      if (selectedSavedPiece?.id === id) {
        setSelectedSavedPiece(null);
      }
    } catch (err) {
      console.error('Failed to delete piece:', err);
    }
  }, [deletePiece, selectedSavedPiece]);

  const handleBackToLibrary = useCallback(() => {
    setSelectedPiece(null);
    setSelectedMusicXML(null);
    setSelectedSavedPiece(null);
  }, []);

  const handleBackToUpload = useCallback(() => {
    setUploadedMusic(null);
  }, []);
  
  // Show loading while checking support
  if (isSupported === null) {
    return (
      <div className="app-loading">
        <style>{appStyles}</style>
        <div className="loading-spinner" />
        <p>Initializing...</p>
      </div>
    );
  }
  
  // Show error if SharedArrayBuffer is not supported
  if (!isSupported) {
    return (
      <div className="error-container">
        <style>{appStyles}</style>
        <div className="error-card">
          <h2>Browser Not Supported</h2>
          <p>
            This application requires <code>SharedArrayBuffer</code> which is not
            available in your browser or current context.
          </p>
          <p>
            Please ensure you're accessing this page over HTTPS and that the server
            sends the required headers:
          </p>
          <pre>
            {`Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp`}
          </pre>
          <p>
            Try using Chrome, Firefox, or Edge with the latest updates.
          </p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="app">
      <style>{appStyles}</style>

      {/* Header */}
      <header className="app-header">
        <div className="logo">
          <span className="logo-text">Imagene</span>
        </div>
        
        <nav className="nav-tabs">
          <button
            className={`nav-tab ${activeTab === 'library' ? 'active' : ''}`}
            onClick={() => setActiveTab('library')}
          >
            Library
          </button>
          <button
            className={`nav-tab ${activeTab === 'record' ? 'active' : ''}`}
            onClick={() => setActiveTab('record')}
          >
            Record
          </button>
          <button
            className={`nav-tab ${activeTab === 'upload' ? 'active' : ''}`}
            onClick={() => setActiveTab('upload')}
          >
            Upload
          </button>
        </nav>
      </header>
      
      {/* Main Content */}
      <main className="main-content">
        {/* Library Tab */}
        {activeTab === 'library' && (
          <div className="tab-content">
            {(selectedPiece && selectedMusicXML) || selectedSavedPiece ? (
              <div className="library-view">
                <div className="library-sidebar">
                  <MusicLibrary
                    onSelectPiece={handleSelectPiece}
                    selectedPieceId={selectedPiece?.id}
                  />
                  <SavedPiecesList 
                    pieces={savedPieces}
                    selectedId={selectedSavedPiece?.id}
                    onSelect={handleSelectSavedPiece}
                    onDelete={handleDeleteSavedPiece}
                  />
                </div>
                <div className="library-main">
                  <button className="back-button" onClick={handleBackToLibrary}>
                    ← Back to Selection
                  </button>
                  <div className="editor-wrapper">
                    {selectedSavedPiece ? (
                      <SheetMusicEditor
                        musicXML={selectedSavedPiece.musicXML}
                        title={selectedSavedPiece.title}
                      />
                    ) : (
                      <SheetMusicEditor
                        musicXML={selectedMusicXML!}
                        title={selectedPiece!.title}
                      />
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="library-view">
                <div className="library-sidebar full-width">
                  <MusicLibrary
                    onSelectPiece={handleSelectPiece}
                    selectedPieceId={undefined}
                  />
                  <SavedPiecesList 
                    pieces={savedPieces}
                    selectedId={undefined}
                    onSelect={handleSelectSavedPiece}
                    onDelete={handleDeleteSavedPiece}
                  />
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Record Tab */}
        {activeTab === 'record' && (
          <div className="tab-content">
            <div className="record-view">
              <div className="record-section">
                <Controls />
              </div>
              
              <div className="stats-row">
                <div className="stat-card">
                  <span className="stat-value">{detectedNotes.length}</span>
                  <span className="stat-label">Notes Detected</span>
                </div>
                <div className="stat-card">
                  <span className="stat-value">
                    {detectedNotes.filter(n => n.isActive).length}
                  </span>
                  <span className="stat-label">Active Notes</span>
                </div>
                <div className="stat-card">
                  <span className="stat-value">{musicXML ? 'Yes' : 'No'}</span>
                  <span className="stat-label">Sheet Ready</span>
                </div>
              </div>
              
              <div className="record-section">
                <h2 className="section-title">Live Visualization</h2>
                <PianoRoll width={900} height={200} />
              </div>
              
              <div className="record-section">
                <div className="section-header">
                  <h2 className="section-title">Sheet Music</h2>
                  {musicXML && (
                    <button className="save-recording-btn" onClick={handleSaveRecording}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
                        <polyline points="17,21 17,13 7,13 7,21"/>
                        <polyline points="7,3 7,8 15,8"/>
                      </svg>
                      Save Recording
                    </button>
                  )}
                </div>
                {musicXML ? (
                  <SheetMusicEditor musicXML={musicXML} title="Recording" />
                ) : (
                  <SheetMusicDisplay />
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* Upload Tab */}
        {activeTab === 'upload' && (
          <div className="tab-content">
            <div className="upload-view">
              {uploadedMusic ? (
                <>
                  <button className="back-button" onClick={handleBackToUpload}>
                    ← Upload Another File
                  </button>
                  <div className="editor-wrapper">
                    <SheetMusicEditor
                      musicXML={uploadedMusic.xml}
                      title={uploadedMusic.name}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="upload-section">
                    <h2 className="section-title">Import Music File</h2>
                    <FileUpload onMusicXMLLoaded={handleUploadedMusic} />
                  </div>
                  
                  <div className="upload-section">
                    <h2 className="section-title">Supported Formats</h2>
                    <p className="format-help">
                      <strong>MusicXML</strong> (.musicxml, .xml) - Standard music notation format<br/>
                      <strong>MIDI</strong> (.mid, .midi) - Musical instrument digital interface<br/><br/>
                      Upload your own piano scores and sheet music to view, play, and practice!
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>
      
      {/* Footer */}
      <footer className="app-footer">
        Built with React, Web Audio API, and ONNX Runtime •{' '}
        <a
          href="https://github.com/VedantS01/imagene"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
      </footer>
    </div>
  );
};

const appStyles = `
  .app {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: #0f0f1a;
    color: #e0e0e0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  
  .app-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background: #0f0f1a;
    color: #a0a0b8;
  }
  
  .loading-spinner {
    width: 48px;
    height: 48px;
    border: 3px solid #2d2d44;
    border-top-color: #667eea;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-bottom: 16px;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  .error-container {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 20px;
    background: #0f0f1a;
  }
  
  .error-card {
    max-width: 500px;
    padding: 32px;
    background: #1a1a2e;
    border-radius: 16px;
    border: 1px solid #2d2d44;
    color: #a0a0b8;
  }
  
  .error-card h2 {
    margin: 0 0 16px 0;
    color: #f44336;
  }
  
  .error-card p {
    line-height: 1.6;
  }
  
  .error-card pre {
    background: #16213e;
    padding: 12px;
    border-radius: 8px;
    overflow-x: auto;
    color: #667eea;
    font-size: 13px;
  }
  
  .app-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 24px;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    border-bottom: 1px solid #2d2d44;
  }
  
  .logo {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  
  .logo-text {
    font-size: 24px;
    font-weight: 700;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  
  .nav-tabs {
    display: flex;
    gap: 4px;
    background: #16213e;
    padding: 4px;
    border-radius: 12px;
  }
  
  .nav-tab {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: #a0a0b8;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .nav-tab:hover {
    background: rgba(102, 126, 234, 0.1);
    color: #fff;
  }
  
  .nav-tab.active {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: #fff;
  }
  
  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  
  .tab-content {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  
  .record-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 20px;
    gap: 20px;
    overflow-y: auto;
  }
  
  .record-section {
    background: #1a1a2e;
    border-radius: 12px;
    padding: 20px;
    border: 1px solid #2d2d44;
  }
  
  .section-title {
    font-size: 18px;
    font-weight: 600;
    color: #fff;
    margin: 0 0 16px 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .stats-row {
    display: flex;
    gap: 16px;
  }
  
  .stat-card {
    flex: 1;
    background: #1a1a2e;
    padding: 16px;
    border-radius: 12px;
    text-align: center;
    border: 1px solid #2d2d44;
  }
  
  .stat-value {
    display: block;
    font-size: 32px;
    font-weight: 700;
    color: #667eea;
  }
  
  .stat-label {
    display: block;
    font-size: 12px;
    color: #6b6b8a;
    margin-top: 4px;
  }
  
  .upload-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 20px;
    gap: 20px;
  }
  
  .upload-section {
    background: #1a1a2e;
    border-radius: 12px;
    padding: 24px;
    border: 1px solid #2d2d44;
  }
  
  .format-help {
    color: #a0a0b8;
    margin: 0;
    line-height: 1.8;
  }
  
  .back-button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    border: 1px solid #3d3d5c;
    border-radius: 8px;
    background: transparent;
    color: #a0a0b8;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s;
    margin-bottom: 16px;
    align-self: flex-start;
  }
  
  .back-button:hover {
    background: #2d2d44;
    color: #fff;
  }
  
  .editor-wrapper {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 400px;
    background: #fff;
    border-radius: 12px;
    overflow: hidden;
  }
  
  .library-view {
    display: flex;
    height: 100%;
  }
  
  .library-sidebar {
    width: 400px;
    border-right: 1px solid #2d2d44;
    overflow: hidden;
  }
  
  .library-sidebar.full-width {
    width: 100%;
    border-right: none;
  }
  
  .library-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 20px;
    background: #1a1a2e;
  }
  
  /* Saved Pieces Styles */
  .saved-pieces-section {
    padding: 16px;
    border-top: 1px solid #2d2d44;
    background: #16213e;
  }
  
  .saved-section-title {
    font-size: 14px;
    font-weight: 600;
    color: #a0a0b8;
    margin: 0 0 12px 0;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  
  .saved-pieces-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 300px;
    overflow-y: auto;
  }
  
  .saved-piece-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px;
    background: #1a1a2e;
    border-radius: 8px;
    border: 1px solid #2d2d44;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .saved-piece-item:hover {
    background: #232340;
    border-color: #3d3d5c;
  }
  
  .saved-piece-item.selected {
    background: #2d2d5c;
    border-color: #667eea;
  }
  
  .saved-piece-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    flex: 1;
  }
  
  .saved-piece-title {
    font-size: 14px;
    font-weight: 500;
    color: #e0e0e0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .saved-piece-meta {
    font-size: 12px;
    color: #6b6b8a;
  }
  
  .delete-saved-btn {
    padding: 6px;
    background: transparent;
    border: none;
    color: #6b6b8a;
    cursor: pointer;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    flex-shrink: 0;
  }
  
  .delete-saved-btn:hover {
    background: #3d2d2d;
    color: #f44336;
  }
  
  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }
  
  .section-header .section-title {
    margin: 0;
  }
  
  .save-recording-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border: none;
    border-radius: 8px;
    color: #fff;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .save-recording-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
  }
  
  .app-footer {
    padding: 12px 24px;
    background: #16213e;
    border-top: 1px solid #2d2d44;
    text-align: center;
    font-size: 13px;
    color: #6b6b8a;
  }
  
  .app-footer a {
    color: #667eea;
    text-decoration: none;
  }
  
  .app-footer a:hover {
    text-decoration: underline;
  }
`;

export default App;
