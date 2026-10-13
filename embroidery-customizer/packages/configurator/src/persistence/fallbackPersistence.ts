import type { AllowedImageMime, EmbroideryConfiguration } from '@embroidery/shared';
import { DemoPersistence } from './demoPersistence';
import { PersistenceError, type PersistenceAdapter, type StoredArtwork } from './types';

/**
 * Server persistence first (app proxy). If the app backend isn't reachable — e.g. the theme
 * section is used before the app is installed — TEXT designs still work: their full spec is in
 * the cart line properties, and the config is kept in this browser so edit-in-cart works here.
 * Artwork uploads never fall back: the merchant would not receive the file.
 */
export class FallbackPersistence implements PersistenceAdapter {
  readonly mode = 'shopify' as const;
  private readonly local = new DemoPersistence();

  constructor(private readonly primary: PersistenceAdapter) {}

  private static unreachable(e: unknown): boolean {
    return (
      e instanceof PersistenceError && (e.status === null || e.status === 404 || e.status >= 500)
    );
  }

  async uploadArtwork(
    file: Blob,
    meta: { filename: string; mimeType: AllowedImageMime },
  ): Promise<StoredArtwork> {
    try {
      return await this.primary.uploadArtwork(file, meta);
    } catch (e) {
      if (FallbackPersistence.unreachable(e))
        throw new PersistenceError(
          'Logo uploads are temporarily unavailable. Please try again later or use text embroidery.',
        );
      throw e;
    }
  }

  async saveConfiguration(config: EmbroideryConfiguration): Promise<{ configRef: string }> {
    try {
      return await this.primary.saveConfiguration(config);
    } catch (e) {
      if (!FallbackPersistence.unreachable(e) || config.design.type !== 'text') throw e;
      console.warn(
        '[embroidery] App proxy unreachable — keeping this text design in the browser only.',
        e,
      );
      const { configRef } = await this.local.saveConfiguration(config);
      return { configRef: `local:${configRef}` };
    }
  }

  loadConfiguration(configRef: string): Promise<EmbroideryConfiguration> {
    return configRef.startsWith('local:')
      ? this.local.loadConfiguration(configRef.slice('local:'.length))
      : this.primary.loadConfiguration(configRef);
  }

  resolveArtworkUrl(storageRef: string): Promise<string> {
    return this.primary.resolveArtworkUrl(storageRef);
  }
}
