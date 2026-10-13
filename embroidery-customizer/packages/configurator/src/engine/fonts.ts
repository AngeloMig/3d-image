import { FONTS, type FontOption } from '@embroidery/shared';

const fontUrls = import.meta.glob<string>('../assets/fonts/*.woff2', {
  eager: true,
  query: '?url',
  import: 'default',
});

export function fontFileUrl(file: string): string | null {
  const entry = Object.entries(fontUrls).find(([path]) => path.endsWith(`/${file}`));
  return entry ? new URL(entry[1], import.meta.url).href : null;
}

export type FontStatus = 'loading' | 'loaded' | 'fallback';

const status = new Map<string, FontStatus>();
const pending = new Map<string, Promise<FontStatus>>();

export function fontStatus(fontId: string): FontStatus {
  return status.get(fontId) ?? 'loading';
}

/**
 * Loads a bundled embroidery font with the FontFace API. Resolves to 'fallback' (never rejects)
 * on failure or timeout so the canvas renders with a predictable system font instead.
 */
export function ensureFont(font: FontOption, timeoutMs = 5000): Promise<FontStatus> {
  const existing = pending.get(font.id);
  if (existing) return existing;
  const job = (async (): Promise<FontStatus> => {
    const url = fontFileUrl(font.file);
    if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !url)
      return 'fallback';
    try {
      const face = new FontFace(font.family, `url(${JSON.stringify(url)}) format("woff2")`, {
        weight: String(font.weight),
        style: 'normal',
        display: 'swap',
      });
      const loaded = await Promise.race([
        face.load(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('font timeout')), timeoutMs),
        ),
      ]);
      document.fonts.add(loaded);
      return 'loaded';
    } catch (error) {
      console.warn(`[embroidery] Font "${font.label}" failed to load; using fallback.`, error);
      return 'fallback';
    }
  })().then((s) => {
    status.set(font.id, s);
    return s;
  });
  pending.set(font.id, job);
  return job;
}

export function preloadAllFonts(): Promise<FontStatus[]> {
  return Promise.all(FONTS.map((f) => ensureFont(f)));
}

export function cssFontFamily(font: FontOption): string {
  return `"${font.family}", ${font.fallback}`;
}

export function canvasFont(font: FontOption, px: number): string {
  const family = fontStatus(font.id) === 'loaded' ? cssFontFamily(font) : font.fallback;
  return `${font.weight} ${px.toFixed(2)}px ${family}`;
}
