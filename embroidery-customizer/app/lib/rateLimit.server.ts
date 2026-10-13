/**
 * Fixed-window rate limiter (in memory). Good for a single instance; use Redis/Upstash or the
 * hosting platform's limiter when running several instances.
 */
const windows = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): { ok: boolean; retryAfterS: number } {
  const w = windows.get(key);
  if (!w || w.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    if (windows.size > 50_000)
      for (const [k, v] of windows) if (v.resetAt <= now) windows.delete(k);
    return { ok: true, retryAfterS: 0 };
  }
  w.count += 1;
  return { ok: w.count <= limit, retryAfterS: Math.ceil((w.resetAt - now) / 1000) };
}

export function clientKey(request: Request, shop: string): string {
  const ip =
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';
  return `${shop}|${ip}`;
}
