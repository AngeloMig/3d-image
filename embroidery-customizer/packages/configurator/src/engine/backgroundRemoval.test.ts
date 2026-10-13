import { describe, expect, it } from 'vitest';
import { floodRemoveBackground } from './backgroundRemoval';

/** 10×10 white image with a red square and a white "hole" inside it. */
function logo(): Uint8ClampedArray {
  const w = 10;
  const d = new Uint8ClampedArray(w * w * 4).fill(255);
  for (let y = 2; y < 8; y++)
    for (let x = 2; x < 8; x++) {
      const i = (y * w + x) * 4;
      const hole = x >= 4 && x <= 5 && y >= 4 && y <= 5;
      if (!hole) d.set([200, 20, 30, 255], i);
    }
  return d;
}
const alpha = (d: Uint8ClampedArray, x: number, y: number) => d[(y * 10 + x) * 4 + 3];

describe('floodRemoveBackground', () => {
  it('removes the border-connected background but keeps enclosed white areas', () => {
    const d = logo();
    const r = floodRemoveBackground(d, 10, 10, 30);
    expect(r.background).toEqual([255, 255, 255]);
    expect(alpha(d, 0, 0)).toBe(0); // background gone
    expect(alpha(d, 3, 3)).toBe(255); // red logo kept
    expect(alpha(d, 4, 4)).toBe(255); // white inside the logo kept
    expect(r.removed).toBeCloseTo(64 / 100, 2);
  });

  it('detects images that are already transparent', () => {
    const d = new Uint8ClampedArray(10 * 10 * 4); // all transparent
    expect(floodRemoveBackground(d, 10, 10).alreadyTransparent).toBe(true);
  });
});
