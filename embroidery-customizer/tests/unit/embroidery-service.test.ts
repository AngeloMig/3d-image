import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  TSHIRT_V1,
  createConfiguration,
  serializeConfiguration,
  type EmbroideryConfiguration,
} from '@embroidery/shared';
import { EmbroideryError, createEmbroideryService } from '../../app/lib/embroidery.server';
import type { ArtworkStorage } from '../../app/lib/storage.server';

type Row = Record<string, unknown> & { id: string };

/** Tiny in-memory stand-in for the Prisma calls the service uses. */
function fakeDb() {
  const tables: Record<string, Row[]> = { artwork: [], embroideryConfiguration: [] };
  let n = 0;
  const matches = (row: Row, where: Record<string, unknown> = {}) =>
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === 'object' && 'lt' in (v as object))
        return (row[k] as Date) < (v as { lt: Date }).lt;
      return row[k] === v || (v === null && (row[k] === null || row[k] === undefined));
    });
  const model = (name: string) => ({
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const row = { id: `id${++n}`, createdAt: new Date(), orderedAt: null, ...data } as Row;
      tables[name]!.push(row);
      return row;
    },
    findFirst: async ({ where }: { where: Record<string, unknown> }) =>
      tables[name]!.find((r) => matches(r, where)) ?? null,
    findMany: async ({ where }: { where: Record<string, unknown> }) =>
      tables[name]!.filter((r) => matches(r, where)),
    count: async ({ where }: { where: Record<string, unknown> }) =>
      tables[name]!.filter((r) => matches(r, where)).length,
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
      Object.assign(
        tables[name]!.find((r) => r.id === where.id)!,
        data,
      ),
    updateMany: async ({
      where,
      data,
    }: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => {
      const rows = tables[name]!.filter((r) => matches(r, where));
      rows.forEach((r) => Object.assign(r, data));
      return { count: rows.length };
    },
    delete: async ({ where }: { where: { id: string } }) => {
      tables[name] = tables[name]!.filter((r) => r.id !== where.id);
    },
    deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
      const before = tables[name]!.length;
      tables[name] = tables[name]!.filter((r) => !matches(r, where));
      return { count: before - tables[name]!.length };
    },
  });
  return {
    db: {
      artwork: model('artwork'),
      embroideryConfiguration: model('embroideryConfiguration'),
    } as unknown as PrismaClient,
    tables,
  };
}

function memoryStorage(): ArtworkStorage & { keys: () => string[] } {
  const m = new Map<string, { bytes: Uint8Array<ArrayBuffer>; contentType: string }>();
  return {
    kind: 'local',
    put: async (k, bytes, contentType) =>
      void m.set(k, { bytes: new Uint8Array(bytes), contentType }),
    get: async (k) => m.get(k) ?? null,
    delete: async (k) => void m.delete(k),
    keys: () => [...m.keys()],
  };
}

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82,
]);
const SHOP = 'demo.myshopify.com';
const product = {
  productId: '1',
  variantId: '2',
  options: {},
  quantity: 1,
  modelId: TSHIRT_V1.id,
  modelUrl: 'm.glb',
};

function setup() {
  const { db, tables } = fakeDb();
  const storage = memoryStorage();
  return { svc: createEmbroideryService(db, storage), tables, storage };
}

describe('embroidery service', () => {
  it('stores artwork under a shop-scoped key and returns an opaque ref', async () => {
    const { svc, storage } = setup();
    const { storageRef } = await svc.storeArtwork(
      SHOP,
      new File([PNG], '../../evil name.png', { type: 'image/png' }),
    );
    expect(storageRef).toMatch(/^art_[a-f0-9]{24}$/);
    expect(storage.keys()[0]).toMatch(
      new RegExp(`^shops/${SHOP}/artwork/\\d{4}/\\d{2}/[0-9a-f-]{36}\\.png$`),
    );
    const read = await svc.readArtwork(SHOP, storageRef);
    expect(read?.contentType).toBe('image/png');
    expect(read?.filename).not.toContain('/');
    expect(await svc.readArtwork('other.myshopify.com', storageRef)).toBeNull();
  });

  it('rejects disguised files by signature, not the claimed MIME type', async () => {
    const { svc } = setup();
    await expect(
      svc.storeArtwork(SHOP, new File(['<script>'], 'x.png', { type: 'image/png' })),
    ).rejects.toMatchObject({ status: 415 });
  });

  it('validates configurations server-side and requires stored artwork for image designs', async () => {
    const { svc } = setup();
    const text = createConfiguration(TSHIRT_V1, product);
    const { configRef } = await svc.saveConfiguration(SHOP, serializeConfiguration(text));
    expect(configRef).toMatch(/^cfg_[a-f0-9]{24}$/);
    expect((await svc.loadConfiguration(SHOP, configRef))?.configurationId).toBe(
      text.configurationId,
    );
    expect(await svc.loadConfiguration('other.myshopify.com', configRef)).toBeNull();

    const bad: EmbroideryConfiguration = {
      ...text,
      design: { ...text.design, text: '' } as EmbroideryConfiguration['design'],
    };
    await expect(svc.saveConfiguration(SHOP, serializeConfiguration(bad))).rejects.toBeInstanceOf(
      EmbroideryError,
    );

    const image: EmbroideryConfiguration = {
      ...text,
      design: {
        type: 'image',
        storageRef: 'art_000000000000000000000000',
        previewUrl: null,
        originalFilename: 'a.png',
        mimeType: 'image/png',
        byteSize: 10,
        widthPx: 100,
        heightPx: 100,
        scale: 0.5,
      },
    };
    await expect(svc.saveConfiguration(SHOP, serializeConfiguration(image))).rejects.toMatchObject({
      message: 'Unknown artwork reference.',
    });
  });

  it('links orders only when ref and Customization ID match, then retention keeps ordered artwork', async () => {
    const { svc, tables, storage } = setup();
    const { storageRef } = await svc.storeArtwork(
      SHOP,
      new File([PNG], 'logo.png', { type: 'image/png' }),
    );
    const cfg = createConfiguration(TSHIRT_V1, product, {
      design: {
        type: 'image',
        storageRef,
        previewUrl: null,
        originalFilename: 'logo.png',
        mimeType: 'image/png',
        byteSize: 16,
        widthPx: 100,
        heightPx: 100,
        scale: 0.5,
      },
    });
    const { configRef } = await svc.saveConfiguration(SHOP, serializeConfiguration(cfg));
    const abandoned = await svc.storeArtwork(
      SHOP,
      new File([PNG], 'old.png', { type: 'image/png' }),
    );

    const result = await svc.recordOrder(SHOP, {
      id: 1001,
      name: '#1001',
      line_items: [
        {
          title: 'Tee',
          properties: [
            { name: '_Embroidery Config Ref', value: configRef },
            { name: 'Customization ID', value: cfg.configurationId },
          ],
        },
        {
          title: 'Forged',
          properties: [
            { name: '_Embroidery Config Ref', value: configRef },
            { name: 'Customization ID', value: 'someone-else' },
          ],
        },
      ],
    });
    expect(result.linked).toBe(1);
    expect(result.unverified).toHaveLength(1);

    // age everything past the retention window
    for (const t of Object.values(tables)) for (const r of t) r.createdAt = new Date('2020-01-01');
    const cleaned = await svc.cleanupAbandoned(30);
    expect(cleaned.artwork).toBe(1);
    expect(await svc.readArtwork(SHOP, storageRef)).not.toBeNull();
    expect(await svc.readArtwork(SHOP, abandoned.storageRef)).toBeNull();
    expect(storage.keys()).toHaveLength(1);
  });
});
