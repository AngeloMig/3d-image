/**
 * Retention job: deletes designs + artwork that were never ordered after RETENTION_DAYS (default 30).
 * Anything linked to an order by the orders/create webhook is kept.
 * Schedule daily, e.g. `npm run cleanup:artwork` from cron / a platform scheduler.
 */
import { PrismaClient } from '@prisma/client';
import { createEmbroideryService } from '../app/lib/embroidery.server';
import { getStorage } from '../app/lib/storage.server';

const days = Number(process.env.RETENTION_DAYS ?? 30);
const db = new PrismaClient();
try {
  const result = await createEmbroideryService(db, getStorage()).cleanupAbandoned(days);
  console.log(
    `[embroidery] retention (${days} days): removed ${result.configurations} configurations, ${result.artwork} artwork files`,
  );
} finally {
  await db.$disconnect();
}
