/**
 * Storage Service - IndexedDB-based persistent storage for recordings and uploads
 * 
 * Uses IndexedDB for efficient storage of large MusicXML data
 */

export interface SavedPiece {
  id: string;
  title: string;
  source: 'recording' | 'upload';
  createdAt: number;
  updatedAt: number;
  musicXML: string;
  duration?: string;
  originalFilename?: string;
}

const DB_NAME = 'imagene-storage';
const DB_VERSION = 1;
const STORE_NAME = 'saved-pieces';

class StorageService {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize the IndexedDB database
   */
  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('IndexedDB initialized');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create object store for saved pieces
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('source', 'source', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
          store.createIndex('title', 'title', { unique: false });
        }
      };
    });

    return this.initPromise;
  }

  /**
   * Save a piece to storage
   */
  async savePiece(piece: SavedPiece): Promise<void> {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      const request = store.put(piece);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all saved pieces
   */
  async getAllPieces(): Promise<SavedPiece[]> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        // Sort by createdAt descending (newest first)
        const pieces = request.result.sort((a, b) => b.createdAt - a.createdAt);
        resolve(pieces);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get pieces by source (recording or upload)
   */
  async getPiecesBySource(source: 'recording' | 'upload'): Promise<SavedPiece[]> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('source');
      const request = index.getAll(source);

      request.onsuccess = () => {
        const pieces = request.result.sort((a, b) => b.createdAt - a.createdAt);
        resolve(pieces);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get a single piece by ID
   */
  async getPiece(id: string): Promise<SavedPiece | null> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Update a piece
   */
  async updatePiece(id: string, updates: Partial<Omit<SavedPiece, 'id'>>): Promise<void> {
    const existing = await this.getPiece(id);
    if (!existing) {
      throw new Error(`Piece with id ${id} not found`);
    }

    const updated: SavedPiece = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    await this.savePiece(updated);
  }

  /**
   * Delete a piece
   */
  async deletePiece(id: string): Promise<void> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear all saved pieces
   */
  async clearAll(): Promise<void> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Generate a unique ID for a new piece
   */
  generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Create a recording piece
   */
  createRecordingPiece(title: string, musicXML: string, duration?: string): SavedPiece {
    const now = Date.now();
    return {
      id: this.generateId(),
      title,
      source: 'recording',
      createdAt: now,
      updatedAt: now,
      musicXML,
      duration,
    };
  }

  /**
   * Create an uploaded piece
   */
  createUploadedPiece(title: string, musicXML: string, originalFilename: string): SavedPiece {
    const now = Date.now();
    return {
      id: this.generateId(),
      title,
      source: 'upload',
      createdAt: now,
      updatedAt: now,
      musicXML,
      originalFilename,
    };
  }
}

// Singleton instance
export const storageService = new StorageService();
