import { LIMITS } from './catalog';
import { getPreset, getSurface, type ModelAdapter, type PlacementPreset } from './models';
import type { ImageDesign, NormalizedPoint, Placement, PlacementId } from './types';

export interface SizeCm {
  widthCm: number;
  heightCm: number;
}

export interface ResolvedPlacement {
  preset: PlacementPreset;
  /** Final design centre in normalized garment bounding-box coordinates. */
  center: NormalizedPoint;
  widthCm: number;
  heightCm: number;
  requestedWidthCm: number;
  requestedHeightCm: number;
  /** True when the design was scaled down to fit the placement's maximum area. */
  fitted: boolean;
  /** Offsets after keeping the (rotated) design inside the surface's safe bounds. */
  effectiveOffsetXCm: number;
  effectiveOffsetYCm: number;
  /** True when the requested offsets had to be pulled back inside the safe bounds. */
  adjusted: boolean;
}

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

const round = (value: number, digits = 2): number => {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
};

/** Constrain user-entered placement values to the preset / global limits. */
export function constrainPlacement(adapter: ModelAdapter, placement: Placement): Placement {
  const preset = getPreset(adapter, placement.positionId);
  if (!preset) return placement;
  return {
    ...placement,
    surfaceId: preset.surfaceId,
    offsetXCm: round(clamp(placement.offsetXCm, -preset.maxOffsetCm.x, preset.maxOffsetCm.x), 1),
    offsetYCm: round(clamp(placement.offsetYCm, -preset.maxOffsetCm.y, preset.maxOffsetCm.y), 1),
    rotationDeg: Math.round(
      clamp(placement.rotationDeg, -LIMITS.maxRotationDeg, LIMITS.maxRotationDeg),
    ),
    scale: round(clamp(placement.scale, LIMITS.minPlacementScale, LIMITS.maxPlacementScale), 2),
  };
}

export function defaultPlacement(adapter: ModelAdapter, positionId: PlacementId): Placement {
  const preset = getPreset(adapter, positionId);
  if (!preset) throw new Error(`Unknown placement ${positionId} for model ${adapter.id}`);
  return {
    surfaceId: preset.surfaceId,
    positionId,
    uvCenter: null,
    offsetXCm: 0,
    offsetYCm: 0,
    rotationDeg: 0,
    scale: 1,
  };
}

/** Intrinsic artwork size (before placement scale) for an uploaded image. */
export function imageIntrinsicSize(preset: PlacementPreset, design: ImageDesign): SizeCm {
  const widthCm =
    preset.maxWidthCm * clamp(design.scale, LIMITS.minImageScale, LIMITS.maxImageScale);
  const aspect = design.widthPx > 0 ? design.heightPx / design.widthPx : 1;
  return { widthCm, heightCm: widthCm * aspect };
}

/** Axis-aligned extents of a rotated rectangle. */
export function rotatedExtents(widthCm: number, heightCm: number, rotationDeg: number): SizeCm {
  const r = (rotationDeg * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  return { widthCm: widthCm * c + heightCm * s, heightCm: widthCm * s + heightCm * c };
}

/**
 * Turn a placement + intrinsic design size into a concrete, validated position and size.
 * Pure and deterministic so it can run in the browser, in tests and on the server.
 */
export function resolvePlacement(
  adapter: ModelAdapter,
  rawPlacement: Placement,
  intrinsic: SizeCm,
): ResolvedPlacement {
  const placement = constrainPlacement(adapter, rawPlacement);
  const preset = getPreset(adapter, placement.positionId);
  const surface = preset && getSurface(adapter, preset.surfaceId);
  if (!preset || !surface) throw new Error(`Unknown placement ${placement.positionId}`);

  const requestedWidthCm = Math.max(0.01, intrinsic.widthCm * placement.scale);
  const requestedHeightCm = Math.max(0.01, intrinsic.heightCm * placement.scale);
  const fit = Math.min(
    1,
    preset.maxWidthCm / requestedWidthCm,
    preset.maxHeightCm / requestedHeightCm,
  );
  const widthCm = requestedWidthCm * fit;
  const heightCm = requestedHeightCm * fit;

  const garmentWidthCm = adapter.expectedSize.x * adapter.cmPerUnit;
  const garmentHeightCm = adapter.expectedSize.y * adapter.cmPerUnit;
  // When facing the back, "right" on screen is the garment's -X direction.
  const mirror = surface.facing === '-z' ? -1 : 1;

  const ext = rotatedExtents(widthCm, heightCm, placement.rotationDeg);
  const halfX = ext.widthCm / 2 / garmentWidthCm;
  const halfY = ext.heightCm / 2 / garmentHeightCm;
  const b = surface.safeBounds;

  const wantX = preset.anchor.x + (mirror * placement.offsetXCm) / garmentWidthCm;
  const wantY = preset.anchor.y + placement.offsetYCm / garmentHeightCm;
  const x =
    b.xMax - b.xMin <= 2 * halfX
      ? (b.xMin + b.xMax) / 2
      : clamp(wantX, b.xMin + halfX, b.xMax - halfX);
  const y =
    b.yMax - b.yMin <= 2 * halfY
      ? (b.yMin + b.yMax) / 2
      : clamp(wantY, b.yMin + halfY, b.yMax - halfY);

  const effectiveOffsetXCm = round(((x - preset.anchor.x) * garmentWidthCm) / mirror, 2);
  const effectiveOffsetYCm = round((y - preset.anchor.y) * garmentHeightCm, 2);
  const adjusted =
    Math.abs(effectiveOffsetXCm - placement.offsetXCm) > 0.05 ||
    Math.abs(effectiveOffsetYCm - placement.offsetYCm) > 0.05;

  return {
    preset,
    center: { x, y },
    widthCm: round(widthCm),
    heightCm: round(heightCm),
    requestedWidthCm: round(requestedWidthCm),
    requestedHeightCm: round(requestedHeightCm),
    fitted: fit < 0.999,
    effectiveOffsetXCm,
    effectiveOffsetYCm,
    adjusted,
  };
}
