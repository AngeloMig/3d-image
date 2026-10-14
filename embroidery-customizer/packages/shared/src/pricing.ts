import { findFont } from './catalog';
import type { EmbroideryDesign, RenderedDimensions } from './types';

/**
 * Embroidery pricing.
 *
 * Every price component is a "fee code". Each code is charged as a cart line of a
 * merchant-created "Embroidery fee" product whose variant is named after the code (e.g. "Logo",
 * "Large size", "3D Puff"). Shopify prices those variants — the browser never sets a price —
 * and the same table drives the live price shown on every step.
 */
export type FeeCode =
  | 'text'
  | 'logo'
  | 'size_medium'
  | 'size_large'
  | 'style_puff'
  | 'style_metallic'
  | 'style_patch'
  | 'style_chenille'
  | 'font_premium';

/** Kept for older call sites. */
export type FeeKind = FeeCode;

export interface FeeDefinition {
  label: string;
  /** Shopify fee-product variant title that maps to this code (case-insensitive). */
  variantTitle: string;
}

export const FEE_CATALOG: Record<FeeCode, FeeDefinition> = {
  text: { label: 'Text embroidery', variantTitle: 'Text' },
  logo: { label: 'Logo embroidery', variantTitle: 'Logo' },
  size_medium: { label: 'Medium size', variantTitle: 'Medium size' },
  size_large: { label: 'Large size', variantTitle: 'Large size' },
  style_puff: { label: '3D Puff', variantTitle: '3D Puff' },
  style_metallic: { label: 'Metallic thread', variantTitle: 'Metallic thread' },
  style_patch: { label: 'Woven patch', variantTitle: 'Woven patch' },
  style_chenille: { label: 'Chenille', variantTitle: 'Chenille' },
  font_premium: { label: 'Premium font', variantTitle: 'Premium font' },
};

export const FEE_CODES = Object.keys(FEE_CATALOG) as FeeCode[];

/** Size tiers by the longest embroidered side (stitch count grows with area). */
export const SIZE_TIERS = { mediumFromCm: 10, largeFromCm: 20 } as const;

export interface FeePrice {
  /** Minor units. */
  price: number;
  /** Fee-product variant; null = shown but not chargeable (only used in previews/tests). */
  variantId: string | null;
}

/** "Order N+ items, save P%" — shown live; charged by matching Shopify automatic discounts. */
export interface BulkTier {
  minQuantity: number;
  percentOff: number;
}

export interface PricingSettings {
  fees: Partial<Record<FeeCode, FeePrice>>;
  /** Ascending by minQuantity. Applies to the garment price only (what the Shopify discount covers). */
  bulkTiers?: BulkTier[];
}

export const NO_PRICING: PricingSettings = { fees: {} };

export interface PricedDesign {
  design: EmbroideryDesign;
  rendered?: Pick<RenderedDimensions, 'widthCm' | 'heightCm'> | null;
}

export type SizeTier = 'small' | 'medium' | 'large';

export function sizeTier(rendered: PricedDesign['rendered']): SizeTier {
  if (!rendered) return 'small';
  const longest = Math.max(rendered.widthCm, rendered.heightCm);
  if (longest >= SIZE_TIERS.largeFromCm) return 'large';
  if (longest >= SIZE_TIERS.mediumFromCm) return 'medium';
  return 'small';
}

/** Fee codes that apply to one design. */
export function feeCodesFor(d: PricedDesign): FeeCode[] {
  const codes: FeeCode[] = [d.design.type === 'text' ? 'text' : 'logo'];
  const tier = sizeTier(d.rendered);
  if (tier === 'medium') codes.push('size_medium');
  if (tier === 'large') codes.push('size_large');
  const style = d.design.stitchStyle ?? 'flat';
  if (style !== 'flat') codes.push(`style_${style}` as FeeCode);
  if (d.design.type === 'text' && findFont(d.design.fontId)?.premium) codes.push('font_premium');
  return codes;
}

export interface FeeLine {
  kind: FeeCode;
  label: string;
  /** How many times this fee applies to one item (e.g. two logos → 2). */
  perItem: number;
  unitPrice: number;
  variantId: string | null;
}

export interface BulkDiscount extends BulkTier {
  /** Minor units saved across the whole order. */
  amount: number;
}

export interface PriceBreakdown {
  basePrice: number;
  fees: FeeLine[];
  /** Base + all fees for one item. */
  perItem: number;
  quantity: number;
  /** Total after the bulk discount. */
  total: number;
  /** True when every non-zero fee can be charged through a fee variant. */
  chargeable: boolean;
  /** Bulk discount reached by `quantity` (garments only), if any. */
  bulkDiscount: BulkDiscount | null;
  /** The next tier up and how many more items reach it. */
  nextBulkTier: (BulkTier & { more: number }) | null;
}

export const feePrice = (pricing: PricingSettings, code: FeeCode): number =>
  pricing.fees[code]?.price ?? 0;

export function priceBreakdown(
  designs: PricedDesign[],
  basePrice: number,
  quantity: number,
  pricing: PricingSettings,
): PriceBreakdown {
  const counts = new Map<FeeCode, number>();
  for (const d of designs)
    for (const code of feeCodesFor(d)) counts.set(code, (counts.get(code) ?? 0) + 1);
  const fees: FeeLine[] = [];
  for (const code of FEE_CODES) {
    const n = counts.get(code);
    const fee = pricing.fees[code];
    if (!n || !fee || fee.price <= 0) continue;
    fees.push({
      kind: code,
      label: FEE_CATALOG[code].label,
      perItem: n,
      unitPrice: fee.price,
      variantId: fee.variantId,
    });
  }
  const perItem = basePrice + fees.reduce((s, f) => s + f.unitPrice * f.perItem, 0);
  return withBulkDiscount(
    {
      basePrice,
      fees,
      perItem,
      quantity,
      total: perItem * quantity,
      chargeable: fees.every((f) => !!f.variantId),
      bulkDiscount: null,
      nextBulkTier: null,
    },
    basePrice * quantity,
    pricing,
  );
}

/** Highest tier reached by `quantity`, and the next one up. */
export function bulkTierFor(
  quantity: number,
  tiers: BulkTier[] = [],
): { tier: BulkTier | null; next: BulkTier | null } {
  const sorted = [...tiers].sort((a, b) => a.minQuantity - b.minQuantity);
  let tier: BulkTier | null = null;
  for (const t of sorted) if (quantity >= t.minQuantity) tier = t;
  return { tier, next: sorted.find((t) => t.minQuantity > quantity) ?? null };
}

/**
 * Applies the bulk tier for `b.quantity` to the garment subtotal (pre-discount `b.total` must
 * already include every item). Team orders pass the summed subtotal across rows.
 */
export function withBulkDiscount(
  b: PriceBreakdown,
  garmentSubtotal: number,
  pricing: PricingSettings,
): PriceBreakdown {
  const gross = b.total + (b.bulkDiscount?.amount ?? 0);
  const { tier, next } = bulkTierFor(b.quantity, pricing.bulkTiers);
  const amount = tier ? Math.round((garmentSubtotal * tier.percentOff) / 100) : 0;
  return {
    ...b,
    total: gross - amount,
    bulkDiscount: tier && amount > 0 ? { ...tier, amount } : null,
    nextBulkTier: next ? { ...next, more: next.minQuantity - b.quantity } : null,
  };
}

/**
 * Parses the block setting ("10: 10" or "10+ = 10%" per line → 10 items, 10% off).
 * Invalid lines are ignored; percentages are clamped to 1–90.
 */
export function parseBulkTiers(text: string | null | undefined): BulkTier[] {
  const tiers = new Map<number, number>();
  for (const line of (text ?? '').split(/\r?\n/)) {
    const m = line.match(/^\s*(\d+)\s*\+?\s*[:=]\s*(\d+(?:\.\d+)?)\s*%?\s*$/);
    if (!m) continue;
    const minQuantity = Number(m[1]);
    const percentOff = Math.min(90, Number(m[2]));
    if (minQuantity >= 2 && percentOff >= 1) tiers.set(minQuantity, percentOff);
  }
  return [...tiers]
    .map(([minQuantity, percentOff]) => ({ minQuantity, percentOff }))
    .sort((a, b) => a.minQuantity - b.minQuantity);
}

/** Cart lines (variant + quantity) needed to charge the fees for `quantity` items. */
export function feeCartLines(
  b: PriceBreakdown,
): { kind: FeeCode; variantId: string; quantity: number }[] {
  return b.fees
    .filter((f): f is FeeLine & { variantId: string } => !!f.variantId)
    .map((f) => ({ kind: f.kind, variantId: f.variantId, quantity: f.perItem * b.quantity }));
}

/** Match a Shopify fee-product variant title to a fee code ("Large size" → size_large). */
export function feeCodeForVariantTitle(title: string): FeeCode | null {
  const t = title.trim().toLowerCase();
  for (const code of FEE_CODES) if (FEE_CATALOG[code].variantTitle.toLowerCase() === t) return code;
  return null;
}

export function isFeeCode(v: unknown): v is FeeCode {
  return typeof v === 'string' && (FEE_CODES as string[]).includes(v);
}
