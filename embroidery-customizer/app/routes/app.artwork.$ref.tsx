import type { LoaderFunctionArgs } from 'react-router';
import { authenticate } from '../shopify.server';
import { embroidery } from '../lib/service.server';

/** Admin-only artwork download for fulfilment staff. */
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const art = await embroidery().readArtwork(session.shop, params.ref ?? '');
  if (!art) throw new Response('Not found', { status: 404 });
  return new Response(art.bytes, {
    headers: {
      'Content-Type': art.contentType,
      'Content-Disposition': `attachment; filename="${art.filename.replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
    },
  });
};
