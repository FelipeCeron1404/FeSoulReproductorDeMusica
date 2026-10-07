import type { SongInfo } from '../audio/songFactory';

export type RepeatMode = 'off' | 'all' | 'one';

export interface StoredPlaylist {
  id: string;
  name: string;
  currentSongId: string | null;
  /** Songs in the same order as the doubly linked list. */
  songs: SongInfo[];
}

export interface StoredState {
  playlists: StoredPlaylist[];
  selectedPlaylistId: string | null;
  volume: number;
  muted: boolean;
  repeat: RepeatMode;
  shuffle: boolean;
  /** Name used to greet the user on the home page. */
  userName?: string;
  /** Recently played songs as "playlistId:songId". */
  recent?: string[];
}

const DB_NAME = 'fesoul';
const DB_VERSION = 1;
const FILES = 'files';
const STATE = 'state';
const STATE_KEY = 'library';

/**
 * Saves the playlists and the audio files in the browser (IndexedDB),
 * so the music is still there after reloading the page.
 * If the browser does not allow it, the app keeps working in memory.
 */
export class LibraryStorage {
  private dbPromise: Promise<IDBDatabase | null> | null = null;

  async loadState(): Promise<StoredState | null> {
    const state = await this.request<StoredState | undefined>(STATE, 'readonly', (store) => store.get(STATE_KEY));
    return state ?? null;
  }

  async saveState(state: StoredState): Promise<void> {
    await this.request(STATE, 'readwrite', (store) => store.put(state, STATE_KEY));
  }

  async getFile(songId: string): Promise<Blob | null> {
    const file = await this.request<Blob | undefined>(FILES, 'readonly', (store) => store.get(songId));
    return file ?? null;
  }

  /** Returns false if the file could not be saved (for example, no space left). */
  async saveFile(songId: string, file: Blob): Promise<boolean> {
    try {
      await this.request(FILES, 'readwrite', (store) => store.put(file, songId), true);
      return true;
    } catch {
      return false;
    }
  }

  async deleteFile(songId: string): Promise<void> {
    await this.request(FILES, 'readwrite', (store) => store.delete(songId));
  }

  /** Deletes stored files that no playlist uses anymore. */
  async pruneFiles(validIds: Set<string>): Promise<void> {
    const keys = await this.request<IDBValidKey[]>(FILES, 'readonly', (store) => store.getAllKeys());
    if (!keys) return;
    await Promise.all(keys.filter((key) => !validIds.has(String(key))).map((key) => this.deleteFile(String(key))));
  }

  // ---------- IndexedDB helpers ----------

  private open(): Promise<IDBDatabase | null> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve) => {
        try {
          const request = indexedDB.open(DB_NAME, DB_VERSION);
          request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES);
            if (!db.objectStoreNames.contains(STATE)) db.createObjectStore(STATE);
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => resolve(null);
          request.onblocked = () => resolve(null);
        } catch {
          resolve(null);
        }
      });
    }
    return this.dbPromise;
  }

  /**
   * Runs one request. Errors are ignored (storage is optional) unless
   * `throwOnError` is true.
   */
  private async request<T>(
    storeName: string,
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest,
    throwOnError = false,
  ): Promise<T | undefined> {
    const db = await this.open();
    if (!db) {
      if (throwOnError) throw new Error('Storage not available');
      return undefined;
    }

    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(storeName, mode);
        const request = action(transaction.objectStore(storeName));
        transaction.oncomplete = () => resolve(request.result as T);
        transaction.onerror = transaction.onabort = () =>
          throwOnError ? reject(transaction.error) : resolve(undefined);
      } catch (error) {
        if (throwOnError) reject(error);
        else resolve(undefined);
      }
    });
  }
}
