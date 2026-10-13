import { describe, expect, it } from 'vitest';
import { DemoCartAdapter, type KeyValueStorage } from './demoCart';

const mem = (): KeyValueStorage => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
};

describe('DemoCartAdapter', () => {
  it('keeps different configurations as distinct lines and merges identical ones', async () => {
    const cart = new DemoCartAdapter(mem());
    await cart.addItem({ variantId: '1', quantity: 1, properties: { 'Customization ID': 'a' } });
    await cart.addItem({ variantId: '1', quantity: 1, properties: { 'Customization ID': 'b' } });
    await cart.addItem({ variantId: '1', quantity: 2, properties: { 'Customization ID': 'a' } });
    const snap = await cart.getCart();
    expect(snap.lines.map((l) => [l.properties['Customization ID'], l.quantity])).toEqual([
      ['a', 3],
      ['b', 1],
    ]);
    expect(snap.itemCount).toBe(4);
  });

  it('updates only the edited line, keeps its position and unrelated properties', async () => {
    const storage = mem();
    const cart = new DemoCartAdapter(storage);
    const a = await cart.addItem({
      variantId: '1',
      quantity: 1,
      properties: { 'Customization ID': 'a', 'Embroidery Text': 'A', note: 'keep' },
    });
    await cart.addItem({
      variantId: '1',
      quantity: 1,
      properties: { 'Customization ID': 'b', 'Embroidery Text': 'B' },
    });
    const updated = await cart.updateCustomizedItem({
      lineKey: a.key,
      customizationId: 'a',
      variantId: '2',
      quantity: 1,
      properties: { 'Customization ID': 'a', 'Embroidery Text': 'A2' },
    });
    expect(updated.key).not.toBe(a.key);
    const snap = await new DemoCartAdapter(storage).getCart(); // persisted
    expect(snap.lines[0]!.properties).toEqual({
      note: 'keep',
      'Customization ID': 'a',
      'Embroidery Text': 'A2',
    });
    expect(snap.lines[0]!.variantId).toBe('2');
    expect(snap.lines[1]!.properties['Embroidery Text']).toBe('B');
  });

  it('notifies subscribers and supports removal', async () => {
    const cart = new DemoCartAdapter(mem());
    const counts: number[] = [];
    cart.subscribe((s) => counts.push(s.itemCount));
    const l = await cart.addItem({ variantId: '1', quantity: 2, properties: {} });
    await cart.removeLine(l.key);
    expect(counts).toEqual([2, 0]);
  });
});
