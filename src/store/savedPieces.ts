/**
 * Saved Pieces Store - Zustand store for managing saved recordings and uploads
 */

import { create, StateCreator } from 'zustand';
import { storageService, type SavedPiece } from '../services/storage';

export interface SavedPiecesState {
  pieces: SavedPiece[];
  isLoading: boolean;
  error: string | null;
  
  // Actions
  loadPieces: () => Promise<void>;
  addPiece: (piece: SavedPiece) => Promise<void>;
  updatePiece: (id: string, updates: Partial<Omit<SavedPiece, 'id'>>) => Promise<void>;
  deletePiece: (id: string) => Promise<void>;
  clearError: () => void;
}

const createState: StateCreator<SavedPiecesState> = (set, get) => ({
  pieces: [],
  isLoading: false,
  error: null,

  loadPieces: async () => {
    set({ isLoading: true, error: null });
    try {
      const pieces = await storageService.getAllPieces();
      set({ pieces, isLoading: false });
    } catch (err) {
      console.error('Failed to load saved pieces:', err);
      set({ 
        error: err instanceof Error ? err.message : 'Failed to load saved pieces',
        isLoading: false 
      });
    }
  },

  addPiece: async (piece: SavedPiece) => {
    try {
      await storageService.savePiece(piece);
      // Reload all pieces to ensure consistency
      await get().loadPieces();
    } catch (err) {
      console.error('Failed to save piece:', err);
      set({ error: err instanceof Error ? err.message : 'Failed to save piece' });
      throw err;
    }
  },

  updatePiece: async (id: string, updates: Partial<Omit<SavedPiece, 'id'>>) => {
    try {
      await storageService.updatePiece(id, updates);
      await get().loadPieces();
    } catch (err) {
      console.error('Failed to update piece:', err);
      set({ error: err instanceof Error ? err.message : 'Failed to update piece' });
      throw err;
    }
  },

  deletePiece: async (id: string) => {
    try {
      await storageService.deletePiece(id);
      // Optimistically remove from state
      set(state => ({
        pieces: state.pieces.filter(p => p.id !== id)
      }));
    } catch (err) {
      console.error('Failed to delete piece:', err);
      set({ error: err instanceof Error ? err.message : 'Failed to delete piece' });
      // Reload to restore consistency
      await get().loadPieces();
      throw err;
    }
  },

  clearError: () => set({ error: null }),
});

export const useSavedPiecesStore = create<SavedPiecesState>(createState);

// Re-export the SavedPiece type for convenience
export type { SavedPiece } from '../services/storage';

// Helper hooks with explicit return types
export const useSavedPieces = (): SavedPiece[] => useSavedPiecesStore(state => state.pieces);
export const useRecordings = (): SavedPiece[] => useSavedPiecesStore(state => 
  state.pieces.filter(p => p.source === 'recording')
);
export const useUploads = (): SavedPiece[] => useSavedPiecesStore(state => 
  state.pieces.filter(p => p.source === 'upload')
);
