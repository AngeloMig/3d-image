import { LIMITS } from './catalog';
import { defaultPlacement } from './placement';
import { ALLOWED_IMAGE_MIMES } from './validation';
import type { ModelAdapter } from './models';
import {
  SCHEMA_VERSION,
  type EmbroideryConfiguration,
  type EmbroideryDesign,
  type ImageDesign,
  type PlacementId,
  type ProductSelection,
  type TextDesign,
} from './types';

export function createId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const DEFAULT_TEXT_DESIGN: TextDesign = {
  type: 'text',
  text: 'YOUR NAME',
  fontId: 'block',
  threadColorId: 'white',
  sizeCm: 1,
  letterSpacing: 0.04,
  alignment: 'center',
};

export function createConfiguration(
  adapter: ModelAdapter,
  product: ProductSelection,
  opts: { design?: EmbroideryDesign; positionId?: PlacementId; now?: Date } = {},
): EmbroideryConfiguration {
  const now = (opts.now ?? new Date()).toISOString();
  return {
    configurationId: createId(),
    schemaVersion: SCHEMA_VERSION,
    product,
    design: opts.design ?? { ...DEFAULT_TEXT_DESIGN },
    placement: defaultPlacement(adapter, opts.positionId ?? 'left_chest'),
    rendered: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Serialize for persistence. Strips transient browser-only values (object URLs) so the
 * stored JSON is portable and never contains base64 image data.
 */
export function serializeConfiguration(config: EmbroideryConfiguration): string {
  const design: EmbroideryDesign =
    config.design.type === 'image' ? { ...config.design, previewUrl: null } : config.design;
  return JSON.stringify({ ...config, design });
}

export class ConfigurationParseError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid embroidery configuration: ${problems.join('; ')}`);
    this.name = 'ConfigurationParseError';
  }
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Structural parse of untrusted JSON (from storage or the network). */
export function parseConfiguration(input: unknown): EmbroideryConfiguration {
  const data: unknown = typeof input === 'string' ? safeJson(input) : input;
  const p: string[] = [];
  if (!isObj(data)) throw new ConfigurationParseError(['not an object']);
  if (data.schemaVersion !== SCHEMA_VERSION)
    p.push(`unsupported schemaVersion ${String(data.schemaVersion)}`);
  if (!isStr(data.configurationId) || !/^[0-9a-f-]{36}$/i.test(data.configurationId))
    p.push('configurationId must be a UUID');
  if (!isStr(data.createdAt) || !isStr(data.updatedAt)) p.push('timestamps missing');

  const product = data.product;
  if (!isObj(product)) p.push('product missing');
  else {
    if (!isStr(product.productId) || !isStr(product.variantId)) p.push('product ids missing');
    if (!isNum(product.quantity) || product.quantity < 1 || product.quantity > LIMITS.maxQuantity)
      p.push('quantity invalid');
    if (!isObj(product.options)) p.push('product options missing');
    if (!isStr(product.modelId) || !isStr(product.modelUrl)) p.push('model reference missing');
  }

  const design = data.design;
  if (!isObj(design)) p.push('design missing');
  else if (design.type === 'text') {
    for (const k of ['text', 'fontId', 'threadColorId', 'alignment'])
      if (!isStr(design[k])) p.push(`design.${k} missing`);
    for (const k of ['sizeCm', 'letterSpacing'])
      if (!isNum(design[k])) p.push(`design.${k} missing`);
  } else if (design.type === 'image') {
    if (!isStr(design.originalFilename)) p.push('design.originalFilename missing');
    if (
      !isStr(design.mimeType) ||
      !ALLOWED_IMAGE_MIMES.includes(design.mimeType as ImageDesign['mimeType'])
    )
      p.push('design.mimeType invalid');
    for (const k of ['byteSize', 'widthPx', 'heightPx', 'scale'])
      if (!isNum(design[k])) p.push(`design.${k} missing`);
    if (design.storageRef !== null && !isStr(design.storageRef))
      p.push('design.storageRef invalid');
  } else p.push('design.type must be text or image');

  const placement = data.placement;
  if (!isObj(placement)) p.push('placement missing');
  else {
    if (!isStr(placement.surfaceId) || !isStr(placement.positionId))
      p.push('placement ids missing');
    for (const k of ['offsetXCm', 'offsetYCm', 'rotationDeg', 'scale'])
      if (!isNum(placement[k])) p.push(`placement.${k} missing`);
  }

  if (p.length) throw new ConfigurationParseError(p);
  const config = data as unknown as EmbroideryConfiguration;
  if (config.design.type === 'image') config.design = { ...config.design, previewUrl: null };
  if (!('rendered' in config)) (config as EmbroideryConfiguration).rendered = null;
  return config;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new ConfigurationParseError(['not valid JSON']);
  }
}
