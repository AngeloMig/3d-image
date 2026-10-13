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

export interface AddItemInput {
  variantId: string;
  quantity: number;
  properties: LineItemProperties;
  sellingPlanId?: string | null;
  meta?: LineMeta;
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
}

export type CartListener = (cart: CartSnapshot) => void;

export interface CartAdapter {
  readonly mode: 'demo' | 'shopify';
  getCart(): Promise<CartSnapshot>;
  addItem(input: AddItemInput): Promise<CartLine>;
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
