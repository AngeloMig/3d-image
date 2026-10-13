/**
 * Logo background removal (runs in the browser, no external service).
 * Flood-fills from the image border through pixels close to the dominant border colour, so
 * only the connected background disappears — white areas *inside* the logo are kept.
 */

export interface FloodResult {
  /** Fraction of pixels made transparent (0..1). */
  removed: number;
  /** The detected background colour. */
  background: [number, number, number];
  /** True when the border was already transparent (nothing to do). */
  alreadyTransparent: boolean;
}

const dist = (data: Uint8ClampedArray, i: number, c: [number, number, number]) =>
  Math.hypot(data[i]! - c[0], data[i + 1]! - c[1], data[i + 2]! - c[2]);

/** Median colour of the opaque border pixels. */
function borderColor(data: Uint8ClampedArray, w: number, h: number): { color: [number, number, number]; transparent: number; total: number } {
  const r: number[] = [];
  const g: number[] = [];
  const b: number[] = [];
  let transparent = 0;
  let total = 0;
  const visit = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    total++;
    if (data[i + 3]! < 16) return void transparent++;
    r.push(data[i]!);
    g.push(data[i + 1]!);
    b.push(data[i + 2]!);
  };
  for (let x = 0; x < w; x++) {
    visit(x, 0);
    visit(x, h - 1);
  }
  for (let y = 1; y < h - 1; y++) {
    visit(0, y);
    visit(w - 1, y);
  }
  const med = (a: number[]) => (a.length ? a.sort((p, q) => p - q)[a.length >> 1]! : 255);
  return { color: [med(r), med(g), med(b)], transparent, total };
}

/**
 * In-place on RGBA data. `tolerance` 0..100 maps to an RGB distance threshold.
 * Pixels just outside the threshold next to removed ones get partial alpha (anti-aliased edge).
 */
export function floodRemoveBackground(data: Uint8ClampedArray, w: number, h: number, tolerance = 30): FloodResult {
  const { color, transparent, total } = borderColor(data, w, h);
  if (transparent / Math.max(1, total) > 0.6) return { removed: 0, background: color, alreadyTransparent: true };

  const threshold = 8 + (tolerance / 100) * 140;
  const soft = threshold * 1.6;
  const state = new Uint8Array(w * h); // 0 = unvisited, 1 = background, 2 = edge/kept
  const stack: number[] = [];
  const seed = (x: number, y: number) => {
    const p = y * w + x;
    if (state[p] === 0 && (data[p * 4 + 3]! < 16 || dist(data, p * 4, color) <= threshold)) {
      state[p] = 1;
      stack.push(p);
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x, 0);
    seed(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    seed(0, y);
    seed(w - 1, y);
  }
  while (stack.length) {
    const p = stack.pop()!;
    const x = p % w;
    const y = (p - x) / w;
    if (x > 0) seed(x - 1, y);
    if (x < w - 1) seed(x + 1, y);
    if (y > 0) seed(x, y - 1);
    if (y < h - 1) seed(x, y + 1);
  }

  let removed = 0;
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    if (state[p] === 1) {
      data[i + 3] = 0;
      removed++;
      continue;
    }
    // Feather pixels bordering the removed area.
    const x = p % w;
    const y = (p - x) / w;
    const nearBg =
      (x > 0 && state[p - 1] === 1) ||
      (x < w - 1 && state[p + 1] === 1) ||
      (y > 0 && state[p - w] === 1) ||
      (y < h - 1 && state[p + w] === 1);
    if (nearBg) {
      const d = dist(data, i, color);
      if (d < soft) data[i + 3] = Math.round(data[i + 3]! * Math.max(0, (d - threshold) / (soft - threshold)));
    }
  }
  return { removed: removed / (w * h), background: color, alreadyTransparent: false };
}

export interface BackgroundRemovalOutput extends FloodResult {
  blob: Blob;
  width: number;
  height: number;
}

/** Decoded image → PNG blob with the background removed (max 2000px on the long side). */
export async function removeBackground(image: CanvasImageSource & { width: number; height: number }, tolerance = 30): Promise<BackgroundRemovalOutput> {
  const iw = (image as HTMLImageElement).naturalWidth || image.width;
  const ih = (image as HTMLImageElement).naturalHeight || image.height;
  const scale = Math.min(1, 2000 / Math.max(iw, ih));
  const w = Math.max(1, Math.round(iw * scale));
  const h = Math.max(1, Math.round(ih * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas is not supported.');
  ctx.drawImage(image, 0, 0, w, h);
  const pixels = ctx.getImageData(0, 0, w, h);
  const result = floodRemoveBackground(pixels.data, w, h, tolerance);
  ctx.putImageData(pixels, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode PNG.'))), 'image/png'),
  );
  return { ...result, blob, width: w, height: h };
}
