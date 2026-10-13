import type { ActionFunctionArgs } from 'react-router';
import { authenticate } from '../shopify.server';
import { EmbroideryError } from '../lib/embroidery.server';
import { clientKey, rateLimit } from '../lib/rateLimit.server';
import { embroidery, json } from '../lib/service.server';

/** POST /apps/embroidery/artwork  (Shopify App Proxy → /proxy/artwork). Multipart field "file". */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request); // verifies Shopify's HMAC signature
  if (!session) return json({ error: 'App is not installed on this shop.' }, 401);
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const limit = rateLimit(`upload:${clientKey(request, session.shop)}`, 12, 10 * 60_000);
  if (!limit.ok)
    return json({ error: 'Too many uploads. Please wait a few minutes.' }, 429, {
      'Retry-After': String(limit.retryAfterS),
    });

  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > 21 * 1024 * 1024) return json({ error: 'File too large.' }, 413);
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return json({ error: 'Attach the artwork as "file".' }, 400);
    return json(await embroidery().storeArtwork(session.shop, file), 201);
  } catch (e) {
    if (e instanceof EmbroideryError) return json({ error: e.message }, e.status);
    console.error('[embroidery] artwork upload failed', e);
    return json({ error: 'Upload failed. Please try again.' }, 500);
  }
};

export const loader = () => json({ error: 'Method not allowed' }, 405);
