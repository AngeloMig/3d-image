import type { ActionFunctionArgs } from 'react-router';
import { authenticate } from '../shopify.server';
import { EmbroideryError } from '../lib/embroidery.server';
import { clientKey, rateLimit } from '../lib/rateLimit.server';
import { embroidery, json } from '../lib/service.server';

/**
 * POST /apps/embroidery/preview  (App Proxy → /proxy/preview). Multipart field "file":
 * a JPEG/PNG render of the 3D mockup, shown in the order email and to staff.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  if (!session) return json({ error: 'App is not installed on this shop.' }, 401);
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!rateLimit(`mockup:${clientKey(request, session.shop)}`, 40, 10 * 60_000).ok)
    return json({ error: 'Too many requests. Please wait a few minutes.' }, 429);
  if (Number(request.headers.get('content-length') ?? 0) > 2 * 1024 * 1024)
    return json({ error: 'Mockup too large.' }, 413);
  try {
    const file = (await request.formData()).get('file');
    if (!(file instanceof File)) return json({ error: 'Attach the mockup as "file".' }, 400);
    return json(await embroidery().storeMockup(session.shop, file), 201);
  } catch (e) {
    if (e instanceof EmbroideryError) return json({ error: e.message }, e.status);
    console.error('[embroidery] mockup upload failed', e);
    return json({ error: 'Mockup upload failed.' }, 500);
  }
};

export const loader = () => json({ error: 'Method not allowed' }, 405);
