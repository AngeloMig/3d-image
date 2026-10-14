import { FONTS, type FontOption } from '@embroidery/shared';

/**
 * Each font is its own lazy JS chunk exporting a data: URL. Shopify theme app extensions only
 * accept .js/.css/.json/image assets (no .woff2), and a font is fetched only when it's needed.
 */
const fontModules = import.meta.glob<string>('../assets/fonts/*.woff2', {
  query: '?inline',
  import: 'default',
});

export async function fontFileUrl(file: string): Promise<string | null> {
  const entry = Object.entries(fontModules).find(([path]) => path.endsWith(`/${file}`));
  return entry ? entry[1]() : null;
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
    if (typeof FontFace === 'undefined' || typeof document === 'undefined') return 'fallback';
    try {
      const url = await fontFileUrl(font.file);
      if (!url) return 'fallback';
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

/** Display faces for the customizer's own headings (merchants can override --emb-font-display). */
export const UI_DISPLAY_FAMILY = 'EmbroideryUIDisplay';
export const UI_SPORT_FAMILY = 'EmbroideryUISport';
const uiFonts = new Map<string, Promise<void>>();
export function ensureUiFont(theme: 'clean' | 'atelier' | 'sport' = 'clean'): Promise<void> {
  if (theme === 'clean') return Promise.resolve(); // uses the shop's own font
  const [family, file, weight] =
    theme === 'sport'
      ? [UI_SPORT_FAMILY, 'bebas-neue-latin-400-normal.woff2', '400']
      : [UI_DISPLAY_FAMILY, 'ui-fraunces-latin-600-normal.woff2', '600'];
  let job = uiFonts.get(family);
  if (!job) {
    job = (async () => {
      if (typeof FontFace === 'undefined' || typeof document === 'undefined') return;
      try {
        const url = await fontFileUrl(file);
        if (!url) return;
        const face = new FontFace(family, `url(${JSON.stringify(url)}) format("woff2")`, {
          weight,
          display: 'swap',
        });
        document.fonts.add(await face.load());
      } catch {
        /* falls back to the system stack */
      }
    })();
    uiFonts.set(family, job);
  }
  return job;
}
