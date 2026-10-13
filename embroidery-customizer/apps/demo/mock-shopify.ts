/**
 * DEV/TEST ONLY: an in-memory imitation of the Shopify endpoints the storefront code calls,
 * so the real Shopify adapters (Ajax cart, app proxy persistence, cart edit hook) can be
 * exercised locally and in Playwright without a store. Never deployed.
 *
 * Mirrors Shopify semantics we depend on: line keys change when properties change,
 * identical variant+properties merge, `properties` on change.js replaces the whole object.
 */
import { createHash, randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import {
  checkUpload,
  parseConfiguration,
  validateConfiguration,
  getModelAdapter,
  serializeConfiguration,
} from '../../packages/shared/src/index';

interface Line {
  key: string;
  variant_id: number;
  quantity: number;
  properties: Record<string, string>;
}

const PRODUCT = {
  id: 7001,
  title: 'Classic Embroidered Tee',
  handle: 'classic-embroidered-tee',
  options: ['Size', 'Color'],
  variants: ['S', 'M', 'L', 'XL'].flatMap((size, si) =>
    ['Royal', 'White', 'Black', 'Navy'].map((color, ci) => ({
      id: 4100 + si * 10 + ci,
      title: `${size} / ${color}`,
      options: [size, color],
      option1: size,
      option2: color,
      option3: null,
      available: !(size === 'XL' && color === 'Navy'),
      price: 3400,
    })),
  ),
};

/** Simulated "Embroidery fee" product: one variant per fee code, priced by "Shopify". */
const FEE_VARIANTS = [
  { id: 9001, title: 'Text', price: 500 },
  { id: 9002, title: 'Logo', price: 800 },
  { id: 9003, title: 'Medium size', price: 300 },
  { id: 9004, title: 'Large size', price: 600 },
  { id: 9005, title: '3D Puff', price: 400 },
  { id: 9006, title: 'Metallic thread', price: 300 },
  { id: 9007, title: 'Woven patch', price: 600 },
  { id: 9008, title: 'Chenille', price: 700 },
  { id: 9009, title: 'Premium font', price: 200 },
];

const state = {
  lines: [] as Line[],
  artwork: new Map<string, { bytes: Buffer; type: string; filename: string }>(),
  configs: new Map<string, string>(),
};

const lineKey = (variantId: number, properties: Record<string, string>) =>
  `${variantId}:${createHash('md5')
    .update(JSON.stringify(Object.entries(properties).sort()))
    .digest('hex')}`;

const item = (l: Line) => {
  const fee = FEE_VARIANTS.find((x) => x.id === l.variant_id);
  if (fee)
    return {
      key: l.key, id: l.variant_id, variant_id: l.variant_id, quantity: l.quantity, properties: l.properties,
      product_title: 'Embroidery fee', variant_title: fee.title, title: `Embroidery fee - ${fee.title}`,
      handle: 'embroidery-fee', price: fee.price, image: null,
    };
  const v = PRODUCT.variants.find((x) => x.id === l.variant_id);
  return {
    key: l.key,
    id: l.variant_id,
    variant_id: l.variant_id,
    quantity: l.quantity,
    properties: l.properties,
    product_title: PRODUCT.title,
    variant_title: v?.title ?? '',
    title: `${PRODUCT.title} - ${v?.title ?? ''}`,
    handle: PRODUCT.handle,
    price: v?.price ?? 0,
    image: null,
  };
};
const cart = () => ({
  items: state.lines.map(item),
  item_count: state.lines.reduce((s, l) => s + l.quantity, 0),
  currency: 'USD',
});

function send(res: ServerResponse, status: number, body: unknown, type = 'application/json') {
  res.statusCode = status;
  res.setHeader('Content-Type', type);
  res.end(Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<string, unknown>;
}

function add(variantId: number, quantity: number, properties: Record<string, string>): Line {
  const key = lineKey(variantId, properties);
  const existing = state.lines.find((l) => l.key === key);
  if (existing) {
    existing.quantity += quantity;
    return existing;
  }
  const line = { key, variant_id: variantId, quantity, properties };
  state.lines.push(line);
  return line;
}

export function mockShopify() {
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    try {
      if (path === '/__mock/reset' && req.method === 'POST') {
        state.lines = [];
        state.artwork.clear();
        state.configs.clear();
        return send(res, 200, { ok: true });
      }
      if (path === '/cart.js') return send(res, 200, cart());
      if (path === `/products/${PRODUCT.handle}.js`) return send(res, 200, PRODUCT);
      if (path === '/cart/add.js' && req.method === 'POST') {
        const body = await readJson(req);
        const items =
          (body.items as Array<{
            id: number;
            quantity: number;
            properties?: Record<string, string>;
          }>) ?? [];
        const added = [];
        for (const it of items) {
          const v =
            PRODUCT.variants.find((x) => x.id === Number(it.id)) ??
            FEE_VARIANTS.map((f) => ({ ...f, available: true })).find((x) => x.id === Number(it.id));
          if (!v) return send(res, 404, { status: 404, description: 'Cannot find variant' });
          if (!v.available)
            return send(res, 422, {
              status: 422,
              description: `${PRODUCT.title} - ${v.title} is sold out.`,
            });
          added.push(item(add(v.id, Number(it.quantity) || 1, it.properties ?? {})));
        }
        return send(res, 200, { items: added });
      }
      if (path === '/cart/change.js' && req.method === 'POST') {
        const body = await readJson(req);
        const line = state.lines.find((l) => l.key === body.id);
        if (!line)
          return send(res, 400, { status: 400, description: 'Cannot find variant or line item' });
        if (body.quantity === 0) state.lines = state.lines.filter((l) => l !== line);
        else {
          if (typeof body.quantity === 'number') line.quantity = body.quantity;
          if (body.properties) {
            line.properties = body.properties as Record<string, string>; // replaces ALL properties
            line.key = lineKey(line.variant_id, line.properties);
          }
        }
        return send(res, 200, cart());
      }

      if (path === '/cart/update.js' && req.method === 'POST') {
        const body = await readJson(req);
        const updates = (body.updates ?? {}) as Record<string, number>;
        for (const [key, qty] of Object.entries(updates)) {
          const line = state.lines.find((l) => l.key === key);
          if (line) line.quantity = Math.max(0, Number(qty) || 0);
        }
        state.lines = state.lines.filter((l) => l.quantity > 0);
        return send(res, 200, cart());
      }
      // ---- app proxy (/apps/embroidery/*) ----
      if (path === '/apps/embroidery/artwork' && req.method === 'POST') {
        const request = new Request(`http://localhost${req.url}`, {
          method: 'POST',
          headers: req.headers as HeadersInit,
          body: Readable.toWeb(req) as unknown as BodyInit,
          duplex: 'half',
        } as RequestInit);
        const form = await request.formData();
        const file = form.get('file');
        if (!(file instanceof File)) return send(res, 400, { error: 'Missing file.' });
        const bytes = Buffer.from(await file.arrayBuffer());
        const check = checkUpload(
          { name: file.name, type: file.type, size: bytes.length },
          bytes.subarray(0, 16),
        );
        if (!check.ok) return send(res, 415, { error: check.message });
        const storageRef = `art_${randomUUID()}`;
        state.artwork.set(storageRef, { bytes, type: check.mime!, filename: file.name });
        return send(res, 201, { storageRef });
      }
      const art = path.match(/^\/apps\/embroidery\/artwork\/([\w-]+)$/);
      if (art && req.method === 'GET') {
        const a = state.artwork.get(art[1]!);
        return a ? send(res, 200, a.bytes, a.type) : send(res, 404, { error: 'Not found' });
      }
      if (path === '/apps/embroidery/configurations' && req.method === 'POST') {
        const config = parseConfiguration(await readJson(req));
        const issues = validateConfiguration(getModelAdapter(config.product.modelId), config, {
          requireStoredArtwork: true,
        });
        if (issues.length) return send(res, 422, { error: issues[0]!.message, issues });
        if (config.layers.some((l) => l.design.type === 'image' && !state.artwork.has(l.design.storageRef!)))
          return send(res, 422, { error: 'Unknown artwork reference.' });
        const configRef = `cfg_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
        state.configs.set(configRef, serializeConfiguration(config));
        return send(res, 201, { configRef });
      }
      const cfg = path.match(/^\/apps\/embroidery\/configurations\/([\w-]+)$/);
      if (cfg && req.method === 'GET') {
        const json = state.configs.get(cfg[1]!);
        return json
          ? send(res, 200, { configuration: JSON.parse(json) })
          : send(res, 404, { error: 'Design not found.' });
      }
    } catch (error) {
      return send(res, 400, { error: error instanceof Error ? error.message : 'Bad request' });
    }
    next();
  };
}
