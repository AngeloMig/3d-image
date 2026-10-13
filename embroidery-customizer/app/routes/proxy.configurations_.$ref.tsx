import type { LoaderFunctionArgs } from 'react-router';
import { authenticate } from '../shopify.server';
import { embroidery, json } from '../lib/service.server';

/** GET /apps/embroidery/configurations/:ref — used by "Edit embroidery" in the cart. */
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  if (!session) return json({ error: 'App is not installed on this shop.' }, 401);
  const ref = params.ref ?? '';
  if (!/^cfg_[a-f0-9]{24}$/.test(ref)) return json({ error: 'Design not found.' }, 404);
  const configuration = await embroidery().loadConfiguration(session.shop, ref);
  return configuration ? json({ configuration }) : json({ error: 'Design not found.' }, 404);
};
