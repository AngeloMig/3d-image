import { isFeeCode, type FeeCode } from '@embroidery/shared';
import {
  PROPERTY_KEYS,
  buildFeeProperties,
  readCustomization,
  readFee,
  type LineItemProperties,
} from './properties';
import type { AddItemInput, CartLine } from './types';

export interface WireItem {
  variantId: string;
  quantity: number;
  properties: LineItemProperties;
  sellingPlanId?: string | null;
  meta?: AddItemInput['meta'];
}

export interface FeePlanEntry {
  code: FeeCode;
  variantId: string;
  perItem: number;
}

/** Compact hidden record of the fees an item owes: "logo:2:4402;size_large:1:4405". */
export function encodeFeePlan(fees: FeePlanEntry[]): string {
  return fees.map((f) => `${f.code}:${f.perItem}:${f.variantId}`).join(';');
}

export function decodeFeePlan(value: unknown): FeePlanEntry[] {
  if (typeof value !== 'string' || !value) return [];
  return value.split(';').flatMap((part) => {
    const [code, perItem, variantId] = part.split(':');
    const n = Number(perItem);
    return isFeeCode(code) && n > 0 && variantId ? [{ code, perItem: n, variantId }] : [];
  });
}

/** Expands customized items into cart lines: each item followed by its fee lines. */
export function expandWithFees(inputs: AddItemInput[]): WireItem[] {
  const out: WireItem[] = [];
  for (const input of inputs) {
    const fees = (input.fees ?? []).filter((f) => f.perItem > 0);
    const properties = { ...input.properties };
    // The item remembers what it owes, so a deleted fee line can be restored by the cart sync.
    if (fees.length)
      properties[PROPERTY_KEYS.feePlan] = encodeFeePlan(fees.map((f) => ({ code: f.kind, variantId: f.variantId, perItem: f.perItem })));
    else delete properties[PROPERTY_KEYS.feePlan];
    out.push({
      variantId: input.variantId,
      quantity: input.quantity,
      properties,
      sellingPlanId: input.sellingPlanId ?? null,
      meta: input.meta,
    });
    const id = readCustomization(input.properties).customizationId;
    if (!id) continue;
    for (const fee of fees) {
      out.push({
        variantId: fee.variantId,
        quantity: fee.perItem * input.quantity,
        properties: buildFeeProperties(id, fee.kind, fee.perItem, input.meta?.title ?? 'Custom item'),
        meta: fee.meta,
      });
    }
  }
  return out;
}

export const feeLinesFor = (lines: CartLine[], customizationId: string): CartLine[] =>
  lines.filter((l) => readFee(l.properties)?.customizationId === customizationId);

export interface FeeSyncPlan {
  /** Line key → new quantity (0 removes). */
  updates: Record<string, number>;
  /** Fee lines that were deleted by the customer and must be restored. */
  additions: WireItem[];
}

/**
 * Keeps fee lines consistent with their items: remove fees whose item is gone, set
 * fee quantity = per-item count × item quantity, and restore fee lines that went missing.
 */
export function planFeeSync(lines: CartLine[]): FeeSyncPlan {
  const updates: Record<string, number> = {};
  const additions: WireItem[] = [];
  const qtyById = new Map<string, number>();
  const items: CartLine[] = [];
  for (const l of lines) {
    const id = readCustomization(l.properties).customizationId;
    if (id && !readFee(l.properties)) {
      qtyById.set(id, (qtyById.get(id) ?? 0) + l.quantity);
      items.push(l);
    }
  }
  for (const l of lines) {
    const fee = readFee(l.properties);
    if (!fee) continue;
    const expected = fee.perItem * (qtyById.get(fee.customizationId) ?? 0);
    if (expected !== l.quantity) updates[l.key] = expected;
  }
  for (const item of items) {
    const id = readCustomization(item.properties).customizationId!;
    for (const owed of decodeFeePlan(item.properties[PROPERTY_KEYS.feePlan])) {
      const present = lines.some((l) => {
        const f = readFee(l.properties);
        return f?.customizationId === id && f.kind === owed.code;
      });
      if (!present)
        additions.push({
          variantId: owed.variantId,
          quantity: owed.perItem * (qtyById.get(id) ?? item.quantity),
          properties: buildFeeProperties(id, owed.code, owed.perItem, item.title || 'Custom item'),
        });
    }
  }
  return { updates, additions };
}
