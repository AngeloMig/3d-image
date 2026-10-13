import type { ActionFunctionArgs } from 'react-router';
import { authenticate } from '../shopify.server';
import type { OrderPayload } from '../lib/embroidery.server';
import { embroidery } from '../lib/service.server';

/** Links ordered lines to saved configurations so their artwork is retained for fulfilment. */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, topic } = await authenticate.webhook(request); // HMAC-verified
  const result = await embroidery().recordOrder(shop, payload as OrderPayload);
  if (result.unverified.length)
    console.warn(
      `[embroidery] ${topic} ${shop} order ${(payload as OrderPayload).name}: unverified customization refs`,
      result.unverified,
    );
  return new Response();
};
