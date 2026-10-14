import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Short-lived signed links for admin pages. Images inside the embedded admin can't send the
 * session token, so the admin loader signs each artwork/mockup URL and /media verifies it.
 */
const TTL_SECONDS = 60 * 60;

function secret(): string {
  const s = process.env.SHOPIFY_API_SECRET;
  if (!s) throw new Error('SHOPIFY_API_SECRET is not set.');
  return s;
}

const sign = (payload: string) => createHmac('sha256', secret()).update(payload).digest('hex');

export function signedMediaUrl(shop: string, ref: string, opts: { download?: boolean } = {}) {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const dl = opts.download ? '1' : '0';
  const sig = sign(`${shop}|${ref}|${exp}|${dl}`);
  const q = new URLSearchParams({ shop, exp: String(exp), dl, sig });
  return `/media/${encodeURIComponent(ref)}?${q}`;
}

export function verifyMediaUrl(ref: string, params: URLSearchParams) {
  const shop = params.get('shop') ?? '';
  const exp = Number(params.get('exp'));
  const dl = params.get('dl') === '1' ? '1' : '0';
  const sig = params.get('sig') ?? '';
  if (!shop || !Number.isFinite(exp) || exp < Date.now() / 1000) return null;
  const expected = Buffer.from(sign(`${shop}|${ref}|${exp}|${dl}`), 'hex');
  const given = Buffer.from(sig, 'hex');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return { shop, download: dl === '1' };
}
