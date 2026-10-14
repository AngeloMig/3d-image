import type { AllowedImageMime, EmbroideryConfiguration } from '@embroidery/shared';

export interface StoredArtwork {
  storageRef: string;
}

/**
 * Where artwork + full configurations are stored BEFORE the item goes into the cart.
 * Cart line properties only carry a short opaque reference.
 */
export interface PersistenceAdapter {
  readonly mode: 'demo' | 'shopify';
  uploadArtwork(
    file: Blob,
    meta: { filename: string; mimeType: AllowedImageMime },
  ): Promise<StoredArtwork>;
  saveConfiguration(config: EmbroideryConfiguration): Promise<{ configRef: string }>;
  loadConfiguration(configRef: string): Promise<EmbroideryConfiguration>;
  /** Returns a same-origin object URL for previewing stored artwork (safe for WebGL textures). */
  resolveArtworkUrl(storageRef: string): Promise<string>;
  /**
   * Stores the 3D mockup (JPEG) and returns an absolute URL usable in order emails.
   * Returns null where mockups aren't kept (demo, app not installed).
   */
  uploadMockup?(image: Blob): Promise<{ url: string } | null>;
}

export class PersistenceError extends Error {
  constructor(
    message: string,
    public readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'PersistenceError';
  }
}
