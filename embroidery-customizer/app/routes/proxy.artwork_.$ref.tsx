import type { LoaderFunctionArgs } from 'react-router';
import { authenticate } from '../shopify.server';
import { clientKey, rateLimit } from '../lib/rateLimit.server';
import { embroidery, json } from '../lib/service.server';

/**
 * GET /apps/embroidery/artwork/:ref — streams stored artwork back to the storefront (same origin,
 * so the WebGL preview isn't tainted). Refs are unguessable and scoped to the signed shop.
 */
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  if (!session) return json({ error: 'App is not installed on this shop.' }, 401);
  if (!rateLimit(`art-read:${clientKey(request, session.shop)}`, 120, 10 * 60_000).ok)
    return json({ error: 'Too many requests.' }, 429);
  const ref = params.ref ?? '';
  if (!/^art_[a-f0-9]{24}$/.test(ref)) return json({ error: 'Not found' }, 404);
  const art = await embroidery().readArtwork(session.shop, ref);
  if (!art) return json({ error: 'Not found' }, 404);
  return new Response(art.bytes, {
    headers: {
      'Content-Type': art.contentType,
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
};
