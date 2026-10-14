import type { LoaderFunctionArgs } from 'react-router';
import { MOCKUP_REF } from '../lib/embroidery.server';
import { embroidery } from '../lib/service.server';
import { verifyMediaUrl } from '../lib/signedMedia.server';

/** GET /media/:ref?shop&exp&dl&sig — artwork or mockup for admin pages (signed, expiring). */
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const ref = params.ref ?? '';
  const ok = verifyMediaUrl(ref, new URL(request.url).searchParams);
  if (!ok) throw new Response('Link expired', { status: 403 });
  const kind = MOCKUP_REF.test(ref) ? 'mockup' : 'artwork';
  const art = await embroidery().readArtwork(ok.shop, ref, kind);
  if (!art) throw new Response('Not found', { status: 404 });
  const filename = art.filename.replace(/["\r\n]/g, '');
  return new Response(art.bytes, {
    headers: {
      'Content-Type': art.contentType,
      'Content-Disposition': `${ok.download ? 'attachment' : 'inline'}; filename="${filename}"`,
      'Cache-Control': 'private, max-age=600',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
};
