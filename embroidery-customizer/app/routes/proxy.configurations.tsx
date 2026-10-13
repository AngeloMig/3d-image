import type { ActionFunctionArgs } from 'react-router';
import { authenticate } from '../shopify.server';
import { EmbroideryError, MAX_CONFIG_JSON_BYTES } from '../lib/embroidery.server';
import { clientKey, rateLimit } from '../lib/rateLimit.server';
import { embroidery, json } from '../lib/service.server';

/** POST /apps/embroidery/configurations — validates and stores the full configuration. */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  if (!session) return json({ error: 'App is not installed on this shop.' }, 401);
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!rateLimit(`config:${clientKey(request, session.shop)}`, 60, 10 * 60_000).ok)
    return json({ error: 'Too many requests. Please wait a moment.' }, 429);
  const body = await request.text();
  if (body.length > MAX_CONFIG_JSON_BYTES)
    return json({ error: 'Configuration is too large.' }, 413);
  try {
    return json(await embroidery().saveConfiguration(session.shop, body), 201);
  } catch (e) {
    if (e instanceof EmbroideryError) return json({ error: e.message }, e.status);
    console.error('[embroidery] save configuration failed', e);
    return json({ error: 'Could not save your design. Please try again.' }, 500);
  }
};

export const loader = () => json({ error: 'Method not allowed' }, 405);
