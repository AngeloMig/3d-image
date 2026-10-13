import { mergeLineItemProperties, readCustomization, type LineItemProperties } from './properties';
import {
  CartError,
  type AddItemInput,
  type CartAdapter,
  type CartLine,
  type CartListener,
  type CartSnapshot,
  type UpdateItemInput,
} from './types';

/** Subset of the Shopify Ajax API line item shape we rely on. */
interface AjaxLineItem {
  key: string;
  variant_id: number | string;
  quantity: number;
  title?: string;
  product_title?: string;
  variant_title?: string | null;
  properties?: Record<string, unknown> | null;
  price?: number;
  image?: string | null;
  selling_plan_allocation?: { selling_plan?: { id?: number | string } } | null;
}

interface AjaxCart {
  items: AjaxLineItem[];
  item_count: number;
  currency?: string;
}

/** Normalize the locale-aware storefront root (`window.Shopify.routes.root`, e.g. "/" or "/fr-ca/"). */
export function normalizeRoot(root: string | undefined | null): string {
  const r = (root ?? '/').trim() || '/';
  return r.endsWith('/') ? r : `${r}/`;
}

function toProperties(raw: Record<string, unknown> | null | undefined): LineItemProperties {
  const out: LineItemProperties = {};
  for (const [k, v] of Object.entries(raw ?? {}))
    if (v !== null && v !== undefined) out[k] = String(v);
  return out;
}

export function mapAjaxLine(item: AjaxLineItem): CartLine {
  const planId = item.selling_plan_allocation?.selling_plan?.id;
  return {
    key: item.key,
    variantId: String(item.variant_id),
    quantity: item.quantity,
    title: item.product_title ?? item.title ?? '',
    variantTitle: item.variant_title ?? null,
    properties: toProperties(item.properties),
    price: typeof item.price === 'number' ? item.price : null,
    image: item.image ?? null,
    sellingPlanId: planId !== undefined ? String(planId) : null,
  };
}

/**
 * Locates the cart line being edited. Line keys change whenever properties change, so the
 * captured key can be stale — fall back to the Customization ID, which we control.
 */
export function findTargetLine(
  lines: CartLine[],
  lineKey: string,
  customizationId: string,
): CartLine | null {
  const byKey = lines.find((l) => l.key === lineKey);
  if (byKey && readCustomization(byKey.properties).customizationId === customizationId)
    return byKey;
  const byId = lines.filter(
    (l) => readCustomization(l.properties).customizationId === customizationId,
  );
  return byId[0] ?? null;
}

export interface ShopifyCartOptions {
  /** Locale-aware root, e.g. `window.Shopify.routes.root`. */
  root?: string;
  fetchImpl?: typeof fetch;
}

export class ShopifyCartAdapter implements CartAdapter {
  readonly mode = 'shopify' as const;
  private readonly root: string;
  private readonly fetchImpl: typeof fetch;
  private readonly listeners = new Set<CartListener>();

  constructor(opts: ShopifyCartOptions = {}) {
    this.root = normalizeRoot(opts.root);
    this.fetchImpl = opts.fetchImpl ?? ((...args) => globalThis.fetch(...args));
  }

  private async request<T>(path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.root}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new CartError('We couldn’t reach the cart. Check your connection and try again.');
    }
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      /* non-JSON error page */
    }
    if (!res.ok) {
      const j = (json ?? {}) as { description?: unknown; message?: unknown };
      const msg =
        typeof j.description === 'string'
          ? j.description
          : typeof j.message === 'string'
            ? j.message
            : null;
      throw new CartError(msg ?? `The cart request failed (${res.status}).`, res.status);
    }
    return json as T;
  }

  private emit(cart: CartSnapshot): void {
    this.listeners.forEach((l) => l(cart));
    if (typeof document !== 'undefined')
      document.dispatchEvent(
        new CustomEvent('embroidery:cart:changed', { detail: cart, bubbles: true }),
      );
  }

  private toSnapshot(cart: AjaxCart): CartSnapshot {
    return {
      lines: cart.items.map(mapAjaxLine),
      itemCount: cart.item_count,
      currency: cart.currency ?? null,
    };
  }

  async getCart(): Promise<CartSnapshot> {
    return this.toSnapshot(await this.request<AjaxCart>('cart.js'));
  }

  async addItem(input: AddItemInput): Promise<CartLine> {
    const item: Record<string, unknown> = {
      id: Number(input.variantId),
      quantity: input.quantity,
      properties: input.properties,
    };
    if (input.sellingPlanId) item.selling_plan = Number(input.sellingPlanId);
    const res = await this.request<{ items: AjaxLineItem[] }>('cart/add.js', { items: [item] });
    const added = res.items?.[0];
    if (!added) throw new CartError('The item could not be added to the cart.');
    const cart = await this.getCart();
    this.emit(cart);
    return mapAjaxLine(added);
  }

  async updateCustomizedItem(input: UpdateItemInput): Promise<CartLine> {
    // Always refresh first: the key may have changed since the editor was opened.
    const before = await this.getCart();
    const line = findTargetLine(before.lines, input.lineKey, input.customizationId);
    if (!line)
      throw new CartError(
        'This item is no longer in your cart. Refresh the page and try again.',
        404,
      );
    const properties = mergeLineItemProperties(line.properties, input.properties);

    let after: CartSnapshot;
    if (line.variantId === String(input.variantId)) {
      after = this.toSnapshot(
        await this.request<AjaxCart>('cart/change.js', {
          id: line.key,
          quantity: input.quantity,
          properties,
        }),
      );
    } else {
      // change.js cannot swap variants: remove the line, then add the new variant with the same data.
      await this.request<AjaxCart>('cart/change.js', { id: line.key, quantity: 0 });
      const item: Record<string, unknown> = {
        id: Number(input.variantId),
        quantity: input.quantity,
        properties,
      };
      if (line.sellingPlanId) item.selling_plan = Number(line.sellingPlanId);
      await this.request('cart/add.js', { items: [item] });
      after = await this.getCart();
    }
    this.emit(after);
    const updated = after.lines.find(
      (l) =>
        readCustomization(l.properties).customizationId ===
        readCustomization(properties).customizationId,
    );
    if (!updated)
      throw new CartError(
        'The cart was updated but the item could not be found. Refresh the page.',
      );
    return updated;
  }

  async removeLine(key: string): Promise<CartSnapshot> {
    const cart = this.toSnapshot(
      await this.request<AjaxCart>('cart/change.js', { id: key, quantity: 0 }),
    );
    this.emit(cart);
    return cart;
  }

  subscribe(listener: CartListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
