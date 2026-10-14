import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  LIMITS,
  checkUpload,
  getModelAdapter,
  parseConfiguration,
  serializeConfiguration,
  validateConfiguration,
  type EmbroideryConfiguration,
} from '@embroidery/shared';
import type { PrismaClient } from '@prisma/client';
import type { ArtworkStorage } from './storage.server';

export class EmbroideryError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};
const token = (bytes = 12) => randomBytes(bytes).toString('hex');
export const MAX_CONFIG_JSON_BYTES = 20_000;
/** Mockups are small JPEG/PNG renders of the 3D preview. */
export const MAX_MOCKUP_BYTES = 1_500_000;
export const MOCKUP_REF = /^pv_[a-f0-9]{24}$/;
/** Line property holding the mockup URL (…/apps/embroidery/preview/pv_….jpg). */
export const MOCKUP_PROPERTY = '_Embroidery Mockup';

export type ApprovalStatus = 'pending' | 'approved' | 'changes_requested';
export const APPROVAL_TAGS: Record<ApprovalStatus, string> = {
  pending: 'logo-review',
  approved: 'logo-approved',
  changes_requested: 'logo-changes-requested',
};

/** Extracts "pv_…" from a mockup URL or bare ref. */
export function mockupRefFrom(value: string | undefined | null): string | null {
  const m = (value ?? '').match(/(pv_[a-f0-9]{24})/);
  return m ? m[1]! : null;
}

export function maxUploadBytes(): number {
  const mb = Number(process.env.MAX_UPLOAD_MB);
  return Number.isFinite(mb) && mb > 0 ? Math.min(mb, 20) * 1024 * 1024 : LIMITS.maxUploadBytes;
}

export function createEmbroideryService(db: PrismaClient, storage: ArtworkStorage) {
  return {
    /** Validates type by magic bytes (not the client's claim), stores privately, returns an opaque ref. */
    async storeArtwork(shop: string, file: File) {
      const limit = maxUploadBytes();
      if (file.size > limit)
        throw new EmbroideryError(
          `File too large (max ${Math.round(limit / 1024 / 1024)} MB).`,
          413,
        );
      const bytes = new Uint8Array(await file.arrayBuffer());
      const check = checkUpload(
        { name: file.name, type: file.type, size: bytes.byteLength },
        bytes.subarray(0, 16),
        limit,
      );
      if (!check.ok || !check.mime)
        throw new EmbroideryError(check.message ?? 'Unsupported file.', 415);
      const now = new Date();
      const storageKey = `shops/${shop}/artwork/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.${EXT[check.mime]}`;
      const storageRef = `art_${token()}`;
      await storage.put(storageKey, bytes, check.mime);
      await db.artwork.create({
        data: {
          shop,
          storageRef,
          storageKey,
          filename:
            file.name.replace(/[^\w.\- ()]+/g, '_').slice(0, 120) || `artwork.${EXT[check.mime]}`,
          mimeType: check.mime,
          byteSize: bytes.byteLength,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        },
      });
      return { storageRef };
    },

    /** Stores the 3D mockup shown in order emails; returns an unguessable "pv_…" ref. */
    async storeMockup(shop: string, file: File) {
      if (file.size > MAX_MOCKUP_BYTES) throw new EmbroideryError('Mockup too large.', 413);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const check = checkUpload(
        { name: file.name || 'mockup.jpg', type: file.type, size: bytes.byteLength },
        bytes.subarray(0, 16),
        MAX_MOCKUP_BYTES,
      );
      if (!check.ok || (check.mime !== 'image/jpeg' && check.mime !== 'image/png'))
        throw new EmbroideryError('Mockups must be JPEG or PNG.', 415);
      const now = new Date();
      const ext = EXT[check.mime];
      const storageKey = `shops/${shop}/mockups/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.${ext}`;
      const storageRef = `pv_${token()}`;
      await storage.put(storageKey, bytes, check.mime);
      await db.artwork.create({
        data: {
          shop,
          kind: 'mockup',
          storageRef,
          storageKey,
          filename: `mockup.${ext}`,
          mimeType: check.mime,
          byteSize: bytes.byteLength,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        },
      });
      return { previewRef: storageRef };
    },

    async readArtwork(shop: string, storageRef: string, kind: 'artwork' | 'mockup' = 'artwork') {
      const row = await db.artwork.findFirst({ where: { shop, storageRef, kind } });
      if (!row) return null;
      const object = await storage.get(row.storageKey);
      return object ? { ...object, filename: row.filename } : null;
    },

    /** Full server-side validation; image designs must reference artwork stored for this shop. */
    async saveConfiguration(shop: string, rawJson: string) {
      if (rawJson.length > MAX_CONFIG_JSON_BYTES)
        throw new EmbroideryError('Configuration is too large.', 413);
      let config: EmbroideryConfiguration;
      try {
        config = parseConfiguration(rawJson);
      } catch (e) {
        throw new EmbroideryError(e instanceof Error ? e.message : 'Invalid configuration.', 400);
      }
      const issues = validateConfiguration(getModelAdapter(config.product.modelId), config, {
        requireStoredArtwork: true,
      });
      if (issues.length) throw new EmbroideryError(issues[0]!.message, 422);
      // Every logo in the design must be artwork this shop actually stored.
      const artworkRefs = config.layers.flatMap((l) =>
        l.design.type === 'image' && l.design.storageRef ? [l.design.storageRef] : [],
      );
      for (const ref of artworkRefs) {
        const art = await db.artwork.findFirst({ where: { shop, storageRef: ref } });
        if (!art) throw new EmbroideryError('Unknown artwork reference.', 422);
      }
      const artworkRef = artworkRefs.length ? artworkRefs.join(',') : null;
      const configRef = `cfg_${token()}`;
      await db.embroideryConfiguration.create({
        data: {
          shop,
          configRef,
          customizationId: config.configurationId,
          schemaVersion: config.schemaVersion,
          json: serializeConfiguration(config),
          artworkRef,
          productId: config.product.productId,
          variantId: config.product.variantId,
          // Every uploaded logo is checked by staff before stitching.
          approvalStatus: artworkRef ? 'pending' : null,
        },
      });
      return { configRef };
    },

    async loadConfiguration(shop: string, configRef: string) {
      const row = await db.embroideryConfiguration.findFirst({ where: { shop, configRef } });
      return row ? parseConfiguration(row.json) : null;
    },

    /**
     * orders/create webhook: link each customized line to its saved configuration.
     * A ref is accepted only if it belongs to this shop AND matches the line's Customization ID,
     * so customers can't attach someone else's design by editing cart properties.
     */
    async recordOrder(shop: string, order: OrderPayload) {
      const result = { linked: 0, unverified: [] as string[], logoPending: false };
      for (const line of order.line_items ?? []) {
        const props = Object.fromEntries(
          (line.properties ?? []).map((p) => [p.name, String(p.value ?? '')]),
        );
        const configRef = props['_Embroidery Config Ref'];
        const customizationId = props['Customization ID'];
        if (!configRef) continue;
        const row = await db.embroideryConfiguration.findFirst({
          where: { shop, configRef, customizationId },
        });
        if (!row) {
          result.unverified.push(`${line.title ?? 'line'} (${customizationId ?? 'no id'})`);
          continue;
        }
        const orderedAt = new Date();
        const mockupRef = mockupRefFrom(props[MOCKUP_PROPERTY]);
        const mockup = mockupRef
          ? await db.artwork.findFirst({ where: { shop, storageRef: mockupRef, kind: 'mockup' } })
          : null;
        if (mockup) await db.artwork.update({ where: { id: mockup.id }, data: { orderedAt } });
        await db.embroideryConfiguration.update({
          where: { id: row.id },
          data: {
            orderId: String(order.id),
            orderName: order.name ?? null,
            orderedAt,
            ...(mockup ? { previewRef: mockup.storageRef } : {}),
          },
        });
        if (row.approvalStatus === 'pending') result.logoPending = true;
        for (const ref of row.artworkRef?.split(',') ?? [])
          await db.artwork.updateMany({
            where: { shop, storageRef: ref },
            data: { orderedAt },
          });
        result.linked += 1;
      }
      return result;
    },

    /**
     * Retention: delete configurations/artwork that never made it into an order after `days`.
     * Anything referenced by an order is kept (orderedAt set).
     */
    async cleanupAbandoned(days: number, now = new Date()) {
      const cutoff = new Date(now.getTime() - days * 86_400_000);
      const configs = await db.embroideryConfiguration.deleteMany({
        where: { orderedAt: null, createdAt: { lt: cutoff } },
      });
      const stale = await db.artwork.findMany({
        where: { orderedAt: null, createdAt: { lt: cutoff } },
      });
      let artwork = 0;
      for (const a of stale) {
        const stillUsed = await db.embroideryConfiguration.count({
          where: { shop: a.shop, artworkRef: { contains: a.storageRef } },
        });
        if (stillUsed) continue;
        await storage.delete(a.storageKey);
        await db.artwork.delete({ where: { id: a.id } });
        artwork += 1;
      }
      return { configurations: configs.count, artwork };
    },

    /** Ordered logo designs for staff review, pending first. */
    async listApprovals(shop: string, status: ApprovalStatus | 'all' = 'pending') {
      return db.embroideryConfiguration.findMany({
        where: {
          shop,
          orderId: { not: null },
          approvalStatus: status === 'all' ? { not: null } : status,
        },
        orderBy: [{ orderedAt: 'desc' }],
        take: 50,
      });
    },

    /** Records a staff decision; returns the order id so the caller can tag the order. */
    async reviewDesign(
      shop: string,
      id: string,
      status: Exclude<ApprovalStatus, 'pending'>,
      note?: string,
    ) {
      const row = await db.embroideryConfiguration.findFirst({
        where: { shop, id, approvalStatus: { not: null } },
      });
      if (!row) throw new EmbroideryError('Design not found.', 404);
      const cleanNote = note?.trim().slice(0, 500) || null;
      if (status === 'changes_requested' && !cleanNote)
        throw new EmbroideryError('Add a note telling the customer what to change.', 422);
      await db.embroideryConfiguration.update({
        where: { id: row.id },
        data: { approvalStatus: status, approvalNote: cleanNote, reviewedAt: new Date() },
      });
      // The order keeps its review tag until every logo design in it has been approved.
      const stillPending = row.orderId
        ? await db.embroideryConfiguration.count({
            where: {
              shop,
              orderId: row.orderId,
              approvalStatus: { in: ['pending', 'changes_requested'] },
            },
          })
        : 0;
      return { orderId: row.orderId, orderName: row.orderName, orderSettled: stillPending === 0 };
    },

    async deleteShopData(shop: string) {
      const arts = await db.artwork.findMany({ where: { shop } });
      for (const a of arts) await storage.delete(a.storageKey);
      await db.artwork.deleteMany({ where: { shop } });
      await db.embroideryConfiguration.deleteMany({ where: { shop } });
    },
  };
}

export interface OrderPayload {
  id: number | string;
  name?: string;
  line_items?: { title?: string; properties?: { name: string; value: unknown }[] | null }[];
}

export type EmbroideryService = ReturnType<typeof createEmbroideryService>;
