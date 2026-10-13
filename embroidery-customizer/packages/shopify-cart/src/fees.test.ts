import { describe, expect, it } from 'vitest';
import { DemoCartAdapter, type KeyValueStorage } from './demoCart';
import { planFeeSync } from './fees';
import { readFee } from './properties';
import type { CartLine } from './types';

const mem = (): KeyValueStorage => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
};
const item = (id: string, quantity = 1) => ({
  variantId: 'shirt',
  quantity,
  properties: { 'Customization ID': id, 'Embroidery Text': id },
  fees: [
    { kind: 'text' as const, variantId: 'fee-text', perItem: 1 },
    { kind: 'logo' as const, variantId: 'fee-logo', perItem: 2 },
  ],
});

describe('fee lines', () => {
  it('adds a whole team order (items + fees) in one call with fee quantity = per item × qty', async () => {
    const cart = new DemoCartAdapter(mem());
    const added = await cart.addItems([item('a', 2), item('b', 1)]);
    expect(added.map((l) => l.properties['Customization ID'])).toEqual(['a', 'b']);
    const lines = (await cart.getCart()).lines;
    const fees = lines.filter((l) => readFee(l.properties));
    expect(fees.map((f) => [readFee(f.properties)!.customizationId, f.variantId, f.quantity])).toEqual([
      ['a', 'fee-text', 2],
      ['a', 'fee-logo', 4],
      ['b', 'fee-text', 1],
      ['b', 'fee-logo', 2],
    ]);
  });

  it('removing an item removes its fees; quantity changes resync fees', async () => {
    const cart = new DemoCartAdapter(mem());
    await cart.addItems([item('a', 1), item('b', 1)]);
    const lines = (await cart.getCart()).lines;
    const a = lines.find((l) => l.properties['Customization ID'] === 'a')!;
    const b = lines.find((l) => l.properties['Customization ID'] === 'b')!;
    await cart.removeLine(a.key);
    expect((await cart.getCart()).lines.every((l) => (readFee(l.properties)?.customizationId ?? 'b') === 'b')).toBe(true);
    await cart.setQuantity(b.key, 3);
    const logoFee = (await cart.getCart()).lines.find((l) => l.variantId === 'fee-logo')!;
    expect(logoFee.quantity).toBe(6);
  });

  it('editing an item replaces its fees (e.g. a logo removed)', async () => {
    const cart = new DemoCartAdapter(mem());
    const [a] = await cart.addItems([item('a', 1)]);
    await cart.updateCustomizedItem({
      lineKey: a!.key,
      customizationId: 'a',
      variantId: 'shirt',
      quantity: 1,
      properties: { 'Customization ID': 'a', 'Embroidery Text': 'A2' },
      fees: [{ kind: 'text', variantId: 'fee-text', perItem: 1 }],
    });
    const fees = (await cart.getCart()).lines.filter((l) => readFee(l.properties));
    expect(fees.map((f) => f.variantId)).toEqual(['fee-text']);
  });

  it('plans removal of orphaned fees and quantity fixes', () => {
    const line = (key: string, quantity: number, properties: Record<string, string>): CartLine => ({
      key, variantId: 'v', quantity, title: '', variantTitle: null, properties, price: null, image: null, sellingPlanId: null,
    });
    const plan = planFeeSync([
      line('shirt', 2, { 'Customization ID': 'x' }),
      line('fee-ok', 2, { '_Embroidery Fee For': 'x', '_Embroidery Fee Kind': 'text', '_Embroidery Fee Per Item': '1' }),
      line('fee-wrong', 1, { '_Embroidery Fee For': 'x', '_Embroidery Fee Kind': 'logo', '_Embroidery Fee Per Item': '1' }),
      line('fee-orphan', 1, { '_Embroidery Fee For': 'gone', '_Embroidery Fee Kind': 'text', '_Embroidery Fee Per Item': '1' }),
    ]);
    expect(plan.updates).toEqual({ 'fee-wrong': 2, 'fee-orphan': 0 });
    expect(plan.additions).toEqual([]);
  });

  it('restores a fee line the customer deleted (no free embroidery)', async () => {
    const cart = new DemoCartAdapter(mem());
    await cart.addItems([item('a', 2)]);
    const logoFee = (await cart.getCart()).lines.find((l) => l.variantId === 'fee-logo')!;
    // simulate the customer removing only the fee line in the theme cart
    const lines = (await cart.getCart()).lines.filter((l) => l.key !== logoFee.key);
    const plan = planFeeSync(lines);
    expect(plan.additions).toEqual([
      expect.objectContaining({ variantId: 'fee-logo', quantity: 4, properties: expect.objectContaining({ '_Embroidery Fee Kind': 'logo' }) }),
    ]);
    const shirt = lines.find((l) => l.properties['Customization ID'] === 'a')!;
    expect(shirt.properties['_Embroidery Fees']).toBe('text:1:fee-text;logo:2:fee-logo');
  });
});
