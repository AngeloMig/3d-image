import { LIMITS } from './catalog';
import { defaultPlacement } from './placement';
import { ALLOWED_IMAGE_MIMES } from './validation';
import type { ModelAdapter } from './models';
import {
  SCHEMA_VERSION,
  type DesignLayer,
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

/** Short id for a design layer (unique within one configuration). */
export const createLayerId = (): string => `l${createId().slice(0, 8)}`;

export const DEFAULT_TEXT_DESIGN: TextDesign = {
  type: 'text',
  text: 'YOUR NAME',
  fontId: 'block',
  threadColorId: 'white',
  sizeCm: 1,
  letterSpacing: 0.04,
  alignment: 'center',
};

export function createLayer(
  adapter: ModelAdapter,
  positionId: PlacementId,
  design: EmbroideryDesign = { ...DEFAULT_TEXT_DESIGN },
): DesignLayer {
  return { layerId: createLayerId(), design, placement: defaultPlacement(adapter, positionId), rendered: null };
}

export function createConfiguration(
  adapter: ModelAdapter,
  product: ProductSelection,
  opts: { design?: EmbroideryDesign; positionId?: PlacementId; layers?: DesignLayer[]; now?: Date } = {},
): EmbroideryConfiguration {
  const now = (opts.now ?? new Date()).toISOString();
  return {
    configurationId: createId(),
    schemaVersion: SCHEMA_VERSION,
    product,
    layers: opts.layers ?? [createLayer(adapter, opts.positionId ?? 'left_chest', opts.design)],
    teamOrderId: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Image design without transient browser values (object URLs never leave the browser). */
const portableDesign = (design: EmbroideryDesign): EmbroideryDesign =>
  design.type === 'image' ? { ...design, previewUrl: null } : design;

/**
 * Serialize for persistence. Strips transient browser-only values (object URLs) so the
 * stored JSON is portable and never contains base64 image data.
 */
export function serializeConfiguration(config: EmbroideryConfiguration): string {
  return JSON.stringify({
    ...config,
    layers: config.layers.map((l) => ({ ...l, design: portableDesign(l.design) })),
  });
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

function checkDesign(design: unknown, at: string, p: string[]): void {
  if (!isObj(design)) {
    p.push(`${at} missing`);
    return;
  }
  if (design.type === 'text') {
    for (const k of ['text', 'fontId', 'threadColorId', 'alignment'])
      if (!isStr(design[k])) p.push(`${at}.${k} missing`);
    for (const k of ['sizeCm', 'letterSpacing']) if (!isNum(design[k])) p.push(`${at}.${k} missing`);
  } else if (design.type === 'image') {
    if (!isStr(design.originalFilename)) p.push(`${at}.originalFilename missing`);
    if (!isStr(design.mimeType) || !ALLOWED_IMAGE_MIMES.includes(design.mimeType as ImageDesign['mimeType']))
      p.push(`${at}.mimeType invalid`);
    for (const k of ['byteSize', 'widthPx', 'heightPx', 'scale']) if (!isNum(design[k])) p.push(`${at}.${k} missing`);
    if (design.storageRef !== null && !isStr(design.storageRef)) p.push(`${at}.storageRef invalid`);
    if (design.backgroundRemoved !== undefined && typeof design.backgroundRemoved !== 'boolean')
      p.push(`${at}.backgroundRemoved invalid`);
  } else p.push(`${at}.type must be text or image`);
}

function checkPlacement(placement: unknown, at: string, p: string[]): void {
  if (!isObj(placement)) {
    p.push(`${at} missing`);
    return;
  }
  if (!isStr(placement.surfaceId) || !isStr(placement.positionId)) p.push(`${at} ids missing`);
  for (const k of ['offsetXCm', 'offsetYCm', 'rotationDeg', 'scale'])
    if (!isNum(placement[k])) p.push(`${at}.${k} missing`);
}

/** Structural parse of untrusted JSON (from storage or the network). Upgrades v1 → v2. */
export function parseConfiguration(input: unknown): EmbroideryConfiguration {
  const data: unknown = typeof input === 'string' ? safeJson(input) : input;
  const p: string[] = [];
  if (!isObj(data)) throw new ConfigurationParseError(['not an object']);

  // v1 stored a single design/placement/rendered at the top level.
  if (data.schemaVersion === 1) {
    data.layers = [{ layerId: 'l1', design: data.design, placement: data.placement, rendered: data.rendered ?? null }];
    data.schemaVersion = SCHEMA_VERSION;
    delete data.design;
    delete data.placement;
    delete data.rendered;
  }
  if (data.schemaVersion !== SCHEMA_VERSION) p.push(`unsupported schemaVersion ${String(data.schemaVersion)}`);
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

  const layers = data.layers;
  if (!Array.isArray(layers) || layers.length === 0) p.push('at least one design layer is required');
  else if (layers.length > LIMITS.maxDesigns) p.push(`at most ${LIMITS.maxDesigns} design layers`);
  else
    layers.forEach((layer: unknown, i) => {
      if (!isObj(layer)) return p.push(`layers[${i}] invalid`);
      if (!isStr(layer.layerId)) p.push(`layers[${i}].layerId missing`);
      checkDesign(layer.design, `layers[${i}].design`, p);
      checkPlacement(layer.placement, `layers[${i}].placement`, p);
    });
  if (data.teamOrderId !== undefined && data.teamOrderId !== null && !isStr(data.teamOrderId))
    p.push('teamOrderId invalid');

  if (p.length) throw new ConfigurationParseError(p);
  const config = data as unknown as EmbroideryConfiguration;
  config.layers = config.layers.map((l) => ({ ...l, design: portableDesign(l.design), rendered: l.rendered ?? null }));
  config.teamOrderId ??= null;
  return config;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new ConfigurationParseError(['not valid JSON']);
  }
}
