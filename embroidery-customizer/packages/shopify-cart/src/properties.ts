import {
  findFont,
  findStitchStyle,
  findThreadColor,
  formatDimensions,
  getModelAdapter,
  getPreset,
  textLines,
  type DesignLayer,
  type EmbroideryConfiguration,
  isFeeCode,
  type FeeKind,
} from '@embroidery/shared';

/**
 * Line item property names. Visible keys show in the cart, order and packing slip.
 * Keys starting with "_" are hidden from customers by Shopify themes.
 * Design 1 uses these keys as-is; designs 2+ are prefixed "Design 2 – …".
 */
export const PROPERTY_KEYS = {
  type: 'Embroidery Type',
  text: 'Embroidery Text',
  artwork: 'Artwork File',
  background: 'Background Removed',
  style: 'Embroidery Style',
  font: 'Font',
  thread: 'Thread Color',
  placement: 'Placement',
  size: 'Embroidery Size',
  adjustment: 'Position Adjustment',
  rotation: 'Rotation',
  designs: 'Embroidery Designs',
  teamOrder: 'Team Order',
  customizationId: 'Customization ID',
  configRef: '_Embroidery Config Ref',
  artworkRef: '_Embroidery Artwork Ref',
  schema: '_Embroidery Schema',
  /** Fees this item owes (restores deleted fee lines). */
  feePlan: '_Embroidery Fees',
} as const;

/** Properties on fee lines ("Embroidery fee" product) that tie them to a customized item. */
export const FEE_KEYS = {
  forItem: 'For',
  customizationId: '_Embroidery Fee For',
  kind: '_Embroidery Fee Kind',
  perItem: '_Embroidery Fee Per Item',
} as const;

const LAYER_PREFIX = /^_?Design \d+ – /;
const BASE_KEYS: readonly string[] = Object.values(PROPERTY_KEYS);
const FEE_KEY_LIST: readonly string[] = Object.values(FEE_KEYS);

/** Every key this app owns — replaced on edit while everyone else's keys are preserved. */
export function isOwnedKey(key: string): boolean {
  return BASE_KEYS.includes(key) || LAYER_PREFIX.test(key);
}

/** Kept for backwards compatibility with callers that expect a list. */
export const EMBROIDERY_PROPERTY_KEYS: readonly string[] = BASE_KEYS;

export type LineItemProperties = Record<string, string>;

export interface BuildPropertiesOptions {
  /** Opaque, server-validated reference to the stored configuration. */
  configRef: string;
  /** Team orders: "row of total" label, e.g. "3 of 12". */
  teamPosition?: string;
}

function describeAdjustment(layer: DesignLayer): string | null {
  const { offsetXCm, offsetYCm } = layer.placement;
  const parts: string[] = [];
  if (Math.abs(offsetXCm) >= 0.05)
    parts.push(`${Math.abs(offsetXCm).toFixed(1)} cm ${offsetXCm > 0 ? 'right' : 'left'}`);
  if (Math.abs(offsetYCm) >= 0.05)
    parts.push(`${Math.abs(offsetYCm).toFixed(1)} cm ${offsetYCm > 0 ? 'up' : 'down'}`);
  return parts.length ? parts.join(', ') : null;
}

function layerProperties(config: EmbroideryConfiguration, layer: DesignLayer, index: number): LineItemProperties {
  const adapter = getModelAdapter(config.product.modelId);
  const preset = getPreset(adapter, layer.placement.positionId);
  // Design 1 keeps the classic keys; others read "Design 2 – Type", "_Design 2 – Artwork Ref"…
  const key = (k: string) => {
    if (index === 0) return k;
    const hidden = k.startsWith('_');
    const name = k.replace(/^_/, '').replace(/^Embroidery /, '');
    return `${hidden ? '_' : ''}Design ${index + 1} – ${name}`;
  };
  const props: LineItemProperties = {};
  const design = layer.design;
  if (design.type === 'text') {
    props[key(PROPERTY_KEYS.type)] = 'Text';
    props[key(PROPERTY_KEYS.text)] = textLines(design.text).join(' / ');
    props[key(PROPERTY_KEYS.font)] = findFont(design.fontId)?.label ?? design.fontId;
    props[key(PROPERTY_KEYS.thread)] = findThreadColor(design.threadColorId)?.label ?? design.threadColorId;
  } else {
    props[key(PROPERTY_KEYS.type)] = 'Logo / Image';
    props[key(PROPERTY_KEYS.artwork)] = design.originalFilename;
    if (design.backgroundRemoved) props[key(PROPERTY_KEYS.background)] = 'Yes';
    props[key(PROPERTY_KEYS.thread)] = 'Match artwork (digitized by our team)';
    if (design.storageRef) props[key(PROPERTY_KEYS.artworkRef)] = design.storageRef;
  }
  props[key(PROPERTY_KEYS.style)] = findStitchStyle(design.stitchStyle).label;
  props[key(PROPERTY_KEYS.placement)] = preset?.label ?? layer.placement.positionId;
  if (layer.rendered) props[key(PROPERTY_KEYS.size)] = formatDimensions(layer.rendered.widthCm, layer.rendered.heightCm);
  const adjustment = describeAdjustment(layer);
  if (adjustment) props[key(PROPERTY_KEYS.adjustment)] = adjustment;
  if (layer.placement.rotationDeg !== 0) props[key(PROPERTY_KEYS.rotation)] = `${layer.placement.rotationDeg}°`;
  return props;
}

/** Human-readable fulfilment metadata + opaque references. Never includes image data. */
export function buildLineItemProperties(
  config: EmbroideryConfiguration,
  { configRef, teamPosition }: BuildPropertiesOptions,
): LineItemProperties {
  let props: LineItemProperties = {};
  if (config.layers.length > 1) props[PROPERTY_KEYS.designs] = String(config.layers.length);
  config.layers.forEach((layer, i) => (props = { ...props, ...layerProperties(config, layer, i) }));
  if (config.teamOrderId)
    props[PROPERTY_KEYS.teamOrder] = `${config.teamOrderId.slice(0, 8).toUpperCase()}${teamPosition ? ` (${teamPosition})` : ''}`;
  props[PROPERTY_KEYS.customizationId] = config.configurationId;
  props[PROPERTY_KEYS.configRef] = configRef;
  props[PROPERTY_KEYS.schema] = String(config.schemaVersion);
  return props;
}

export function buildFeeProperties(
  customizationId: string,
  kind: FeeKind,
  perItem: number,
  itemLabel: string,
): LineItemProperties {
  return {
    [FEE_KEYS.forItem]: `${itemLabel} · ${customizationId.slice(0, 8)}`,
    [FEE_KEYS.customizationId]: customizationId,
    [FEE_KEYS.kind]: kind,
    [FEE_KEYS.perItem]: String(perItem),
  };
}

export function readFee(properties: Record<string, unknown> | null | undefined): {
  customizationId: string;
  kind: FeeKind;
  perItem: number;
} | null {
  const id = properties?.[FEE_KEYS.customizationId];
  const kind = properties?.[FEE_KEYS.kind];
  const perItem = Number(properties?.[FEE_KEYS.perItem]);
  if (typeof id !== 'string' || !isFeeCode(kind) || !(perItem > 0)) return null;
  return { customizationId: id, kind, perItem };
}

/**
 * Shopify's cart/change.js REPLACES the whole properties object. Keep every unrelated key
 * (gift notes, other apps' data) and swap only the keys this app owns.
 */
export function mergeLineItemProperties(
  existing: Record<string, unknown> | null | undefined,
  next: LineItemProperties,
): LineItemProperties {
  const merged: LineItemProperties = {};
  for (const [key, value] of Object.entries(existing ?? {})) {
    if (isOwnedKey(key) || FEE_KEY_LIST.includes(key)) continue;
    if (value === null || value === undefined) continue;
    merged[key] = typeof value === 'string' ? value : String(value);
  }
  return { ...merged, ...next };
}

export function readCustomization(properties: Record<string, unknown> | null | undefined): {
  customizationId: string | null;
  configRef: string | null;
} {
  const get = (k: string) => {
    const v = properties?.[k];
    return typeof v === 'string' && v.length > 0 ? v : null;
  };
  return {
    customizationId: get(PROPERTY_KEYS.customizationId),
    configRef: get(PROPERTY_KEYS.configRef),
  };
}

/** Visible (non-underscore) properties, in insertion order — what themes show customers. */
export function visibleProperties(properties: Record<string, string>): [string, string][] {
  return Object.entries(properties).filter(([k, v]) => !k.startsWith('_') && v !== '');
}
