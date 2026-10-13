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
 * "Shirt 7" low-poly crew/V-neck tee (Blender export, metres, front faces +Z).
 * Inspected: 1 mesh (RetopoMain.004), 2,841 verts / 4,970 tris, packed UV atlas,
 * 1 double-sided PBR material (base colour, normal, metallic-roughness @1024²).
 * Bounding box: x −0.371…0.373, y 1.023…1.775, z −0.167…0.171 (m).
 * Front V-neck bottom at y≈1.677; back neck at y≈1.771; torso half-width ≈0.175 m.
 */
export const TSHIRT_V1: ModelAdapter = {
  id: 'tshirt-v1',
  label: 'Classic T-shirt',
  modelFile: 'tshirt.glb',
  embroideryMeshNames: [],
  cmPerUnit: 100,
  expectedSize: { x: 0.7434, y: 0.7522, z: 0.3384 },
  decalDepthCm: 10,
  // Authored roughness map spans 0.36–0.65 (median 0.58); ×1.45 → ~0.52–0.94, cotton jersey.
  fabricRoughnessScale: 1.45,
  surfaces: [
    {
      id: 'front',
      label: 'Front',
      facing: '+z',
      available: true,
      safeBounds: { xMin: 0.2835, xMax: 0.7139, yMin: 0.0759, yMax: 0.8402 },
    },
    {
      id: 'back',
      label: 'Back',
      facing: '-z',
      available: true,
      safeBounds: { xMin: 0.2835, xMax: 0.7139, yMin: 0.0759, yMax: 0.9241 },
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
      available: true,
      anchor: { x: 0.6131, y: 0.714 },
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
      available: true,
      anchor: { x: 0.4987, y: 0.6343 },
      maxWidthCm: 22,
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
      available: true,
      anchor: { x: 0.3844, y: 0.714 },
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
      available: true,
      anchor: { x: 0.4987, y: 0.847 },
      maxWidthCm: 24,
      maxHeightCm: 7,
      defaultTextSizeCm: 2.2,
      defaultImageWidthCm: 18,
      maxOffsetCm: { x: 3, y: 2 },
    },
    {
      id: 'center_back',
      label: 'Center Back',
      surfaceId: 'back',
      available: true,
      anchor: { x: 0.4987, y: 0.5279 },
      maxWidthCm: 26,
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

export const MODEL_ADAPTERS: Record<string, ModelAdapter> = {
  [TSHIRT_V1.id]: TSHIRT_V1,
};

export const DEFAULT_MODEL_ID = TSHIRT_V1.id;

export function getModelAdapter(id: string | undefined): ModelAdapter {
  return (id && MODEL_ADAPTERS[id]) || TSHIRT_V1;
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
  return !!getPreset(adapter, a)?.conflictsWith?.includes(b) || !!getPreset(adapter, b)?.conflictsWith?.includes(a);
}
