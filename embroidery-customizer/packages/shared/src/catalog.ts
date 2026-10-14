/**
 * Static catalogue: embroidery fonts, thread colours, demo garment colours and limits.
 * Merchants can restrict these lists through app block settings (ids only).
 */

export interface FontOption {
  id: string;
  /** Customer-facing name, also written to cart line properties. */
  label: string;
  /** Unique CSS family registered via the FontFace API. */
  family: string;
  /** Predictable system fallback stack, used if the web font fails to load. */
  fallback: string;
  weight: number;
  /** Font file name inside the configurator's bundled assets. */
  file: string;
  sample: string;
  /** Premium fonts (fine scripts) take more stitches and carry a small surcharge. */
  premium?: boolean;
}

export const FONTS: readonly FontOption[] = [
  {
    id: 'block',
    label: 'Block Sans',
    family: 'EmbroideryBlockSans',
    fallback: '"Arial Black", "Helvetica Neue", Arial, sans-serif',
    weight: 700,
    file: 'montserrat-latin-700-normal.woff2',
    sample: 'Aa',
  },
  {
    id: 'serif',
    label: 'Classic Serif',
    family: 'EmbroideryClassicSerif',
    fallback: 'Georgia, "Times New Roman", serif',
    weight: 700,
    file: 'libre-baskerville-latin-700-normal.woff2',
    sample: 'Aa',
  },
  {
    id: 'script',
    premium: true,
    label: 'Script',
    family: 'EmbroideryScript',
    fallback: '"Brush Script MT", "Segoe Script", cursive',
    weight: 700,
    file: 'dancing-script-latin-700-normal.woff2',
    sample: 'Aa',
  },
  {
    id: 'varsity',
    label: 'Varsity',
    family: 'EmbroideryVarsity',
    fallback: 'Rockwell, "Courier New", serif',
    weight: 400,
    file: 'graduate-latin-400-normal.woff2',
    sample: 'Aa',
  },
  {
    id: 'condensed',
    label: 'Sport Condensed',
    family: 'EmbroiderySportCondensed',
    fallback: '"Arial Narrow", "Helvetica Neue", Arial, sans-serif',
    weight: 600,
    file: 'oswald-latin-600-normal.woff2',
    sample: 'Aa',
  },
  {
    id: 'tall',
    label: 'Tall Caps',
    family: 'EmbroideryTallCaps',
    fallback: 'Impact, "Arial Narrow", sans-serif',
    weight: 400,
    file: 'bebas-neue-latin-400-normal.woff2',
    sample: 'AA',
  },
  {
    id: 'slab',
    label: 'Slab Serif',
    family: 'EmbroiderySlabSerif',
    fallback: 'Rockwell, "Courier New", serif',
    weight: 700,
    file: 'roboto-slab-latin-700-normal.woff2',
    sample: 'Aa',
  },
  {
    id: 'elegant',
    label: 'Elegant Serif',
    family: 'EmbroideryElegantSerif',
    fallback: 'Didot, Georgia, serif',
    weight: 700,
    file: 'playfair-display-latin-700-normal.woff2',
    sample: 'Aa',
  },
  {
    id: 'retro',
    premium: true,
    label: 'Retro Script',
    family: 'EmbroideryRetroScript',
    fallback: '"Brush Script MT", cursive',
    weight: 400,
    file: 'pacifico-latin-400-normal.woff2',
    sample: 'Aa',
  },
  {
    id: 'monogram',
    premium: true,
    label: 'Fine Script',
    family: 'EmbroideryFineScript',
    fallback: '"Snell Roundhand", "Segoe Script", cursive',
    weight: 400,
    file: 'great-vibes-latin-400-normal.woff2',
    sample: 'Aa',
  },
];

export interface StitchStyleOption {
  id: import('./types').StitchStyle;
  label: string;
  description: string;
  /** Only for designs that suit the technique (e.g. puff needs bold shapes). */
  textOnly?: boolean;
}

export const STITCH_STYLES: readonly StitchStyleOption[] = [
  { id: 'flat', label: 'Flat embroidery', description: 'Classic satin stitch, smooth and durable.' },
  { id: 'puff', label: '3D Puff', description: 'Raised foam underlay for bold letters and shapes.' },
  { id: 'metallic', label: 'Metallic thread', description: 'Shimmering metallic thread that catches the light.' },
  { id: 'patch', label: 'Woven patch', description: 'Stitched onto a twill patch with a merrowed border.' },
  { id: 'chenille', label: 'Chenille', description: 'Soft, fuzzy varsity-style loops.' },
];

export const findStitchStyle = (id: string | undefined): StitchStyleOption =>
  STITCH_STYLES.find((s) => s.id === id) ?? STITCH_STYLES[0]!;

export interface ThreadColor {
  id: string;
  label: string;
  hex: string;
}

export const THREAD_COLORS: readonly ThreadColor[] = [
  { id: 'black', label: 'Black', hex: '#1b1b1d' },
  { id: 'white', label: 'White', hex: '#f7f7f4' },
  { id: 'cream', label: 'Cream', hex: '#efe4cc' },
  { id: 'silver', label: 'Silver Grey', hex: '#a7a9ac' },
  { id: 'charcoal', label: 'Charcoal', hex: '#4a4b4f' },
  { id: 'navy', label: 'Navy', hex: '#1f2b4d' },
  { id: 'royal', label: 'Royal Blue', hex: '#2a4fb0' },
  { id: 'sky', label: 'Sky Blue', hex: '#7fb3e0' },
  { id: 'teal', label: 'Teal', hex: '#17807e' },
  { id: 'forest', label: 'Forest Green', hex: '#24503a' },
  { id: 'kelly', label: 'Kelly Green', hex: '#2e9a4a' },
  { id: 'olive', label: 'Olive', hex: '#6b6b2e' },
  { id: 'gold', label: 'Gold', hex: '#c9a14a' },
  { id: 'yellow', label: 'Sun Yellow', hex: '#f2c230' },
  { id: 'orange', label: 'Orange', hex: '#e2702a' },
  { id: 'red', label: 'Red', hex: '#b3202a' },
  { id: 'burgundy', label: 'Burgundy', hex: '#6b1f2e' },
  { id: 'blush', label: 'Blush Pink', hex: '#e7b3b5' },
  { id: 'fuchsia', label: 'Fuchsia', hex: '#c42a7a' },
  { id: 'purple', label: 'Purple', hex: '#5b3a8e' },
];

export interface GarmentColor {
  /** Matches a Shopify colour option value (case-insensitive). */
  name: string;
  /** null = keep the model's original authored base-colour texture. */
  hex: string | null;
}

/** Built-in colour name → hex mapping. Merchants can extend it via the block's colour map setting. */
export const GARMENT_COLORS: readonly GarmentColor[] = [
  { name: 'Royal', hex: null },
  { name: 'White', hex: '#f1f1ee' },
  { name: 'Black', hex: '#232325' },
  { name: 'Navy', hex: '#24304f' },
  { name: 'Beige', hex: '#d9c8a9' },
  { name: 'Heather Grey', hex: '#a9aaa8' },
  { name: 'Red', hex: '#a3242b' },
  { name: 'Forest', hex: '#2c4a38' },
];

export const LIMITS = {
  maxLines: 2,
  maxCharsPerLine: 20,
  minTextSizeCm: 0.6,
  /** Jersey numbers on the back need big letters; each position caps it further (maxHeightCm). */
  maxTextSizeCm: 22,
  minLetterSpacing: -0.05,
  maxLetterSpacing: 0.5,
  minPlacementScale: 0.5,
  maxPlacementScale: 1.5,
  maxRotationDeg: 45,
  minImageScale: 0.2,
  maxImageScale: 1,
  maxUploadBytes: 5 * 1024 * 1024,
  minImagePx: 64,
  maxImagePx: 8000,
  maxQuantity: 99,
  /** Separate designs (each in its own, non-overlapping position) on one garment. */
  maxDesigns: 4,
  /** Rows in a single team / bulk order. */
  maxTeamRows: 50,
} as const;

export const findFont = (id: string): FontOption | undefined => FONTS.find((f) => f.id === id);
export const findThreadColor = (id: string): ThreadColor | undefined =>
  THREAD_COLORS.find((c) => c.id === id);

/** Resolve a garment colour option value to a hex (null = original texture, undefined = unknown). */
export function resolveGarmentColor(
  name: string | undefined,
  overrides: Record<string, string | null> = {},
): string | null | undefined {
  if (!name) return undefined;
  const key = name.trim().toLowerCase();
  for (const [k, v] of Object.entries(overrides)) if (k.trim().toLowerCase() === key) return v;
  return GARMENT_COLORS.find((c) => c.name.toLowerCase() === key)?.hex;
}
