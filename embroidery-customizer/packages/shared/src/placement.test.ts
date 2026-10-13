import { describe, expect, it } from 'vitest';
import { TSHIRT_V1, availablePlacements } from './models';
import {
  constrainPlacement,
  defaultPlacement,
  imageIntrinsicSize,
  resolvePlacement,
  rotatedExtents,
} from './placement';
import type { ImageDesign } from './types';

const adapter = TSHIRT_V1;

describe('placement presets', () => {
  it('offers front and back positions, sleeves unavailable for this model', () => {
    const ids = availablePlacements(adapter).map((p) => p.id);
    expect(ids).toEqual(['left_chest', 'center_chest', 'right_chest', 'upper_back', 'center_back']);
    expect(adapter.placements.find((p) => p.id === 'left_sleeve')?.available).toBe(false);
  });

  it('places each chest position at a visibly distinct location', () => {
    const centers = ['left_chest', 'center_chest', 'right_chest'].map(
      (id) =>
        resolvePlacement(adapter, defaultPlacement(adapter, id as never), {
          widthCm: 5,
          heightCm: 2,
        }).center,
    );
    // left chest is on the garment's +X side (wearer's left)
    expect(centers[0]!.x).toBeGreaterThan(centers[1]!.x + 0.05);
    expect(centers[2]!.x).toBeLessThan(centers[1]!.x - 0.05);
  });
});

describe('resolvePlacement', () => {
  it('keeps requested size when it fits', () => {
    const r = resolvePlacement(adapter, defaultPlacement(adapter, 'center_chest'), {
      widthCm: 10,
      heightCm: 4,
    });
    expect(r.widthCm).toBe(10);
    expect(r.heightCm).toBe(4);
    expect(r.fitted).toBe(false);
  });

  it('fits oversized designs into the placement area preserving aspect ratio', () => {
    const r = resolvePlacement(adapter, defaultPlacement(adapter, 'left_chest'), {
      widthCm: 18,
      heightCm: 3,
    });
    expect(r.widthCm).toBeCloseTo(9, 5);
    expect(r.heightCm).toBeCloseTo(1.5, 5);
    expect(r.fitted).toBe(true);
  });

  it('applies the placement scale before fitting', () => {
    const p = { ...defaultPlacement(adapter, 'center_back'), scale: 1.5 };
    const r = resolvePlacement(adapter, p, { widthCm: 10, heightCm: 10 });
    expect(r.widthCm).toBe(15);
  });

  it('mirrors horizontal offsets on the back so "right" matches the viewer', () => {
    const front = resolvePlacement(
      adapter,
      { ...defaultPlacement(adapter, 'center_chest'), offsetXCm: 2 },
      { widthCm: 4, heightCm: 2 },
    );
    const back = resolvePlacement(
      adapter,
      { ...defaultPlacement(adapter, 'center_back'), offsetXCm: 2 },
      { widthCm: 4, heightCm: 2 },
    );
    expect(front.center.x).toBeGreaterThan(front.preset.anchor.x);
    expect(back.center.x).toBeLessThan(back.preset.anchor.x);
    expect(front.effectiveOffsetXCm).toBeCloseTo(2, 1);
    expect(back.effectiveOffsetXCm).toBeCloseTo(2, 1);
  });

  it('pulls designs back inside the safe bounds and reports it', () => {
    // A wide upper-back design rotated 45° grows tall enough to cross the collar line.
    const p = { ...defaultPlacement(adapter, 'upper_back'), offsetYCm: 2, rotationDeg: 45 };
    const r = resolvePlacement(adapter, p, { widthCm: 24, heightCm: 7 });
    expect(r.adjusted).toBe(true);
    const ext = rotatedExtents(r.widthCm, r.heightCm, 45);
    const halfY = ext.heightCm / 2 / (adapter.expectedSize.y * adapter.cmPerUnit);
    expect(r.center.y + halfY).toBeLessThanOrEqual(adapter.surfaces[1]!.safeBounds.yMax + 1e-9);
  });

  it('accounts for rotation when checking bounds', () => {
    const e = rotatedExtents(10, 2, 90);
    expect(e.widthCm).toBeCloseTo(2);
    expect(e.heightCm).toBeCloseTo(10);
  });
});

describe('constrainPlacement', () => {
  it('clamps offsets, rotation and scale to the preset limits', () => {
    const p = constrainPlacement(adapter, {
      ...defaultPlacement(adapter, 'left_chest'),
      offsetXCm: 50,
      offsetYCm: -50,
      rotationDeg: 400,
      scale: 9,
    });
    expect(p.offsetXCm).toBe(3);
    expect(p.offsetYCm).toBe(-3);
    expect(p.rotationDeg).toBe(45);
    expect(p.scale).toBe(1.5);
  });

  it('treats NaN input as the minimum instead of propagating it', () => {
    const p = constrainPlacement(adapter, {
      ...defaultPlacement(adapter, 'left_chest'),
      offsetXCm: Number.NaN,
    });
    expect(Number.isFinite(p.offsetXCm)).toBe(true);
  });
});

describe('imageIntrinsicSize', () => {
  it('derives height from the artwork aspect ratio', () => {
    const preset = adapter.placements.find((p) => p.id === 'center_chest')!;
    const image: ImageDesign = {
      type: 'image',
      storageRef: null,
      previewUrl: null,
      originalFilename: 'a.png',
      mimeType: 'image/png',
      byteSize: 10,
      widthPx: 400,
      heightPx: 200,
      scale: 0.5,
    };
    expect(imageIntrinsicSize(preset, image)).toEqual({ widthCm: 11, heightCm: 5.5 });
  });
});
