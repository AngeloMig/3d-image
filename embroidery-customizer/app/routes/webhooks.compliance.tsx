import type { ActionFunctionArgs } from 'react-router';
import { authenticate } from '../shopify.server';
import { embroidery } from '../lib/service.server';

/**
 * Mandatory privacy webhooks (required for public apps).
 * - customers/data_request: we store no customer profile data (designs are keyed by order/cart refs).
 * - customers/redact: designs contain no personal data beyond embroidered text on that customer's
 *   orders; retained for fulfilment records unless the merchant deletes them.
 * - shop/redact: delete everything for the shop.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  if (topic === 'SHOP_REDACT' || topic === 'shop/redact') await embroidery().deleteShopData(shop);
  return new Response();
};
