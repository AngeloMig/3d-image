import { describe, expect, it } from 'vitest';
import { TSHIRT_V1 } from './models';
import { defaultPlacement } from './placement';
import {
  checkUpload,
  detectImageMime,
  validatePlacement,
  validateText,
  validateTextDesign,
} from './validation';
import { DEFAULT_TEXT_DESIGN } from './configuration';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);
const GIF = new TextEncoder().encode('GIF89a......');

describe('text validation', () => {
  it('accepts names, accents and basic punctuation', () => {
    expect(validateText('José & Zoë')).toEqual([]);
    expect(validateText("O'NEILL\nEST. 2024")).toEqual([]);
  });
  it('rejects empty text', () => {
    expect(validateText('   ')[0]?.message).toMatch(/enter the text/i);
  });
  it('rejects too many lines and long lines', () => {
    expect(validateText('a\nb\nc')[0]?.message).toMatch(/at most 2 lines/);
    expect(validateText('X'.repeat(21))[0]?.message).toMatch(/Line 1 is too long/);
  });
  it('rejects emoji and unsupported symbols with the offending characters', () => {
    const issues = validateText('HELLO 😀');
    expect(issues[0]?.message).toContain('😀');
  });
  it('validates font, thread colour and size of a text design', () => {
    expect(validateTextDesign(DEFAULT_TEXT_DESIGN)).toEqual([]);
    const fields = validateTextDesign({
      ...DEFAULT_TEXT_DESIGN,
      fontId: 'comic',
      threadColorId: 'neon',
      sizeCm: 40,
    }).map((i) => i.field);
    expect(fields).toEqual(expect.arrayContaining(['fontId', 'threadColorId', 'sizeCm']));
  });
});

describe('file signatures', () => {
  it('detects PNG, JPEG and WebP from magic bytes', () => {
    expect(detectImageMime(PNG)).toBe('image/png');
    expect(detectImageMime(JPEG)).toBe('image/jpeg');
    expect(detectImageMime(WEBP)).toBe('image/webp');
    expect(detectImageMime(GIF)).toBeNull();
  });

  it('rejects files whose content does not match the declared type', () => {
    const r = checkUpload({ name: 'logo.png', type: 'image/png', size: 100 }, JPEG);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/labelled PNG but its contents are JPEG/);
  });

  it('rejects oversized, empty, SVG and unknown files with helpful messages', () => {
    expect(
      checkUpload({ name: 'a.png', type: 'image/png', size: 6 * 1024 * 1024 }, PNG).message,
    ).toMatch(/limit is 5 MB/);
    expect(checkUpload({ name: 'a.png', type: 'image/png', size: 0 }, PNG).message).toMatch(
      /empty/,
    );
    expect(checkUpload({ name: 'a.svg', type: 'image/svg+xml', size: 10 }, PNG).message).toMatch(
      /SVG/,
    );
    expect(checkUpload({ name: 'a.gif', type: 'image/gif', size: 10 }, GIF).ok).toBe(false);
  });

  it('accepts valid files even when the browser omits the MIME type', () => {
    expect(checkUpload({ name: 'a.webp', type: '', size: 10 }, WEBP)).toEqual({
      ok: true,
      mime: 'image/webp',
    });
  });

  it('honours a configurable size limit', () => {
    expect(
      checkUpload({ name: 'a.png', type: 'image/png', size: 2_000_000 }, PNG, 1024 * 1024).ok,
    ).toBe(false);
  });
});

describe('placement validation', () => {
  it('flags unavailable positions and out-of-range values', () => {
    const sleeve = {
      ...defaultPlacement(TSHIRT_V1, 'left_chest'),
      positionId: 'left_sleeve' as const,
      surfaceId: 'left_sleeve' as const,
    };
    expect(validatePlacement(TSHIRT_V1, sleeve)[0]?.message).toMatch(/not calibrated/);
    const far = { ...defaultPlacement(TSHIRT_V1, 'left_chest'), offsetXCm: 10 };
    expect(validatePlacement(TSHIRT_V1, far).map((i) => i.field)).toContain('offset');
  });
});
