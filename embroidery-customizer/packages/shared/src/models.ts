import type { NormalizedPoint, NormalizedRect, PlacementId, SurfaceId } from './types';

/**
 * Per-GLB adapter: everything model-specific lives here, not in components.
 *
 * Coordinates are in NORMALIZED garment bounding-box space so a re-exported or rescaled
 * model keeps working: x 0..1 spans the garment's -X..+X extent, y 0..1 spans hem..shoulder.
 * The engine projects these anchors onto the real mesh surface along the surface's facing axis.
 */

export interface SurfaceConfig {
  id: SurfaceId;
  label: string;
  /** World axis the surface faces; decals are projected along the opposite direction. */
  facing: '+z' | '-z' | '+x' | '-x';
  available: boolean;
  unavailableReason?: string;
  /** Area in which a design (incl. rotation) must stay. */
  safeBounds: NormalizedRect;
}

export interface PlacementPreset {
  id: PlacementId;
  label: string;
  surfaceId: SurfaceId;
  available: boolean;
  unavailableReason?: string;
  anchor: NormalizedPoint;
  maxWidthCm: number;
  maxHeightCm: number;
  defaultTextSizeCm: number;
  defaultImageWidthCm: number;
  maxOffsetCm: { x: number; y: number };
  /** Positions that physically overlap this one and can't be combined on one garment. */
  conflictsWith?: PlacementId[];
}

export interface ModelAdapter {
  id: string;
  label: string;
  /** File name of the bundled model (demo: /models/<file>, Shopify: extension asset). */
  modelFile: string;
  /** Optional mesh name filter for embroiderable meshes; empty = all meshes. */
  embroideryMeshNames: string[];
  /** Real-world centimetres per model unit (glTF metres → 100). */
  cmPerUnit: number;
  /** Measured bounding box in model units — verified at load time to catch wrong exports. */
  expectedSize: { x: number; y: number; z: number };
  /** Depth of the decal projector box in cm (keeps a front decal off the back panel). */
  decalDepthCm: number;
  /**
   * Multiplier for the authored roughness map. Keeps the map's woven variation but remaps it
   * into a cotton-like range so dark colours don't look glossy. 1 = untouched.
   */
  fabricRoughnessScale: number;
  surfaces: SurfaceConfig[];
  placements: PlacementPreset[];
}

const UNAVAILABLE_SLEEVE =
  'Sleeve embroidery is not calibrated for this model yet. Supported in the data model for future garments.';

/**
 * Measurements taken on the optimized GLB by raycasting the real surface (see
 * scripts/prepare-garments.mjs and the calibration notes on each garment below).
 * Vertical distances are in cm from the top (shoulders/collar) of the bounding box.
 */
interface GarmentMeasurements {
  id: string;
  label: string;
  modelFile: string;
  embroideryMeshNames: string[];
  /** Bounding box in model units (metres). */
  size: { x: number; y: number; z: number };
  /** Centre-front neckline (polo: bottom of the placket opening). */
  frontNeckCm: number;
  /** Centre-back neckline, just under the collar. */
  backNeckCm: number;
  /** Centre-front hem, from the BOTTOM of the bounding box (long sleeves hang below it). */
  hemCm: number;
  /** Half the torso width at chest height. */
  torsoHalfWidthCm: number;
  /** Positions this cut can't take, with the reason shown to customers. */
  unavailable?: Partial<Record<PlacementId, string>>;
  fabricRoughnessScale?: number;
}

/**
 * Builds an adapter from measurements with one set of placement rules, so every garment puts a
 * left-chest logo at the same spot a print shop would: 8 cm under the neckline, 9 cm off centre.
 */
function garment(m: GarmentMeasurements): ModelAdapter {
  const W = m.size.x * 100;
  const H = m.size.y * 100;
  // Normalized coordinates: x from the centre line (cm), y from the top (cm).
  const nx = (cmFromCentre: number) => +(0.5 + cmFromCentre / W).toFixed(4);
  const ny = (cmFromTop: number) => +(1 - cmFromTop / H).toFixed(4);
  const torso = m.torsoHalfWidthCm;
  const safeX = { xMin: nx(-(torso - 1)), xMax: nx(torso - 1) };
  const hemTop = H - m.hemCm - 4; // keep designs 4 cm above the hem
  const chestY = m.frontNeckCm + 8;
  const centreChestY = m.frontNeckCm + 14;
  const upperBackY = m.backNeckCm + 7;
  const centreBackY = Math.min(m.backNeckCm + 25, hemTop - 14);
  const wide = (cm: number) => Math.min(cm, Math.round(2 * torso - 6));
  const off = (id: PlacementId) =>
    m.unavailable?.[id]
      ? { available: false, unavailableReason: m.unavailable[id] }
      : { available: true };
  return {
    id: m.id,
    label: m.label,
    modelFile: m.modelFile,
    embroideryMeshNames: m.embroideryMeshNames,
    cmPerUnit: 100,
    expectedSize: m.size,
    decalDepthCm: 10,
    fabricRoughnessScale: m.fabricRoughnessScale ?? 1,
    surfaces: [
      {
        id: 'front',
        label: 'Front',
        facing: '+z',
        available: true,
        safeBounds: { ...safeX, yMin: +(1 - hemTop / H).toFixed(4), yMax: ny(m.frontNeckCm + 1.5) },
      },
      {
        id: 'back',
        label: 'Back',
        facing: '-z',
        available: true,
        safeBounds: { ...safeX, yMin: +(1 - hemTop / H).toFixed(4), yMax: ny(m.backNeckCm + 1.5) },
      },
      {
        id: 'left_sleeve',
        label: 'Left sleeve',
        facing: '+x',
        available: false,
        unavailableReason: UNAVAILABLE_SLEEVE,
        safeBounds: { xMin: 0, xMax: 1, yMin: 0, yMax: 1 },
      },
      {
        id: 'right_sleeve',
        label: 'Right sleeve',
        facing: '-x',
        available: false,
        unavailableReason: UNAVAILABLE_SLEEVE,
        safeBounds: { xMin: 0, xMax: 1, yMin: 0, yMax: 1 },
      },
    ],
    placements: [
      {
        // Wearer's left = +X = viewer's right when facing the shirt.
        id: 'left_chest',
        label: 'Left Chest',
        conflictsWith: ['center_chest'],
        surfaceId: 'front',
        ...off('left_chest'),
        anchor: { x: nx(9), y: ny(chestY) },
        maxWidthCm: 9,
        maxHeightCm: 7,
        defaultTextSizeCm: 1,
        defaultImageWidthCm: 7,
        maxOffsetCm: { x: 3, y: 3 },
      },
      {
        id: 'center_chest',
        label: 'Center Chest',
        conflictsWith: ['left_chest', 'right_chest'],
        surfaceId: 'front',
        ...off('center_chest'),
        anchor: { x: 0.5, y: ny(centreChestY) },
        maxWidthCm: wide(22),
        maxHeightCm: 15,
        defaultTextSizeCm: 2.5,
        defaultImageWidthCm: 16,
        maxOffsetCm: { x: 4, y: 5 },
      },
      {
        id: 'right_chest',
        label: 'Right Chest',
        conflictsWith: ['center_chest'],
        surfaceId: 'front',
        ...off('right_chest'),
        anchor: { x: nx(-9), y: ny(chestY) },
        maxWidthCm: 9,
        maxHeightCm: 7,
        defaultTextSizeCm: 1,
        defaultImageWidthCm: 7,
        maxOffsetCm: { x: 3, y: 3 },
      },
      {
        id: 'upper_back',
        label: 'Upper Back',
        surfaceId: 'back',
        ...off('upper_back'),
        anchor: { x: 0.5, y: ny(upperBackY) },
        maxWidthCm: wide(24),
        maxHeightCm: 7,
        defaultTextSizeCm: 2.2,
        defaultImageWidthCm: 18,
        maxOffsetCm: { x: 3, y: 2 },
      },
      {
        id: 'center_back',
        label: 'Center Back',
        surfaceId: 'back',
        ...off('center_back'),
        anchor: { x: 0.5, y: ny(centreBackY) },
        maxWidthCm: wide(26),
        maxHeightCm: 28,
        defaultTextSizeCm: 3.5,
        defaultImageWidthCm: 22,
        maxOffsetCm: { x: 4, y: 8 },
      },
      {
        id: 'left_sleeve',
        label: 'Left Sleeve',
        surfaceId: 'left_sleeve',
        available: false,
        unavailableReason: UNAVAILABLE_SLEEVE,
        anchor: { x: 0.9, y: 0.75 },
        maxWidthCm: 7,
        maxHeightCm: 7,
        defaultTextSizeCm: 1,
        defaultImageWidthCm: 6,
        maxOffsetCm: { x: 0, y: 0 },
      },
      {
        id: 'right_sleeve',
        label: 'Right Sleeve',
        surfaceId: 'right_sleeve',
        available: false,
        unavailableReason: UNAVAILABLE_SLEEVE,
        anchor: { x: 0.1, y: 0.75 },
        maxWidthCm: 7,
        maxHeightCm: 7,
        defaultTextSizeCm: 1,
        defaultImageWidthCm: 6,
        maxOffsetCm: { x: 0, y: 0 },
      },
    ],
  };
}

/**
 * White crew-neck tee (Sketchfab "tshirt", 2 shells: outer Object_6 + inner Object_4).
 * Optimized 154k → 27k tris, 318 KB. Bbox 63.9 × 69.9 × 28.9 cm, front faces +Z.
 * Front neckline 6.0 cm below top, back neck under the collar ≈ 2 cm, torso ≈ 34 cm wide.
 */
export const CREW_TEE = garment({
  id: 'crew-tee',
  label: 'Classic T-shirt',
  modelFile: 'crew-tee.glb',
  embroideryMeshNames: ['Object_6'],
  size: { x: 0.6387, y: 0.6992, z: 0.2892 },
  frontNeckCm: 6,
  backNeckCm: 2,
  hemCm: 0,
  torsoHalfWidthCm: 17,
});

/**
 * Black raglan sport tee (CLO export, 35 stitch-thread meshes dropped → 21k tris, 471 KB).
 * Panels: front Object_115, back Object_113. Bbox 68.6 × 65.0 × 28.9 cm.
 * Front neckline 4.8 cm below top, torso ≈ 32 cm wide.
 */
export const SPORT_TEE = garment({
  id: 'sport-tee',
  label: 'Sport T-shirt',
  modelFile: 'sport-tee.glb',
  embroideryMeshNames: ['Object_115', 'Object_113'],
  size: { x: 0.6858, y: 0.65, z: 0.2894 },
  frontNeckCm: 4.8,
  backNeckCm: 2,
  hemCm: 0.2,
  torsoHalfWidthCm: 16,
});

/**
 * White short-sleeve polo (CLO export → 29k tris, 551 KB). Front + sleeves + collar in
 * part 0, back panel in part 1; buttons/label excluded. Bbox 60.3 × 71.7 × 32.7 cm.
 * Placket opening ends 11.2 cm below top; the collar sits ≈ 4 cm over the back neck.
 */
export const POLO = garment({
  id: 'polo',
  label: 'Polo shirt',
  modelFile: 'polo.glb',
  embroideryMeshNames: [
    'Short_Sleeve_Polo_Cotton_Heavy_Canvas_FRONT_232020_0',
    'Short_Sleeve_Polo_Cotton_Heavy_Canvas_FRONT_232020_0_1',
  ],
  size: { x: 0.6033, y: 0.7166, z: 0.3267 },
  frontNeckCm: 11.2,
  backNeckCm: 4,
  hemCm: 0.2,
  torsoHalfWidthCm: 17,
  unavailable: { center_chest: 'the button placket runs down the centre of a polo.' },
});

/**
 * White long-sleeve tee (CLO export, 7 stitch-thread meshes dropped → 33k tris, 618 KB).
 * The fabric is split into two vertex-limit chunks (both embroiderable). Bbox 61.9 × 75.6 ×
 * 35.1 cm; sleeves hang 5.2 cm below the front hem. Front neckline 6.0 cm below top.
 */
export const LONG_SLEEVE = garment({
  id: 'long-sleeve',
  label: 'Long-sleeve T-shirt',
  modelFile: 'long-sleeve.glb',
  embroideryMeshNames: [
    'Long_Sleeve_T-Shirt_Bahan_Dasar_FRONT_2657_0',
    'Long_Sleeve_T-Shirt_Bahan_Dasar_FRONT_2657_0_1',
  ],
  size: { x: 0.619, y: 0.7558, z: 0.3509 },
  frontNeckCm: 6,
  backNeckCm: 2,
  hemCm: 5.2,
  torsoHalfWidthCm: 16,
});

/** Garments in the order they're offered. */
export const GARMENTS: readonly ModelAdapter[] = [CREW_TEE, SPORT_TEE, POLO, LONG_SLEEVE];

/** @deprecated The original sample model was replaced; old configurations map to the crew tee. */
export const TSHIRT_V1 = CREW_TEE;

export const MODEL_ADAPTERS: Record<string, ModelAdapter> = {
  ...Object.fromEntries(GARMENTS.map((g) => [g.id, g])),
  // Designs saved before the model swap keep working on the new crew tee.
  'tshirt-v1': CREW_TEE,
};

export const DEFAULT_MODEL_ID = CREW_TEE.id;

export function getModelAdapter(id: string | undefined): ModelAdapter {
  return (id && MODEL_ADAPTERS[id]) || CREW_TEE;
}

export function getPreset(adapter: ModelAdapter, id: PlacementId): PlacementPreset | undefined {
  return adapter.placements.find((p) => p.id === id);
}

export function getSurface(adapter: ModelAdapter, id: SurfaceId): SurfaceConfig | undefined {
  return adapter.surfaces.find((s) => s.id === id);
}

export function availablePlacements(
  adapter: ModelAdapter,
  allowed?: PlacementId[],
): PlacementPreset[] {
  return adapter.placements.filter(
    (p) =>
      p.available &&
      getSurface(adapter, p.surfaceId)?.available &&
      (!allowed || allowed.includes(p.id)),
  );
}

/** True if two positions can't both carry a design (same spot or overlapping areas). */
export function positionsConflict(adapter: ModelAdapter, a: PlacementId, b: PlacementId): boolean {
  if (a === b) return true;
  return (
    !!getPreset(adapter, a)?.conflictsWith?.includes(b) ||
    !!getPreset(adapter, b)?.conflictsWith?.includes(a)
  );
}
