import { FONTS, LIMITS, STITCH_STYLES, THREAD_COLORS, findFont, findThreadColor } from './catalog';
import { getPreset, getSurface, positionsConflict, type ModelAdapter } from './models';
import type {
  AllowedImageMime,
  EmbroideryConfiguration,
  ImageDesign,
  Placement,
  PlacementId,
  TextDesign,
  ValidationIssue,
} from './types';

export const ALLOWED_IMAGE_MIMES: readonly AllowedImageMime[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
];

/**
 * Characters that digitizers can reliably stitch: Latin letters (incl. accents), digits,
 * spaces and common punctuation. Emoji and other symbols are rejected with a clear message.
 */
const STITCHABLE = /^[\p{Script=Latin}0-9 .,'’&!?\-+#@/:()"“”]*$/u;

export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trimEnd())
    .join('\n');
}

export function textLines(text: string): string[] {
  return normalizeText(text)
    .split('\n')
    .map((l) => l.trim())
    .filter((l, i, all) => l.length > 0 || i < all.length - 1);
}

export function validateText(text: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const normalized = normalizeText(text);
  const lines = normalized.split('\n');
  if (normalized.trim().length === 0) {
    issues.push({ field: 'text', message: 'Enter the text you want embroidered.' });
    return issues;
  }
  if (lines.length > LIMITS.maxLines) {
    issues.push({ field: 'text', message: `Use at most ${LIMITS.maxLines} lines.` });
  }
  lines.forEach((line, i) => {
    if ([...line.trim()].length > LIMITS.maxCharsPerLine) {
      issues.push({
        field: 'text',
        message: `Line ${i + 1} is too long — keep it to ${LIMITS.maxCharsPerLine} characters.`,
      });
    }
  });
  if (!STITCHABLE.test(normalized.replace(/\n/g, ''))) {
    const bad = [
      ...new Set([...normalized.replace(/\n/g, '')].filter((ch) => !STITCHABLE.test(ch))),
    ];
    issues.push({
      field: 'text',
      message: `These characters can't be embroidered: ${bad.slice(0, 5).join(' ')}. Use letters, numbers and basic punctuation.`,
    });
  }
  return issues;
}

export function validateTextDesign(design: TextDesign): ValidationIssue[] {
  const issues = validateText(design.text);
  if (!findFont(design.fontId))
    issues.push({ field: 'fontId', message: 'Choose one of the available fonts.' });
  if (!findThreadColor(design.threadColorId))
    issues.push({ field: 'threadColorId', message: 'Choose one of the available thread colours.' });
  if (!(design.sizeCm >= LIMITS.minTextSizeCm && design.sizeCm <= LIMITS.maxTextSizeCm))
    issues.push({
      field: 'sizeCm',
      message: `Letter height must be between ${LIMITS.minTextSizeCm} and ${LIMITS.maxTextSizeCm} cm.`,
    });
  if (!(
    design.letterSpacing >= LIMITS.minLetterSpacing &&
    design.letterSpacing <= LIMITS.maxLetterSpacing
  ))
    issues.push({ field: 'letterSpacing', message: 'Letter spacing is out of range.' });
  if (!['left', 'center', 'right'].includes(design.alignment))
    issues.push({ field: 'alignment', message: 'Alignment must be left, center or right.' });
  return issues;
}

export function validateImageDesign(
  design: ImageDesign,
  opts: { requireStored?: boolean } = {},
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!ALLOWED_IMAGE_MIMES.includes(design.mimeType))
    issues.push({ field: 'mimeType', message: 'Artwork must be a PNG, JPEG or WebP image.' });
  if (!(design.byteSize > 0 && design.byteSize <= LIMITS.maxUploadBytes))
    issues.push({ field: 'byteSize', message: 'Artwork file is empty or too large.' });
  if (!design.originalFilename)
    issues.push({ field: 'originalFilename', message: 'Artwork file name is missing.' });
  if (!(design.widthPx >= LIMITS.minImagePx && design.heightPx >= LIMITS.minImagePx))
    issues.push({
      field: 'widthPx',
      message: `Artwork must be at least ${LIMITS.minImagePx}px on each side.`,
    });
  if (!(design.scale >= LIMITS.minImageScale && design.scale <= LIMITS.maxImageScale))
    issues.push({ field: 'scale', message: 'Artwork size is out of range.' });
  if (opts.requireStored && !design.storageRef)
    issues.push({ field: 'storageRef', message: 'Artwork has not been uploaded yet.' });
  return issues;
}

export function validatePlacement(adapter: ModelAdapter, placement: Placement): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const preset = getPreset(adapter, placement.positionId);
  if (!preset) return [{ field: 'positionId', message: 'Unknown embroidery position.' }];
  const surface = getSurface(adapter, preset.surfaceId);
  if (!preset.available || !surface?.available)
    issues.push({
      field: 'positionId',
      message:
        preset.unavailableReason && /not calibrated/i.test(preset.unavailableReason)
          ? preset.unavailableReason
          : `${preset.label} isn’t available on this garment${preset.unavailableReason ? `: ${preset.unavailableReason}` : '.'}`,
    });
  if (placement.surfaceId !== preset.surfaceId)
    issues.push({ field: 'surfaceId', message: 'Placement surface does not match the position.' });
  if (
    Math.abs(placement.offsetXCm) > preset.maxOffsetCm.x + 1e-6 ||
    Math.abs(placement.offsetYCm) > preset.maxOffsetCm.y + 1e-6
  )
    issues.push({ field: 'offset', message: 'Design is moved outside the allowed area.' });
  if (Math.abs(placement.rotationDeg) > LIMITS.maxRotationDeg)
    issues.push({
      field: 'rotationDeg',
      message: `Rotation is limited to ±${LIMITS.maxRotationDeg}°.`,
    });
  if (!(placement.scale >= LIMITS.minPlacementScale && placement.scale <= LIMITS.maxPlacementScale))
    issues.push({ field: 'scale', message: 'Scale is out of range.' });
  return issues;
}

export function validateConfiguration(
  adapter: ModelAdapter,
  config: EmbroideryConfiguration,
  opts: { requireStoredArtwork?: boolean } = {},
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!config.product.variantId)
    issues.push({ field: 'variantId', message: 'Choose a size and colour.' });
  if (!(
    Number.isInteger(config.product.quantity) &&
    config.product.quantity >= 1 &&
    config.product.quantity <= LIMITS.maxQuantity
  ))
    issues.push({
      field: 'quantity',
      message: `Quantity must be between 1 and ${LIMITS.maxQuantity}.`,
    });
  if (config.layers.length === 0)
    issues.push({ field: 'layers', message: 'Add at least one design.' });
  if (config.layers.length > LIMITS.maxDesigns)
    issues.push({ field: 'layers', message: `Up to ${LIMITS.maxDesigns} designs per item.` });
  const many = config.layers.length > 1;
  const seen = new Set<string>();
  config.layers.forEach((layer, i) => {
    // Prefix messages so customers know which design needs attention.
    const label = many ? `Design ${i + 1}: ` : '';
    const layerIssues = [
      ...(layer.design.type === 'text'
        ? validateTextDesign(layer.design)
        : validateImageDesign(layer.design, { requireStored: opts.requireStoredArtwork ?? false })),
      ...validatePlacement(adapter, layer.placement),
    ];
    const clash = [...seen].find((other) =>
      positionsConflict(adapter, other as PlacementId, layer.placement.positionId),
    );
    if (clash)
      layerIssues.push({
        field: 'positionId',
        message:
          clash === layer.placement.positionId
            ? 'Two designs can’t use the same position.'
            : 'This position overlaps another design.',
      });
    seen.add(layer.placement.positionId);
    if (layer.design.stitchStyle && !STITCH_STYLES.some((x) => x.id === layer.design.stitchStyle))
      layerIssues.push({
        field: 'stitchStyle',
        message: 'Choose one of the available embroidery styles.',
      });
    issues.push(
      ...layerIssues.map((x) => ({ field: x.field, message: label + x.message, layer: i })),
    );
  });
  return issues;
}

/* ---------- uploaded file checks (browser + server) ---------- */

/** Detect an image type from its magic bytes. Returns null for anything we don't accept. */
export function detectImageMime(bytes: Uint8Array): AllowedImageMime | null {
  const b = (i: number) => bytes[i] ?? -1;
  if (
    b(0) === 0x89 &&
    b(1) === 0x50 &&
    b(2) === 0x4e &&
    b(3) === 0x47 &&
    b(4) === 0x0d &&
    b(5) === 0x0a &&
    b(6) === 0x1a &&
    b(7) === 0x0a
  )
    return 'image/png';
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'image/jpeg';
  if (
    b(0) === 0x52 &&
    b(1) === 0x49 &&
    b(2) === 0x46 &&
    b(3) === 0x46 &&
    b(8) === 0x57 &&
    b(9) === 0x45 &&
    b(10) === 0x42 &&
    b(11) === 0x50
  )
    return 'image/webp';
  return null;
}

export interface UploadCheck {
  ok: boolean;
  mime: AllowedImageMime | null;
  message?: string;
}

const MIME_LABEL: Record<string, string> = {
  'image/png': 'PNG',
  'image/jpeg': 'JPEG',
  'image/webp': 'WebP',
};

export function checkUpload(
  file: { name: string; type: string; size: number },
  headerBytes: Uint8Array,
  maxBytes: number = LIMITS.maxUploadBytes,
): UploadCheck {
  const mb = (maxBytes / 1024 / 1024).toFixed(maxBytes % (1024 * 1024) === 0 ? 0 : 1);
  if (file.size === 0) return { ok: false, mime: null, message: 'That file is empty.' };
  if (file.size > maxBytes)
    return {
      ok: false,
      mime: null,
      message: `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is ${mb} MB.`,
    };
  if (/svg/i.test(file.type) || /\.svg$/i.test(file.name))
    return {
      ok: false,
      mime: null,
      message: 'SVG files aren’t supported yet. Please export your logo as PNG.',
    };
  const detected = detectImageMime(headerBytes);
  if (!detected)
    return {
      ok: false,
      mime: null,
      message: 'Unsupported file. Upload a PNG, JPEG or WebP image.',
    };
  const declared = file.type.toLowerCase().replace('image/jpg', 'image/jpeg');
  if (
    declared &&
    ALLOWED_IMAGE_MIMES.includes(declared as AllowedImageMime) &&
    declared !== detected
  )
    return {
      ok: false,
      mime: null,
      message: `This file is labelled ${MIME_LABEL[declared]} but its contents are ${MIME_LABEL[detected]}. Re-save it and try again.`,
    };
  if (declared && !ALLOWED_IMAGE_MIMES.includes(declared as AllowedImageMime))
    return {
      ok: false,
      mime: null,
      message: 'Unsupported file. Upload a PNG, JPEG or WebP image.',
    };
  return { ok: true, mime: detected };
}

export const FONT_IDS = FONTS.map((f) => f.id);
export const THREAD_COLOR_IDS = THREAD_COLORS.map((c) => c.id);
