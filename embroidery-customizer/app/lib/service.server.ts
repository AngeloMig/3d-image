import db from '../db.server';
import { createEmbroideryService } from './embroidery.server';
import { getStorage } from './storage.server';

let service: ReturnType<typeof createEmbroideryService> | null = null;
export function embroidery() {
  service ??= createEmbroideryService(db, getStorage());
  return service;
}

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
