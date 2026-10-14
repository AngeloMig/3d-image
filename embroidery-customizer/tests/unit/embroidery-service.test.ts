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
      if (v && typeof v === 'object' && 'not' in (v as object)) {
        const not = (v as { not: unknown }).not;
        return not === null ? row[k] !== null && row[k] !== undefined : row[k] !== not;
      }
      if (v && typeof v === 'object' && 'in' in (v as object))
        return (v as { in: unknown[] }).in.includes(row[k]);
      return row[k] === v || (v === null && (row[k] === null || row[k] === undefined));
    });
  const model = (name: string) => ({
    create: async ({ data }: { data: Record<string, unknown> }) => {
      // Mirrors the Prisma schema defaults the service relies on.
      const defaults = name === 'artwork' ? { kind: 'artwork' } : {};
      const row = {
        id: `id${++n}`,
        createdAt: new Date(),
        orderedAt: null,
        ...defaults,
        ...data,
      } as Row;
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
      layers: [
        {
          ...text.layers[0]!,
          design: {
            ...text.layers[0]!.design,
            text: '',
          } as EmbroideryConfiguration['layers'][0]['design'],
        },
      ],
    };
    await expect(svc.saveConfiguration(SHOP, serializeConfiguration(bad))).rejects.toBeInstanceOf(
      EmbroideryError,
    );

    const image: EmbroideryConfiguration = createConfiguration(TSHIRT_V1, product, {
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
    });
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

  it('stores mockups separately from artwork and only serves them as mockups', async () => {
    const { svc } = setup();
    const { previewRef } = await svc.storeMockup(
      SHOP,
      new File([PNG], 'mockup.png', { type: 'image/png' }),
    );
    expect(previewRef).toMatch(/^pv_[a-f0-9]{24}$/);
    expect(await svc.readArtwork(SHOP, previewRef, 'mockup')).not.toBeNull();
    // A mockup ref never resolves as customer artwork (and vice versa).
    expect(await svc.readArtwork(SHOP, previewRef)).toBeNull();
    await expect(
      svc.storeMockup(SHOP, new File(['<svg/>'], 'x.png', { type: 'image/png' })),
    ).rejects.toMatchObject({ status: 415 });
  });

  it('queues ordered logo designs for approval and links the mockup to the order', async () => {
    const { svc, tables } = setup();
    const { storageRef } = await svc.storeArtwork(
      SHOP,
      new File([PNG], 'logo.png', { type: 'image/png' }),
    );
    const { previewRef } = await svc.storeMockup(
      SHOP,
      new File([PNG], 'mockup.png', { type: 'image/png' }),
    );
    const logo = createConfiguration(TSHIRT_V1, product, {
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
    const text = createConfiguration(TSHIRT_V1, product);
    const a = await svc.saveConfiguration(SHOP, serializeConfiguration(logo));
    const b = await svc.saveConfiguration(SHOP, serializeConfiguration(text));
    const rows = tables.embroideryConfiguration!;
    expect(rows.find((r) => r.configRef === a.configRef)?.approvalStatus).toBe('pending');
    expect(rows.find((r) => r.configRef === b.configRef)?.approvalStatus).toBeNull();

    const result = await svc.recordOrder(SHOP, {
      id: 2002,
      name: '#2002',
      line_items: [
        {
          properties: [
            { name: '_Embroidery Config Ref', value: a.configRef },
            { name: 'Customization ID', value: logo.configurationId },
            {
              name: '_Embroidery Mockup',
              value: `https://shop.example/apps/embroidery/preview/${previewRef}.jpg`,
            },
          ],
        },
        {
          properties: [
            { name: '_Embroidery Config Ref', value: b.configRef },
            { name: 'Customization ID', value: text.configurationId },
          ],
        },
      ],
    });
    expect(result).toMatchObject({ linked: 2, logoPending: true });
    const ordered = rows.find((r) => r.configRef === a.configRef)!;
    expect(ordered.previewRef).toBe(previewRef);
    expect(tables.artwork!.find((r) => r.storageRef === previewRef)?.orderedAt).toBeInstanceOf(
      Date,
    );

    const queue = await svc.listApprovals(SHOP);
    expect(queue.map((r) => r.configRef)).toEqual([a.configRef]);

    await expect(
      svc.reviewDesign(SHOP, ordered.id, 'changes_requested', ' '),
    ).rejects.toMatchObject({ status: 422 });
    const changes = await svc.reviewDesign(
      SHOP,
      ordered.id,
      'changes_requested',
      'Please send a larger PNG.',
    );
    expect(changes).toMatchObject({ orderId: '2002', orderSettled: false });
    const approved = await svc.reviewDesign(SHOP, ordered.id, 'approved');
    expect(approved).toMatchObject({ orderId: '2002', orderSettled: true });
    expect(await svc.listApprovals(SHOP)).toHaveLength(0);
    await expect(
      svc.reviewDesign('other.myshopify.com', ordered.id, 'approved'),
    ).rejects.toMatchObject({ status: 404 });
  });
});
