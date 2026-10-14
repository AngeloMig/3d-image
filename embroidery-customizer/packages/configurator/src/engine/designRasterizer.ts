import {
  findFont,
  findThreadColor,
  textLines,
  FONTS,
  type SizeCm,
  type StitchStyle,
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

  private prepare(widthCm: number, heightCm: number, style: StitchStyle = 'flat') {
    // Patches extend past the design; puff throws a deeper shadow.
    const extra =
      style === 'patch' ? 0.75 : style === 'puff' ? 0.2 : style === 'chenille' ? 0.15 : 0;
    const pad = Math.min(widthCm, heightCm) * DESIGN_PADDING + 0.15 + extra;
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
    const style = design.stitchStyle ?? 'flat';
    const { pad, pxPerCm, w, h, canvasWidthCm, canvasHeightCm } = this.prepare(
      finalWidthCm,
      finalHeightCm,
      style,
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
    this.compose(thread, metrics.ref.capHeight * k, 1, style, {
      x: pad * pxPerCm,
      y: pad * pxPerCm,
      w: finalWidthCm * pxPerCm,
      h: finalHeightCm * pxPerCm,
      pxPerCm,
    });
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
  renderImage(
    image: CanvasImageSource,
    finalWidthCm: number,
    finalHeightCm: number,
    style: StitchStyle = 'flat',
  ): RasterResult {
    const { pad, pxPerCm, w, h, canvasWidthCm, canvasHeightCm } = this.prepare(
      finalWidthCm,
      finalHeightCm,
      style,
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
    this.compose(null, Math.min(finalWidthCm, finalHeightCm) * pxPerCm * 0.2, 0.45, style, {
      x: pad * pxPerCm,
      y: pad * pxPerCm,
      w: finalWidthCm * pxPerCm,
      h: finalHeightCm * pxPerCm,
      pxPerCm,
    });
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

  /** Deterministic speckle tile for chenille loops (same look on every render). */
  private speckles(ctx: CanvasRenderingContext2D): CanvasPattern | null {
    if (this.stripeCache.has('speckle')) return this.stripeCache.get('speckle') ?? null;
    const tile = makeCanvas(48, 48);
    const t = ctx2d(tile);
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 520; i++) {
      t.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)';
      t.beginPath();
      t.arc(rnd() * 48, rnd() * 48, 0.6 + rnd() * 1.3, 0, Math.PI * 2);
      t.fill();
    }
    const pattern = ctx.createPattern(tile, 'repeat');
    this.stripeCache.set('speckle', pattern);
    return pattern;
  }

  /**
   * mask (white glyphs or artwork) → thread fill → stitch texture → style finish → shadow.
   * `fill` null keeps the artwork's own colours.
   */
  private compose(
    fill: string | null,
    featurePx: number,
    stripeStrength: number,
    style: StitchStyle,
    ink: { x: number; y: number; w: number; h: number; pxPerCm: number },
  ): void {
    const out = ctx2d(this.canvas);
    const { width: w, height: h } = this.canvas;
    out.setTransform(1, 0, 0, 1, 0, 0);
    out.globalCompositeOperation = 'source-over';
    out.globalAlpha = 1;
    out.clearRect(0, 0, w, h);

    const tinted = ctx2d(this.mask);
    if (fill) {
      tinted.globalCompositeOperation = 'source-in';
      if (style === 'metallic') {
        // Banded metallic gradient built from the thread colour.
        const g = tinted.createLinearGradient(0, ink.y, 0, ink.y + ink.h);
        g.addColorStop(0, mix(fill, '#ffffff', 0.65));
        g.addColorStop(0.3, fill);
        g.addColorStop(0.5, mix(fill, '#000000', 0.35));
        g.addColorStop(0.68, mix(fill, '#ffffff', 0.55));
        g.addColorStop(1, mix(fill, '#000000', 0.25));
        tinted.fillStyle = g;
      } else tinted.fillStyle = fill;
      tinted.fillRect(0, 0, w, h);
    }
    tinted.globalCompositeOperation = 'source-atop';
    if (style === 'chenille') {
      const speck = this.speckles(tinted);
      if (speck) {
        tinted.globalAlpha = 0.55;
        tinted.fillStyle = speck;
        tinted.fillRect(0, 0, w, h);
      }
    } else {
      // Satin stitches (finer and brighter for metallic, bolder for puff).
      const spacing = Math.max(
        3,
        featurePx * (style === 'metallic' ? 0.06 : style === 'puff' ? 0.12 : 0.09),
      );
      const pattern = this.stripes(tinted, spacing);
      if (pattern) {
        tinted.globalAlpha =
          (style === 'metallic' ? 0.4 : style === 'puff' ? 0.34 : 0.28) * stripeStrength;
        tinted.fillStyle = pattern;
        tinted.fillRect(0, 0, w, h);
      }
    }
    tinted.globalAlpha = 1;
    // Light from above: puff gets a strong rounded highlight, metallic a hard specular band.
    const sheen = tinted.createLinearGradient(0, ink.y, 0, ink.y + ink.h);
    if (style === 'puff') {
      sheen.addColorStop(0, 'rgba(255,255,255,0.38)');
      sheen.addColorStop(0.45, 'rgba(255,255,255,0.05)');
      sheen.addColorStop(1, 'rgba(0,0,0,0.38)');
    } else if (style === 'metallic' && !fill) {
      sheen.addColorStop(0, 'rgba(255,255,255,0.45)');
      sheen.addColorStop(0.35, 'rgba(255,255,255,0)');
      sheen.addColorStop(0.6, 'rgba(255,255,255,0.3)');
      sheen.addColorStop(1, 'rgba(0,0,0,0.2)');
    } else {
      sheen.addColorStop(0, 'rgba(255,255,255,0.14)');
      sheen.addColorStop(0.55, 'rgba(255,255,255,0)');
      sheen.addColorStop(1, 'rgba(0,0,0,0.16)');
    }
    tinted.fillStyle = sheen;
    tinted.fillRect(0, 0, w, h);
    tinted.globalCompositeOperation = 'source-over';

    const blur = Math.max(1, featurePx * 0.05);
    if (style === 'patch') this.drawPatch(out, fill, ink);

    if (style === 'chenille') {
      // Fuzzy loops: a soft halo in the thread colour around the shape.
      out.shadowColor = fill ? hexToRgba(fill, 0.85) : 'rgba(255,255,255,0.6)';
      out.shadowBlur = Math.max(2, featurePx * 0.14);
      out.drawImage(this.mask, 0, 0);
    }
    // Raised thread: contact shadow underneath, then the stitched layer.
    const depth = style === 'puff' ? 2.6 : 1;
    out.shadowColor = `rgba(0,0,0,${style === 'puff' ? 0.55 : 0.42})`;
    out.shadowBlur = blur * 2 * depth;
    out.shadowOffsetX = 0;
    out.shadowOffsetY = blur * 0.8 * depth;
    out.drawImage(this.mask, 0, 0);
    out.shadowColor = 'transparent';
    out.shadowBlur = 0;
    out.shadowOffsetY = 0;
  }

  /** Twill patch with a merrowed (overlocked) border, sewn on behind the design. */
  private drawPatch(
    out: CanvasRenderingContext2D,
    fill: string | null,
    ink: { x: number; y: number; w: number; h: number; pxPerCm: number },
  ): void {
    const margin = 0.45 * ink.pxPerCm;
    const x = ink.x - margin;
    const y = ink.y - margin;
    const pw = ink.w + margin * 2;
    const ph = ink.h + margin * 2;
    const r = Math.min(pw, ph) * 0.18;
    const light = fill ? luminance(fill) > 0.45 : false;
    const base = light ? '#25262b' : '#efe8d8';
    out.save();
    out.shadowColor = 'rgba(0,0,0,0.4)';
    out.shadowBlur = ink.pxPerCm * 0.25;
    out.shadowOffsetY = ink.pxPerCm * 0.08;
    roundRect(out, x, y, pw, ph, r);
    out.fillStyle = base;
    out.fill();
    out.restore();
    // Twill weave.
    out.save();
    roundRect(out, x, y, pw, ph, r);
    out.clip();
    out.strokeStyle = light ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    out.lineWidth = Math.max(1, ink.pxPerCm * 0.05);
    for (let d = -ph; d < pw + ph; d += ink.pxPerCm * 0.16) {
      out.beginPath();
      out.moveTo(x + d, y);
      out.lineTo(x + d - ph, y + ph);
      out.stroke();
    }
    out.restore();
    // Merrowed edge: dense stitches around the border.
    out.save();
    roundRect(out, x, y, pw, ph, r);
    out.strokeStyle = fill ?? '#3b3b40';
    out.lineWidth = ink.pxPerCm * 0.22;
    out.setLineDash([ink.pxPerCm * 0.05, ink.pxPerCm * 0.035]);
    out.stroke();
    out.restore();
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return `rgb(${x.map((v, i) => Math.round(v + (y[i]! - v) * t)).join(',')})`;
}
function hexToRgba(hex: string, alpha: number): string {
  return `rgba(${hexToRgb(hex).join(',')},${alpha})`;
}
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
