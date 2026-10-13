import {
  createId,
  parseConfiguration,
  serializeConfiguration,
  type AllowedImageMime,
  type EmbroideryConfiguration,
} from '@embroidery/shared';
import { PersistenceError, type PersistenceAdapter, type StoredArtwork } from './types';

const DB_NAME = 'embroidery-demo';
const DB_VERSION = 1;

interface ArtworkRecord {
  ref: string;
  blob: Blob;
  filename: string;
  mimeType: AllowedImageMime;
  createdAt: string;
}

/**
 * DEMO ONLY: stores artwork blobs and configurations in this browser's IndexedDB, so the
 * standalone demo can add → reload → edit without a server. Falls back to memory if blocked.
 */
export class DemoPersistence implements PersistenceAdapter {
  readonly mode = 'demo' as const;
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private readonly memory = new Map<string, unknown>();
  private readonly objectUrls = new Map<string, string>();

  private db(): Promise<IDBDatabase | null> {
    this.dbPromise ??= new Promise((resolve) => {
      try {
        if (typeof indexedDB === 'undefined') return resolve(null);
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          req.result.createObjectStore('artwork', { keyPath: 'ref' });
          req.result.createObjectStore('configs');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return this.dbPromise;
  }

  private async put(store: 'artwork' | 'configs', value: unknown, key?: string): Promise<void> {
    const db = await this.db();
    if (!db) {
      this.memory.set(`${store}:${key ?? (value as ArtworkRecord).ref}`, value);
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      if (key === undefined) tx.objectStore(store).put(value);
      else tx.objectStore(store).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(new PersistenceError('Could not save in this browser (storage full or blocked).'));
    });
  }

  private async get<T>(store: 'artwork' | 'configs', key: string): Promise<T | undefined> {
    const db = await this.db();
    if (!db) return this.memory.get(`${store}:${key}`) as T | undefined;
    return new Promise((resolve, reject) => {
      const req = db.transaction(store, 'readonly').objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(new PersistenceError('Could not read saved data.'));
    });
  }

  async uploadArtwork(
    file: Blob,
    meta: { filename: string; mimeType: AllowedImageMime },
  ): Promise<StoredArtwork> {
    const ref = `demo-art-${createId()}`;
    await this.put('artwork', {
      ref,
      blob: file,
      filename: meta.filename,
      mimeType: meta.mimeType,
      createdAt: new Date().toISOString(),
    });
    return { storageRef: ref };
  }

  async saveConfiguration(config: EmbroideryConfiguration): Promise<{ configRef: string }> {
    const configRef = `demo-cfg-${config.configurationId.slice(0, 8)}-${Date.now().toString(36)}`;
    await this.put('configs', serializeConfiguration(config), configRef);
    return { configRef };
  }

  async loadConfiguration(configRef: string): Promise<EmbroideryConfiguration> {
    const raw = await this.get<string>('configs', configRef);
    if (!raw)
      throw new PersistenceError('This saved design could not be found in this browser.', 404);
    return parseConfiguration(raw);
  }

  async resolveArtworkUrl(storageRef: string): Promise<string> {
    const cached = this.objectUrls.get(storageRef);
    if (cached) return cached;
    const record = await this.get<ArtworkRecord>('artwork', storageRef);
    if (!record) throw new PersistenceError('The uploaded artwork is no longer available.', 404);
    const url = URL.createObjectURL(record.blob);
    this.objectUrls.set(storageRef, url);
    return url;
  }
}
