import { expandWithFees, feeLinesFor, planFeeSync, type WireItem } from './fees';
import { mergeLineItemProperties, readCustomization, readFee, type LineItemProperties } from './properties';
import { findTargetLine } from './shopifyCart';
import {
  CartError,
  type AddItemInput,
  type CartAdapter,
  type CartLine,
  type CartListener,
  type CartSnapshot,
  type UpdateItemInput,
} from './types';

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = 'embroidery-demo-cart-v1';

function memoryStorage(): KeyValueStorage {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

/** Shopify-like line key: variant + hash of properties, so identical configs merge and others don't. */
export function demoLineKey(variantId: string, properties: LineItemProperties): string {
  const stable = JSON.stringify(
    Object.keys(properties)
      .sort()
      .map((k) => [k, properties[k]]),
  );
  let h = 0x811c9dc5;
  for (let i = 0; i < stable.length; i++) {
    h ^= stable.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${variantId}:${(h >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Local demo cart that mimics Shopify Ajax cart semantics (merging, key changes on edit,
 * full property replacement). Clearly labelled as a demo in the UI.
 */
export class DemoCartAdapter implements CartAdapter {
  readonly mode = 'demo' as const;
  private readonly listeners = new Set<CartListener>();
  private readonly storage: KeyValueStorage;

  constructor(storage?: KeyValueStorage) {
    let s = storage;
    if (!s) {
      try {
        s = globalThis.localStorage;
        s.getItem(STORAGE_KEY);
      } catch {
        s = undefined;
      }
    }
    this.storage = s ?? memoryStorage();
  }

  private read(): CartLine[] {
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? (parsed as CartLine[]) : [];
    } catch {
      return [];
    }
  }

  private write(lines: CartLine[]): CartSnapshot {
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      /* storage full / blocked — keep working in memory for this page view */
    }
    const snap = this.snapshot(lines);
    this.listeners.forEach((l) => l(snap));
    return snap;
  }

  private snapshot(lines: CartLine[]): CartSnapshot {
    return { lines, itemCount: lines.reduce((n, l) => n + l.quantity, 0), currency: 'USD' };
  }

  private upsert(lines: CartLine[], input: WireItem, at?: number): CartLine {
    const key = demoLineKey(input.variantId, input.properties);
    const existing = lines.find((l) => l.key === key);
    if (existing) {
      existing.quantity += input.quantity;
      return existing;
    }
    const line: CartLine = {
      key,
      variantId: input.variantId,
      quantity: input.quantity,
      title: input.meta?.title ?? 'Custom embroidered item',
      variantTitle: input.meta?.variantTitle ?? null,
      properties: { ...input.properties },
      price: input.meta?.price ?? null,
      image: input.meta?.image ?? null,
      sellingPlanId: input.sellingPlanId ?? null,
    };
    if (at === undefined) lines.push(line);
    else lines.splice(at, 0, line);
    return line;
  }

  async getCart(): Promise<CartSnapshot> {
    return this.snapshot(this.read());
  }

  async addItem(input: AddItemInput): Promise<CartLine> {
    const [line] = await this.addItems([input]);
    return line!;
  }

  async addItems(inputs: AddItemInput[]): Promise<CartLine[]> {
    if (inputs.some((i) => !(i.quantity >= 1))) throw new CartError('Quantity must be at least 1.', 422);
    const lines = this.read();
    const added: CartLine[] = [];
    for (const item of expandWithFees(inputs)) {
      const line = this.upsert(lines, item);
      if (!readFee(line.properties)) added.push({ ...line });
    }
    this.write(lines);
    return added;
  }

  async updateCustomizedItem(input: UpdateItemInput): Promise<CartLine> {
    let lines = this.read();
    const target = findTargetLine(lines, input.lineKey, input.customizationId);
    if (!target) throw new CartError('This item is no longer in your cart.', 404);
    const index = lines.indexOf(target);
    lines.splice(index, 1);
    const oldFees = new Set(feeLinesFor(lines, input.customizationId).map((l) => l.key));
    lines = lines.filter((l) => !oldFees.has(l.key));
    const properties = mergeLineItemProperties(target.properties, input.properties);
    const meta = input.meta ?? {
      title: target.title,
      variantTitle: target.variantTitle ?? '',
      price: target.price ?? 0,
      image: target.image,
    };
    const [item, ...fees] = expandWithFees([{ ...input, properties, meta }]);
    const line = this.upsert(lines, { ...item!, sellingPlanId: target.sellingPlanId }, Math.min(index, lines.length));
    if (input.meta?.image === undefined && target.image) line.image = target.image;
    fees.forEach((f, i) => this.upsert(lines, f, Math.min(lines.indexOf(line) + 1 + i, lines.length)));
    this.write(lines);
    if (readCustomization(line.properties).customizationId !== input.customizationId)
      throw new CartError('Updated line lost its customization reference.');
    return { ...line };
  }

  async removeLine(key: string): Promise<CartSnapshot> {
    const lines = this.read();
    const line = lines.find((l) => l.key === key);
    const id = line ? readCustomization(line.properties).customizationId : null;
    const drop = new Set([key, ...(id ? feeLinesFor(lines, id).map((f) => f.key) : [])]);
    return this.write(lines.filter((l) => !drop.has(l.key)));
  }

  async setQuantity(key: string, quantity: number): Promise<CartSnapshot> {
    const lines = this.read();
    const line = lines.find((l) => l.key === key);
    if (line) line.quantity = Math.max(0, Math.round(quantity));
    this.write(lines.filter((l) => l.quantity > 0));
    return (await this.syncFees()) ?? this.snapshot(this.read());
  }

  async syncFees(): Promise<CartSnapshot | null> {
    const lines = this.read();
    const { updates, additions } = planFeeSync(lines);
    if (Object.keys(updates).length === 0 && additions.length === 0) return null;
    for (const l of lines) if (l.key in updates) l.quantity = updates[l.key]!;
    const kept = lines.filter((l) => l.quantity > 0);
    for (const a of additions) this.upsert(kept, a);
    return this.write(kept);
  }

  subscribe(listener: CartListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
