import { describe, expect, it, vi } from 'vitest';
import { ShopifyCartAdapter, findTargetLine, normalizeRoot } from './shopifyCart';
import { CartError, type CartLine } from './types';

type Call = { url: string; body: Record<string, unknown> | null };

/** Minimal in-memory Shopify Ajax cart: keys change whenever properties change. */
function fakeShopify(
  initial: Array<{
    key: string;
    variant_id: number;
    quantity: number;
    properties: Record<string, string>;
  }>,
) {
  let items = initial.map((i) => ({ ...i, product_title: 'Tee', variant_title: 'M', price: 3200 }));
  let n = 100;
  const calls: Call[] = [];
  const cart = () => ({
    items,
    item_count: items.reduce((s, i) => s + i.quantity, 0),
    currency: 'EUR',
  });
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    calls.push({ url, body });
    const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status });
    if (url.endsWith('cart.js')) return json(200, cart());
    if (url.endsWith('cart/add.js')) {
      const item = (
        body!.items as Array<{ id: number; quantity: number; properties: Record<string, string> }>
      )[0]!;
      if (item.id === 999)
        return json(422, { status: 422, description: 'All 1 Tee - M are in your cart.' });
      const added = {
        key: `${item.id}:k${n++}`,
        variant_id: item.id,
        quantity: item.quantity,
        properties: item.properties,
        product_title: 'Tee',
        variant_title: 'M',
        price: 3200,
      };
      items.push(added);
      return json(200, { items: [added] });
    }
    if (url.endsWith('cart/change.js')) {
      const target = items.find((i) => i.key === body!.id);
      if (!target) return json(400, { description: 'no such line' });
      if (body!.quantity === 0) items = items.filter((i) => i !== target);
      else {
        target.quantity = body!.quantity as number;
        if (body!.properties) {
          target.properties = body!.properties as Record<string, string>;
          target.key = `${target.variant_id}:k${n++}`;
        }
      }
      return json(200, cart());
    }
    return json(404, {});
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls, items: () => items };
}

describe('normalizeRoot', () => {
  it('keeps locale-aware roots with a trailing slash', () => {
    expect(normalizeRoot('/fr-ca')).toBe('/fr-ca/');
    expect(normalizeRoot('/')).toBe('/');
    expect(normalizeRoot(undefined)).toBe('/');
  });
});

describe('ShopifyCartAdapter', () => {
  it('adds through the locale-aware cart/add.js with properties', async () => {
    const shop = fakeShopify([]);
    const cart = new ShopifyCartAdapter({ root: '/de', fetchImpl: shop.fetchImpl });
    const line = await cart.addItem({
      variantId: '42',
      quantity: 2,
      properties: { 'Customization ID': 'c1' },
      sellingPlanId: '7',
    });
    expect(shop.calls[0]!.url).toBe('/de/cart/add.js');
    expect(shop.calls[0]!.body).toEqual({
      items: [{ id: 42, quantity: 2, properties: { 'Customization ID': 'c1' }, selling_plan: 7 }],
    });
    expect(line.variantId).toBe('42');
  });

  it('surfaces Shopify error descriptions', async () => {
    const shop = fakeShopify([]);
    const cart = new ShopifyCartAdapter({ fetchImpl: shop.fetchImpl });
    await expect(cart.addItem({ variantId: '999', quantity: 1, properties: {} })).rejects.toThrow(
      'All 1 Tee - M are in your cart.',
    );
    await expect(
      cart.addItem({ variantId: '999', quantity: 1, properties: {} }),
    ).rejects.toBeInstanceOf(CartError);
  });

  it('edits exactly the target line, preserves unrelated properties and survives a stale key', async () => {
    const shop = fakeShopify([
      {
        key: '42:a',
        variant_id: 42,
        quantity: 3,
        properties: { 'Customization ID': 'one', 'Embroidery Text': 'A', 'Gift Note': 'hi' },
      },
      {
        key: '42:b',
        variant_id: 42,
        quantity: 1,
        properties: { 'Customization ID': 'two', 'Embroidery Text': 'B' },
      },
    ]);
    // the key changed after the editor opened (e.g. edited in another tab)
    shop.items()[0]!.key = '42:changed';
    const cart = new ShopifyCartAdapter({ fetchImpl: shop.fetchImpl });
    const updated = await cart.updateCustomizedItem({
      lineKey: '42:a',
      customizationId: 'one',
      variantId: '42',
      quantity: 3,
      properties: { 'Customization ID': 'one', 'Embroidery Text': 'NEW' },
    });
    const change = shop.calls.find((c) => c.url.endsWith('change.js'))!;
    expect(change.body).toEqual({
      id: '42:changed',
      quantity: 3,
      properties: { 'Gift Note': 'hi', 'Customization ID': 'one', 'Embroidery Text': 'NEW' },
    });
    expect(updated.properties['Embroidery Text']).toBe('NEW');
    expect(
      shop.items().find((i) => i.properties['Customization ID'] === 'two')!.properties[
        'Embroidery Text'
      ],
    ).toBe('B');
  });

  it('swaps variants by removing the line and re-adding with merged properties', async () => {
    const shop = fakeShopify([
      {
        key: '42:a',
        variant_id: 42,
        quantity: 2,
        properties: { 'Customization ID': 'one', 'Gift Note': 'x' },
      },
    ]);
    const cart = new ShopifyCartAdapter({ fetchImpl: shop.fetchImpl });
    const line = await cart.updateCustomizedItem({
      lineKey: '42:a',
      customizationId: 'one',
      variantId: '43',
      quantity: 2,
      properties: { 'Customization ID': 'one' },
    });
    expect(line.variantId).toBe('43');
    expect(line.properties['Gift Note']).toBe('x');
    expect(shop.items()).toHaveLength(1);
  });

  it('fails clearly when the line was removed meanwhile', async () => {
    const shop = fakeShopify([]);
    const cart = new ShopifyCartAdapter({ fetchImpl: shop.fetchImpl });
    await expect(
      cart.updateCustomizedItem({
        lineKey: 'x',
        customizationId: 'gone',
        variantId: '1',
        quantity: 1,
        properties: {},
      }),
    ).rejects.toThrow(/no longer in your cart/);
  });
});

describe('findTargetLine', () => {
  const line = (key: string, id: string): CartLine => ({
    key,
    variantId: '1',
    quantity: 1,
    title: '',
    variantTitle: null,
    properties: { 'Customization ID': id },
    price: null,
    image: null,
    sellingPlanId: null,
  });
  it('does not trust a key that now points at a different customization', () => {
    expect(findTargetLine([line('k1', 'other'), line('k2', 'mine')], 'k1', 'mine')?.key).toBe('k2');
  });
});
