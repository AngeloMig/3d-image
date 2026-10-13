import {
  findFont,
  findThreadColor,
  formatDimensions,
  getModelAdapter,
  getPreset,
  textLines,
  type EmbroideryConfiguration,
} from '@embroidery/shared';

/**
 * Line item property names. Visible keys show in the cart, order and packing slip.
 * Keys starting with "_" are hidden from customers by Shopify themes.
 */
export const PROPERTY_KEYS = {
  type: 'Embroidery Type',
  text: 'Embroidery Text',
  artwork: 'Artwork File',
  font: 'Font',
  thread: 'Thread Color',
  placement: 'Placement',
  size: 'Embroidery Size',
  adjustment: 'Position Adjustment',
  rotation: 'Rotation',
  customizationId: 'Customization ID',
  configRef: '_Embroidery Config Ref',
  artworkRef: '_Embroidery Artwork Ref',
  schema: '_Embroidery Schema',
} as const;

/** Every key this app owns — used to replace our keys while preserving everyone else's. */
export const EMBROIDERY_PROPERTY_KEYS: readonly string[] = Object.values(PROPERTY_KEYS);

export type LineItemProperties = Record<string, string>;

export interface BuildPropertiesOptions {
  /** Opaque, server-validated reference to the stored configuration. */
  configRef: string;
}

function describeAdjustment(config: EmbroideryConfiguration): string | null {
  const { offsetXCm, offsetYCm } = config.placement;
  const parts: string[] = [];
  if (Math.abs(offsetXCm) >= 0.05)
    parts.push(`${Math.abs(offsetXCm).toFixed(1)} cm ${offsetXCm > 0 ? 'right' : 'left'}`);
  if (Math.abs(offsetYCm) >= 0.05)
    parts.push(`${Math.abs(offsetYCm).toFixed(1)} cm ${offsetYCm > 0 ? 'up' : 'down'}`);
  return parts.length ? parts.join(', ') : null;
}

/** Human-readable fulfilment metadata + opaque references. Never includes image data. */
export function buildLineItemProperties(
  config: EmbroideryConfiguration,
  { configRef }: BuildPropertiesOptions,
): LineItemProperties {
  const adapter = getModelAdapter(config.product.modelId);
  const preset = getPreset(adapter, config.placement.positionId);
  const props: LineItemProperties = {};

  if (config.design.type === 'text') {
    const design = config.design;
    props[PROPERTY_KEYS.type] = 'Text';
    props[PROPERTY_KEYS.text] = textLines(design.text).join(' / ');
    props[PROPERTY_KEYS.font] = findFont(design.fontId)?.label ?? design.fontId;
    props[PROPERTY_KEYS.thread] =
      findThreadColor(design.threadColorId)?.label ?? design.threadColorId;
  } else {
    props[PROPERTY_KEYS.type] = 'Logo / Image';
    props[PROPERTY_KEYS.artwork] = config.design.originalFilename;
    props[PROPERTY_KEYS.thread] = 'Match artwork (digitized by our team)';
    if (config.design.storageRef) props[PROPERTY_KEYS.artworkRef] = config.design.storageRef;
  }

  props[PROPERTY_KEYS.placement] = preset?.label ?? config.placement.positionId;
  if (config.rendered)
    props[PROPERTY_KEYS.size] = formatDimensions(config.rendered.widthCm, config.rendered.heightCm);
  const adjustment = describeAdjustment(config);
  if (adjustment) props[PROPERTY_KEYS.adjustment] = adjustment;
  if (config.placement.rotationDeg !== 0)
    props[PROPERTY_KEYS.rotation] = `${config.placement.rotationDeg}°`;
  props[PROPERTY_KEYS.customizationId] = config.configurationId;
  props[PROPERTY_KEYS.configRef] = configRef;
  props[PROPERTY_KEYS.schema] = String(config.schemaVersion);
  return props;
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
    if (EMBROIDERY_PROPERTY_KEYS.includes(key)) continue;
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
