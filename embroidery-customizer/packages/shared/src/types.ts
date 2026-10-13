/**
 * Core typed data model for the embroidery configurator.
 * Shared by the storefront widget, cart adapters and the app backend.
 */

export const SCHEMA_VERSION = 1 as const;

export type DesignType = 'text' | 'image';
export type TextAlignment = 'left' | 'center' | 'right';
export type AllowedImageMime = 'image/png' | 'image/jpeg' | 'image/webp';

export interface TextDesign {
  type: 'text';
  text: string;
  fontId: string;
  threadColorId: string;
  /** Letter (cap) height in centimetres before placement scaling / fitting. */
  sizeCm: number;
  /** Extra tracking in em units (0 = font default). */
  letterSpacing: number;
  alignment: TextAlignment;
}

export interface ImageDesign {
  type: 'image';
  /** Opaque reference returned by the persistence layer once the artwork is stored server-side. */
  storageRef: string | null;
  /** Transient preview URL (object URL / signed URL). Never serialized into cart properties. */
  previewUrl: string | null;
  originalFilename: string;
  mimeType: AllowedImageMime;
  byteSize: number;
  widthPx: number;
  heightPx: number;
  /** Normalized artwork width: 0.2–1 of the placement's maximum width. */
  scale: number;
}

export type EmbroideryDesign = TextDesign | ImageDesign;

export type SurfaceId = 'front' | 'back' | 'left_sleeve' | 'right_sleeve';

export type PlacementId =
  | 'left_chest'
  | 'center_chest'
  | 'right_chest'
  | 'upper_back'
  | 'center_back'
  | 'left_sleeve'
  | 'right_sleeve';

export interface UV {
  u: number;
  v: number;
}

/** A point in normalized garment bounding-box space (x: 0 = garment's -X edge, y: 0 = hem). */
export interface NormalizedPoint {
  x: number;
  y: number;
}

export interface NormalizedRect {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface Placement {
  surfaceId: SurfaceId;
  positionId: PlacementId;
  /**
   * Normalized UV centre on the garment mesh where the design centre lands.
   * Captured from the 3D surface hit; informational for fulfilment / QA.
   */
  uvCenter: UV | null;
  /** Horizontal offset in cm, positive = right as seen when facing that surface. */
  offsetXCm: number;
  /** Vertical offset in cm, positive = up. */
  offsetYCm: number;
  rotationDeg: number;
  /** Fine-tune multiplier applied on top of the design size (then fitted to the placement area). */
  scale: number;
}

export interface ProductSelection {
  productId: string;
  variantId: string;
  /** Chosen option values keyed by option name, e.g. { Size: 'M', Color: 'Navy' }. */
  options: Record<string, string>;
  quantity: number;
  modelId: string;
  modelUrl: string;
  productTitle?: string;
  variantTitle?: string;
}

/** Final rendered dimensions, measured in the browser (text width depends on the font). */
export interface RenderedDimensions {
  widthCm: number;
  heightCm: number;
  /** True when the design was scaled down to fit the placement area. */
  fitted: boolean;
}

export interface EmbroideryConfiguration {
  configurationId: string;
  schemaVersion: typeof SCHEMA_VERSION;
  product: ProductSelection;
  design: EmbroideryDesign;
  placement: Placement;
  rendered: RenderedDimensions | null;
  createdAt: string;
  updatedAt: string;
}

/* ---------- product context (Shopify product JSON or demo product) ---------- */

export interface ProductOption {
  name: string;
  values: string[];
}

export interface ProductVariant {
  id: string;
  title: string;
  /** Option values in the same order as ProductContext.options. */
  options: string[];
  available: boolean;
  /** Price in minor units (cents). */
  price: number;
}

export interface ProductContext {
  id: string;
  title: string;
  options: ProductOption[];
  variants: ProductVariant[];
  currency: string;
  locale: string;
  isDemo: boolean;
}

/* ---------- validation ---------- */

export interface ValidationIssue {
  field: string;
  message: string;
}
