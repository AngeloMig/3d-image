import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { LoaderFunctionArgs } from 'react-router';
import { authenticate } from '../shopify.server';
import { GARMENTS } from '@embroidery/shared';
import { json } from '../lib/service.server';

/**
 * GET /apps/embroidery/model/<garment>.glb — the calibrated 3D garments for the app block.
 * Theme app extensions can't ship .glb assets, so the app serves it (same origin as the
 * storefront via the app proxy). A product's own 3D model media still takes priority.
 */
const MODELS: Record<string, string> = Object.fromEntries(
  [...GARMENTS.map((g) => g.id), 'tshirt-v1'].map((id) => [
    `${id}.glb`,
    // Designs saved before the model swap still point at tshirt-v1.
    `public/models/${id === 'tshirt-v1' ? 'crew-tee' : id}.glb`,
  ]),
);
const cache = new Map<string, Uint8Array<ArrayBuffer>>();

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  if (!session) return json({ error: 'App is not installed on this shop.' }, 401);
  const path = MODELS[params.file ?? ''];
  if (!path) return json({ error: 'Not found' }, 404);
  let bytes = cache.get(path);
  if (!bytes) {
    const file = await readFile(join(process.cwd(), path));
    bytes = new Uint8Array(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
    cache.set(path, bytes);
  }
  return new Response(bytes, {
    headers: {
      'Content-Type': 'model/gltf-binary',
      'Cache-Control': 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
