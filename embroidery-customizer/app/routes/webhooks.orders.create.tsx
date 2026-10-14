import type { ActionFunctionArgs } from 'react-router';
import { authenticate } from '../shopify.server';
import type { OrderPayload } from '../lib/embroidery.server';
import { setApprovalTag } from '../lib/orderTags.server';
import { embroidery } from '../lib/service.server';

/**
 * Links ordered lines to saved configurations so their artwork and mockups are retained for
 * fulfilment, and tags orders with uploaded logos "logo-review" until staff approve them.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, topic, admin } = await authenticate.webhook(request); // HMAC-verified
  const order = payload as OrderPayload;
  const result = await embroidery().recordOrder(shop, order);
  if (result.unverified.length)
    console.warn(
      `[embroidery] ${topic} ${shop} order ${order.name}: unverified customization refs`,
      result.unverified,
    );
  if (result.logoPending && admin) {
    try {
      await setApprovalTag(admin, String(order.id), 'pending');
    } catch (e) {
      // Tagging is a convenience; the approval queue in the app works without it.
      console.warn(`[embroidery] could not tag order ${order.name}`, e);
    }
  }
  return new Response();
};
