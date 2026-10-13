import { describe, expect, it } from 'vitest';
import { DEFAULT_TEXT_DESIGN } from './configuration';
import {
  feeCartLines,
  feeCodeForVariantTitle,
  feeCodesFor,
  priceBreakdown,
  sizeTier,
  type PricingSettings,
} from './pricing';
import type { ImageDesign } from './types';

const logo = { type: 'image', stitchStyle: 'flat' } as ImageDesign;
const pricing: PricingSettings = {
  fees: {
    text: { price: 500, variantId: 'vt' },
    logo: { price: 800, variantId: 'vl' },
    size_medium: { price: 300, variantId: 'vm' },
    size_large: { price: 600, variantId: 'vL' },
    style_puff: { price: 400, variantId: 'vp' },
    font_premium: { price: 200, variantId: 'vf' },
  },
};

describe('size tiers', () => {
  it('classify by the longest embroidered side', () => {
    expect(sizeTier({ widthCm: 9, heightCm: 2 })).toBe('small');
    expect(sizeTier({ widthCm: 12, heightCm: 3 })).toBe('medium');
    expect(sizeTier({ widthCm: 8, heightCm: 22 })).toBe('large');
    expect(sizeTier(null)).toBe('small');
  });
});

describe('fee codes per design', () => {
  it('combine type, size, style and premium font', () => {
    expect(feeCodesFor({ design: DEFAULT_TEXT_DESIGN, rendered: { widthCm: 8, heightCm: 1 } })).toEqual(['text']);
    expect(
      feeCodesFor({
        design: { ...DEFAULT_TEXT_DESIGN, fontId: 'script', stitchStyle: 'puff' },
        rendered: { widthCm: 15, heightCm: 4 },
      }),
    ).toEqual(['text', 'size_medium', 'style_puff', 'font_premium']);
    expect(feeCodesFor({ design: { ...logo, stitchStyle: 'patch' }, rendered: { widthCm: 25, heightCm: 25 } })).toEqual([
      'logo',
      'size_large',
      'style_patch',
    ]);
  });
});

describe('priceBreakdown', () => {
  it('adds every applicable fee per design and multiplies by quantity', () => {
    const b = priceBreakdown(
      [
        { design: DEFAULT_TEXT_DESIGN, rendered: { widthCm: 8, heightCm: 1 } },
        { design: logo, rendered: { widthCm: 22, heightCm: 22 } },
        { design: { ...logo, stitchStyle: 'puff' }, rendered: { widthCm: 7, heightCm: 7 } },
      ],
      3200,
      2,
      pricing,
    );
    expect(b.fees.map((f) => [f.kind, f.perItem])).toEqual([
      ['text', 1],
      ['logo', 2],
      ['size_large', 1],
      ['style_puff', 1],
    ]);
    expect(b.perItem).toBe(3200 + 500 + 1600 + 600 + 400);
    expect(b.total).toBe(b.perItem * 2);
    expect(b.chargeable).toBe(true);
    expect(feeCartLines(b)).toContainEqual({ kind: 'logo', variantId: 'vl', quantity: 4 });
  });

  it('skips fees that are not configured (e.g. no metallic variant)', () => {
    const b = priceBreakdown([{ design: { ...logo, stitchStyle: 'metallic' } }], 3200, 1, pricing);
    expect(b.fees.map((f) => f.kind)).toEqual(['logo']);
  });

  it('flags fees that cannot be charged', () => {
    const b = priceBreakdown([{ design: logo }], 3200, 1, { fees: { logo: { price: 800, variantId: null } } });
    expect(b.chargeable).toBe(false);
    expect(feeCartLines(b)).toEqual([]);
  });
});

describe('Shopify fee variant titles', () => {
  it('map to fee codes case-insensitively', () => {
    expect(feeCodeForVariantTitle('Large size')).toBe('size_large');
    expect(feeCodeForVariantTitle(' 3d puff ')).toBe('style_puff');
    expect(feeCodeForVariantTitle('Gift wrap')).toBeNull();
  });
});
