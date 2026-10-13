import {
  parseConfiguration,
  serializeConfiguration,
  type AllowedImageMime,
  type EmbroideryConfiguration,
} from '@embroidery/shared';
import { PersistenceError, type PersistenceAdapter, type StoredArtwork } from './types';

/**
 * Talks to the Shopify app through its App Proxy (same origin as the storefront, e.g.
 * `/apps/embroidery`). Shopify signs every proxied request, and the app verifies that signature.
 */
export class AppProxyPersistence implements PersistenceAdapter {
  readonly mode = 'shopify' as const;
  private readonly base: string;
  private readonly objectUrls = new Map<string, string>();

  constructor(
    proxyPath: string,
    private readonly fetchImpl: typeof fetch = (...a) => globalThis.fetch(...a),
  ) {
    this.base = proxyPath.replace(/\/$/, '');
  }

  private async json<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}${path}`, { credentials: 'same-origin', ...init });
    } catch {
      throw new PersistenceError(
        'We couldn’t reach the design service. Check your connection and try again.',
      );
    }
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok)
      throw new PersistenceError(body?.error ?? `Request failed (${res.status}).`, res.status);
    return body as T;
  }

  async uploadArtwork(
    file: Blob,
    meta: { filename: string; mimeType: AllowedImageMime },
  ): Promise<StoredArtwork> {
    const form = new FormData();
    form.append('file', file, meta.filename);
    const res = await this.json<{ storageRef: string }>('/artwork', { method: 'POST', body: form });
    return { storageRef: res.storageRef };
  }

  async saveConfiguration(config: EmbroideryConfiguration): Promise<{ configRef: string }> {
    return this.json<{ configRef: string }>('/configurations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: serializeConfiguration(config),
    });
  }

  async loadConfiguration(configRef: string): Promise<EmbroideryConfiguration> {
    const res = await this.json<{ configuration: unknown }>(
      `/configurations/${encodeURIComponent(configRef)}`,
    );
    return parseConfiguration(res.configuration);
  }

  async resolveArtworkUrl(storageRef: string): Promise<string> {
    const cached = this.objectUrls.get(storageRef);
    if (cached) return cached;
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}/artwork/${encodeURIComponent(storageRef)}`, {
        credentials: 'same-origin',
      });
    } catch {
      throw new PersistenceError('Could not load the saved artwork.');
    }
    if (!res.ok)
      throw new PersistenceError('The saved artwork is no longer available.', res.status);
    // Blob → object URL keeps the WebGL texture same-origin (no tainted canvas).
    const url = URL.createObjectURL(await res.blob());
    this.objectUrls.set(storageRef, url);
    return url;
  }
}
