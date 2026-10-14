import type { LoaderFunctionArgs } from 'react-router';
import { authenticate } from '../shopify.server';
import { MOCKUP_REF } from '../lib/embroidery.server';
import { embroidery, json } from '../lib/service.server';

/**
 * GET /apps/embroidery/preview/pv_….jpg — the mockup image linked from the order email.
 * Email clients fetch it through the shop's domain; Shopify signs the proxied request.
 * Refs are unguessable and only ever shared with the customer who placed the order.
 */
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  if (!session) return json({ error: 'App is not installed on this shop.' }, 401);
  const ref = (params.ref ?? '').replace(/\.(jpe?g|png)$/, '');
  if (!MOCKUP_REF.test(ref)) return json({ error: 'Not found' }, 404);
  const art = await embroidery().readArtwork(session.shop, ref, 'mockup');
  if (!art) return json({ error: 'Not found' }, 404);
  return new Response(art.bytes, {
    headers: {
      'Content-Type': art.contentType,
      // Immutable: a new design always gets a new ref.
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
};
