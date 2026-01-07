/**
 * MusicLibrary - Browse, search, and select music pieces
 */

import React, { useState, useMemo } from 'react';
import {
  MUSIC_LIBRARY,
  searchPieces,
  loadMusicXML,
  type LibraryPiece,
} from '../data/musicLibrary';

// Categories
const CATEGORIES = [
  { id: 'all', name: 'All' },
  { id: 'beginner', name: 'Beginner' },
  { id: 'intermediate', name: 'Intermediate' },
  { id: 'classical', name: 'Classical' },
  { id: 'advanced', name: 'Advanced' },
];

interface MusicLibraryProps {
  onSelectPiece: (piece: LibraryPiece, musicXML: string) => void;
  selectedPieceId?: string;
}

export const MusicLibrary: React.FC<MusicLibraryProps> = ({
  onSelectPiece,
  selectedPieceId,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const filteredPieces = useMemo(() => {
    if (searchQuery) {
      return searchPieces(searchQuery);
    }
    if (selectedCategory === 'all') {
      return MUSIC_LIBRARY;
    }
    return MUSIC_LIBRARY.filter(piece => piece.category === selectedCategory);
  }, [searchQuery, selectedCategory]);

  const handleSelectPiece = async (piece: LibraryPiece) => {
    setLoadingId(piece.id);
    try {
      console.log('Selecting piece:', piece.id, piece.filePath);
      const musicXML = await loadMusicXML(piece);
      console.log('MusicXML loaded successfully, length:', musicXML.length);
      onSelectPiece(piece, musicXML);
    } catch (error) {
      console.error('Failed to load piece:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to load "${piece.title}": ${errorMsg}`);
    } finally {
      setLoadingId(null);
    }
  };

  const getDifficultyStars = (difficulty: number) => {
    return '★'.repeat(difficulty) + '☆'.repeat(5 - difficulty);
  };

  const getDifficultyColor = (difficulty: number) => {
    const colors = ['#4CAF50', '#8BC34A', '#FFC107', '#FF9800', '#F44336'];
    return colors[difficulty - 1];
  };

  return (
    <div className="music-library">
      <style>{`
        .music-library {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: #1a1a2e;
          color: #e0e0e0;
        }
        
        .library-header {
          padding: 20px;
          background: linear-gradient(135deg, #16213e 0%, #1a1a2e 100%);
          border-bottom: 1px solid #2d2d44;
        }
        
        .library-title {
          font-size: 24px;
          font-weight: 600;
          margin: 0 0 16px 0;
          color: #fff;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        
        .search-container {
          position: relative;
        }
        
        .search-input {
          width: 100%;
          padding: 12px 16px 12px 44px;
          border: 1px solid #3d3d5c;
          border-radius: 8px;
          background: #16213e;
          color: #fff;
          font-size: 14px;
          transition: all 0.2s;
        }
        
        .search-input:focus {
          outline: none;
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.2);
        }
        
        .search-input::placeholder {
          color: #6b6b8a;
        }
        
        .search-icon {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: #6b6b8a;
          width: 16px;
          height: 16px;
        }
        
        .categories {
          display: flex;
          gap: 8px;
          padding: 16px 20px;
          overflow-x: auto;
          background: #16213e;
          border-bottom: 1px solid #2d2d44;
        }
        
        .category-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          border: 1px solid #3d3d5c;
          border-radius: 20px;
          background: transparent;
          color: #a0a0b8;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
        }
        
        .category-btn:hover {
          background: #2d2d44;
          color: #fff;
        }
        
        .category-btn.active {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-color: transparent;
          color: #fff;
        }
        
        .pieces-grid {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 16px;
          align-content: start;
        }
        
        .piece-card {
          background: #16213e;
          border: 1px solid #2d2d44;
          border-radius: 12px;
          padding: 16px;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .piece-card:hover {
          transform: translateY(-2px);
          border-color: #667eea;
          box-shadow: 0 8px 24px rgba(102, 126, 234, 0.2);
        }
        
        .piece-card.selected {
          border-color: #667eea;
          background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%);
        }
        
        .piece-card.loading {
          pointer-events: none;
          opacity: 0.7;
        }
        
        .piece-card {
          position: relative;
        }
        
        .loading-overlay {
          position: absolute;
          inset: 0;
          background: rgba(22, 33, 62, 0.9);
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          color: #667eea;
          font-weight: 500;
        }
        
        .piece-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 8px;
        }
        
        .piece-title {
          font-size: 16px;
          font-weight: 600;
          color: #fff;
          margin: 0;
          line-height: 1.3;
        }
        
        .piece-duration {
          font-size: 12px;
          color: #6b6b8a;
          background: #2d2d44;
          padding: 4px 8px;
          border-radius: 4px;
          white-space: nowrap;
        }
        
        .piece-composer {
          font-size: 13px;
          color: #a0a0b8;
          margin: 0 0 12px 0;
        }
        
        .piece-description {
          font-size: 12px;
          color: #6b6b8a;
          margin: 0 0 12px 0;
          line-height: 1.4;
        }
        
        .piece-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .piece-difficulty {
          font-size: 14px;
          letter-spacing: 2px;
        }
        
        .piece-category {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: #a0a0b8;
          background: #2d2d44;
          padding: 4px 8px;
          border-radius: 4px;
        }
        
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 20px;
          color: #6b6b8a;
        }
        
        .empty-text {
          font-size: 16px;
          text-align: center;
        }
      `}</style>

      <div className="library-header">
        <h1 className="library-title">
          Music Library
        </h1>
        <div className="search-container">
          <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            type="text"
            className="search-input"
            placeholder="Search by title or composer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="categories">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            className={`category-btn ${selectedCategory === cat.id && !searchQuery ? 'active' : ''}`}
            onClick={() => {
              setSelectedCategory(cat.id);
              setSearchQuery('');
            }}
          >
            {cat.name}
          </button>
        ))}
      </div>

      <div className="pieces-grid">
        {filteredPieces.length === 0 ? (
          <div className="empty-state">
            <div className="empty-text">
              No pieces found.
              {searchQuery && ' Try a different search term.'}
            </div>
          </div>
        ) : (
          filteredPieces.map((piece) => (
            <div
              key={piece.id}
              className={`piece-card ${selectedPieceId === piece.id ? 'selected' : ''} ${loadingId === piece.id ? 'loading' : ''}`}
              onClick={() => handleSelectPiece(piece)}
            >
              {loadingId === piece.id && <div className="loading-overlay">Loading...</div>}
              <div className="piece-header">
                <h3 className="piece-title">{piece.title}</h3>
                <span className="piece-duration">{piece.duration}</span>
              </div>
              <p className="piece-composer">{piece.composer}</p>
              <p className="piece-description">{piece.description}</p>
              <div className="piece-meta">
                <span
                  className="piece-difficulty"
                  style={{ color: getDifficultyColor(piece.difficulty) }}
                  title={`Difficulty: ${piece.difficulty}/5`}
                >
                  {getDifficultyStars(piece.difficulty)}
                </span>
                <span className="piece-category">{piece.category}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default MusicLibrary;
