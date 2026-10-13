import {
  findFont,
  findThreadColor,
  textLines,
  FONTS,
  type SizeCm,
  type TextDesign,
} from '@embroidery/shared';
import { canvasFont } from './fonts';

/** Canvas resolution used for the embroidery texture. */
const PX_PER_CM = 56;
const MAX_TEXTURE_SIDE = 1024;
/** Transparent margin around the design (fraction of the shorter side) for the stitch shadow. */
export const DESIGN_PADDING = 0.08;

const REF_PX = 100;
const LINE_ADVANCE = 1.18;

interface TextMetricsCm extends SizeCm {
  lines: { text: string; widthPx: number }[];
  /** Ink extents at the 100px reference size. */
  ref: { width: number; ascent: number; descent: number; capHeight: number; spacingPx: number };
}

export interface RasterResult {
  canvas: HTMLCanvasElement;
  /** Design ink size in cm (excludes padding). */
  widthCm: number;
  heightCm: number;
  /** Size of the full canvas (incl. padding) in cm — the decal projector size. */
  canvasWidthCm: number;
  canvasHeightCm: number;
  version: number;
}

function makeCanvas(w = 2, h = 2): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext('2d', { willReadFrequently: false });
  if (!ctx) throw new Error('2D canvas is not supported in this browser.');
  return ctx;
}

/** Advance of each glyph including kerning, with manual tracking (works in every browser). */
function drawTrackedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacingPx: number,
): void {
  if (Math.abs(spacingPx) < 0.01) {
    ctx.fillText(text, x, y);
    return;
  }
  const chars = [...text];
  let prefix = '';
  chars.forEach((ch, i) => {
    ctx.fillText(ch, x + ctx.measureText(prefix).width + i * spacingPx, y);
    prefix += ch;
  });
}

function trackedWidth(ctx: CanvasRenderingContext2D, text: string, spacingPx: number): number {
  const n = [...text].length;
  return ctx.measureText(text).width + Math.max(0, n - 1) * spacingPx;
}

/**
 * Converts a design into a transparent "embroidered" bitmap: thread colour fill, raised
 * shadow and satin-stitch striping. Pure 2D canvas — works even if WebGL is unavailable.
 */
export class DesignRasterizer {
  private readonly scratch = makeCanvas();
  private readonly mask = makeCanvas();
  private stripeCache = new Map<string, CanvasPattern | null>();
  private version = 0;
  readonly canvas = makeCanvas();

  measureText(design: TextDesign): TextMetricsCm {
    const font = findFont(design.fontId) ?? FONTS[0]!;
    const ctx = ctx2d(this.scratch);
    ctx.font = canvasFont(font, REF_PX);
    const capHeight = ctx.measureText('H').actualBoundingBoxAscent || REF_PX * 0.7;
    const spacingPx = design.letterSpacing * REF_PX;
    const lines = textLines(design.text);
    const effective = lines.length ? lines : [' '];
    let width = 0;
    let ascent = 0;
    let descent = 0;
    const measured = effective.map((text, i) => {
      const m = ctx.measureText(text || ' ');
      const w = trackedWidth(ctx, text, spacingPx);
      width = Math.max(width, w);
      if (i === 0) ascent = Math.max(m.actualBoundingBoxAscent, capHeight);
      if (i === effective.length - 1) descent = Math.max(0, m.actualBoundingBoxDescent);
      return { text, widthPx: w };
    });
    const heightRef = ascent + descent + (effective.length - 1) * REF_PX * LINE_ADVANCE;
    const cmPerRefPx = design.sizeCm / capHeight;
    return {
      widthCm: Math.max(width, 1) * cmPerRefPx,
      heightCm: Math.max(heightRef, 1) * cmPerRefPx,
      lines: measured,
      ref: { width, ascent, descent, capHeight, spacingPx },
    };
  }

  /** Intrinsic size (before placement scale and fitting). */
  measureTextSize(design: TextDesign): SizeCm {
    const m = this.measureText(design);
    return { widthCm: m.widthCm, heightCm: m.heightCm };
  }

  private prepare(widthCm: number, heightCm: number) {
    const pad = Math.min(widthCm, heightCm) * DESIGN_PADDING + 0.15;
    const canvasWidthCm = widthCm + pad * 2;
    const canvasHeightCm = heightCm + pad * 2;
    let pxPerCm = PX_PER_CM;
    const longest = Math.max(canvasWidthCm, canvasHeightCm) * pxPerCm;
    if (longest > MAX_TEXTURE_SIDE) pxPerCm *= MAX_TEXTURE_SIDE / longest;
    const w = Math.max(8, Math.round(canvasWidthCm * pxPerCm));
    const h = Math.max(8, Math.round(canvasHeightCm * pxPerCm));
    for (const c of [this.canvas, this.mask]) {
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
    }
    return { pad, pxPerCm, w, h, canvasWidthCm, canvasHeightCm };
  }

  /** Render text at its final (fitted) size. */
  renderText(design: TextDesign, finalWidthCm: number, finalHeightCm: number): RasterResult {
    const metrics = this.measureText(design);
    const font = findFont(design.fontId) ?? FONTS[0]!;
    const thread = findThreadColor(design.threadColorId)?.hex ?? '#111111';
    const { pad, pxPerCm, w, h, canvasWidthCm, canvasHeightCm } = this.prepare(
      finalWidthCm,
      finalHeightCm,
    );

    const k = (finalWidthCm * pxPerCm) / Math.max(metrics.ref.width, 1);
    const m = ctx2d(this.mask);
    m.setTransform(1, 0, 0, 1, 0, 0);
    m.clearRect(0, 0, w, h);
    m.fillStyle = '#fff';
    m.textBaseline = 'alphabetic';
    m.textAlign = 'left';
    m.font = canvasFont(font, REF_PX * k);
    const left = pad * pxPerCm;
    const inkW = metrics.ref.width * k;
    let baseline = pad * pxPerCm + metrics.ref.ascent * k;
    for (const line of metrics.lines) {
      const lw = line.widthPx * k;
      const x =
        design.alignment === 'left'
          ? left
          : design.alignment === 'right'
            ? left + inkW - lw
            : left + (inkW - lw) / 2;
      drawTrackedText(m, line.text, x, baseline, metrics.ref.spacingPx * k);
      baseline += REF_PX * LINE_ADVANCE * k;
    }
    this.compose(thread, metrics.ref.capHeight * k, 1);
    return {
      canvas: this.canvas,
      widthCm: finalWidthCm,
      heightCm: finalHeightCm,
      canvasWidthCm,
      canvasHeightCm,
      version: ++this.version,
    };
  }

  /** Render uploaded artwork at its final (fitted) size. */
  renderImage(image: CanvasImageSource, finalWidthCm: number, finalHeightCm: number): RasterResult {
    const { pad, pxPerCm, w, h, canvasWidthCm, canvasHeightCm } = this.prepare(
      finalWidthCm,
      finalHeightCm,
    );
    const m = ctx2d(this.mask);
    m.setTransform(1, 0, 0, 1, 0, 0);
    m.clearRect(0, 0, w, h);
    m.imageSmoothingQuality = 'high';
    m.drawImage(
      image,
      pad * pxPerCm,
      pad * pxPerCm,
      finalWidthCm * pxPerCm,
      finalHeightCm * pxPerCm,
    );
    this.compose(null, Math.min(finalWidthCm, finalHeightCm) * pxPerCm * 0.2, 0.45);
    return {
      canvas: this.canvas,
      widthCm: finalWidthCm,
      heightCm: finalHeightCm,
      canvasWidthCm,
      canvasHeightCm,
      version: ++this.version,
    };
  }

  private stripes(ctx: CanvasRenderingContext2D, spacing: number): CanvasPattern | null {
    const key = String(Math.round(spacing));
    if (this.stripeCache.has(key)) return this.stripeCache.get(key) ?? null;
    const s = Math.max(3, Math.round(spacing));
    const tile = makeCanvas(s * 2, s * 2);
    const t = ctx2d(tile);
    // Diagonal satin stitches: a bright thread crest followed by a darker valley.
    for (let i = -2; i <= 2; i++) {
      const o = i * s;
      t.strokeStyle = 'rgba(255,255,255,0.55)';
      t.lineWidth = s * 0.35;
      t.beginPath();
      t.moveTo(o, s * 2);
      t.lineTo(o + s * 2, 0);
      t.stroke();
      t.strokeStyle = 'rgba(0,0,0,0.5)';
      t.lineWidth = s * 0.3;
      t.beginPath();
      t.moveTo(o + s * 0.55, s * 2);
      t.lineTo(o + s * 2.55, 0);
      t.stroke();
    }
    const pattern = ctx.createPattern(tile, 'repeat');
    this.stripeCache.set(key, pattern);
    return pattern;
  }

  /**
   * mask (white glyphs or artwork) → thread fill → satin stripes → raised shadow.
   * `fill` null keeps the artwork's own colours.
   */
  private compose(fill: string | null, featurePx: number, stripeStrength: number): void {
    const out = ctx2d(this.canvas);
    const { width: w, height: h } = this.canvas;
    out.setTransform(1, 0, 0, 1, 0, 0);
    out.globalCompositeOperation = 'source-over';
    out.globalAlpha = 1;
    out.clearRect(0, 0, w, h);

    const tinted = ctx2d(this.mask);
    if (fill) {
      tinted.globalCompositeOperation = 'source-in';
      tinted.fillStyle = fill;
      tinted.fillRect(0, 0, w, h);
    }
    // Satin texture + soft top light, clipped to the design.
    tinted.globalCompositeOperation = 'source-atop';
    const pattern = this.stripes(tinted, Math.max(3, featurePx * 0.09));
    if (pattern) {
      tinted.globalAlpha = 0.28 * stripeStrength;
      tinted.fillStyle = pattern;
      tinted.fillRect(0, 0, w, h);
    }
    tinted.globalAlpha = 1;
    const sheen = tinted.createLinearGradient(0, 0, 0, h);
    sheen.addColorStop(0, 'rgba(255,255,255,0.14)');
    sheen.addColorStop(0.55, 'rgba(255,255,255,0)');
    sheen.addColorStop(1, 'rgba(0,0,0,0.16)');
    tinted.fillStyle = sheen;
    tinted.fillRect(0, 0, w, h);
    tinted.globalCompositeOperation = 'source-over';

    // Raised thread: soft contact shadow underneath, then the stitched layer.
    const blur = Math.max(1, featurePx * 0.05);
    out.shadowColor = 'rgba(0,0,0,0.42)';
    out.shadowBlur = blur * 2;
    out.shadowOffsetX = 0;
    out.shadowOffsetY = blur * 0.8;
    out.drawImage(this.mask, 0, 0);
    out.shadowColor = 'transparent';
    out.shadowBlur = 0;
    out.shadowOffsetY = 0;
  }
}
