import type { FeeKind } from '@embroidery/shared';
import type { LineItemProperties } from './properties';

export interface CartLine {
  key: string;
  variantId: string;
  quantity: number;
  title: string;
  variantTitle: string | null;
  properties: LineItemProperties;
  /** Unit price in minor units. */
  price: number | null;
  image: string | null;
  sellingPlanId: string | null;
}

export interface CartSnapshot {
  lines: CartLine[];
  itemCount: number;
  currency: string | null;
}

/** Display-only metadata for the demo cart (Shopify derives this server-side). */
export interface LineMeta {
  title: string;
  variantTitle: string;
  price: number;
  image?: string | null;
}

/** An embroidery fee charged via a fee-product variant: quantity = perItem × item quantity. */
export interface FeeInput {
  kind: FeeKind;
  variantId: string;
  perItem: number;
  /** Demo cart display only. */
  meta?: LineMeta;
}

export interface AddItemInput {
  variantId: string;
  quantity: number;
  properties: LineItemProperties;
  sellingPlanId?: string | null;
  meta?: LineMeta;
  fees?: FeeInput[];
}

export interface UpdateItemInput {
  /** Line key captured when the editor was opened (may be stale). */
  lineKey: string;
  /** Customization ID of the line being edited — used to re-find the line if the key changed. */
  customizationId: string;
  variantId: string;
  quantity: number;
  properties: LineItemProperties;
  meta?: LineMeta;
  /** Replaces this item's fee lines. */
  fees?: FeeInput[];
}

export type CartListener = (cart: CartSnapshot) => void;

export interface CartAdapter {
  readonly mode: 'demo' | 'shopify';
  getCart(): Promise<CartSnapshot>;
  addItem(input: AddItemInput): Promise<CartLine>;
  /** Adds several customized items (and their fee lines) in ONE cart request. */
  addItems(inputs: AddItemInput[]): Promise<CartLine[]>;
  /** Removes orphaned fee lines and fixes fee quantities after cart quantity changes. */
  syncFees(): Promise<CartSnapshot | null>;
  updateCustomizedItem(input: UpdateItemInput): Promise<CartLine>;
  removeLine(key: string): Promise<CartSnapshot>;
  subscribe(listener: CartListener): () => void;
}

export class CartError extends Error {
  constructor(
    message: string,
    public readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'CartError';
  }
}
