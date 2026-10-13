import { describe, expect, it } from 'vitest';
import {
  ConfigurationParseError,
  createConfiguration,
  createId,
  parseConfiguration,
  serializeConfiguration,
} from './configuration';
import { TSHIRT_V1 } from './models';
import type { EmbroideryConfiguration, ProductSelection } from './types';

const product: ProductSelection = {
  productId: 'gid://shopify/Product/1',
  variantId: '42',
  options: { Size: 'M', Color: 'Navy' },
  quantity: 2,
  modelId: TSHIRT_V1.id,
  modelUrl: 'https://cdn.example.com/tshirt.glb',
};

describe('configuration serialization', () => {
  it('creates RFC 4122 v4 ids', () => {
    expect(createId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('round-trips a text configuration', () => {
    const c = createConfiguration(TSHIRT_V1, product, { now: new Date('2026-01-01T00:00:00Z') });
    const parsed = parseConfiguration(serializeConfiguration(c));
    expect(parsed).toEqual(c);
    expect(parsed.schemaVersion).toBe(1);
  });

  it('never serializes transient image preview URLs (no blob:/data: payloads)', () => {
    const c: EmbroideryConfiguration = {
      ...createConfiguration(TSHIRT_V1, product),
      design: {
        type: 'image',
        storageRef: 'art_123',
        previewUrl: 'blob:http://x/abc',
        originalFilename: 'logo.png',
        mimeType: 'image/png',
        byteSize: 1000,
        widthPx: 500,
        heightPx: 400,
        scale: 0.6,
      },
    };
    const json = serializeConfiguration(c);
    expect(json).not.toContain('blob:');
    expect(JSON.parse(json).design.previewUrl).toBeNull();
    expect(parseConfiguration(json).design).toMatchObject({
      storageRef: 'art_123',
      previewUrl: null,
    });
  });

  it('rejects malformed or tampered input with a list of problems', () => {
    expect(() => parseConfiguration('{not json')).toThrow(ConfigurationParseError);
    const c = JSON.parse(serializeConfiguration(createConfiguration(TSHIRT_V1, product)));
    c.schemaVersion = 99;
    c.design.type = 'video';
    try {
      parseConfiguration(c);
      expect.unreachable();
    } catch (e) {
      expect((e as ConfigurationParseError).problems).toEqual(
        expect.arrayContaining([
          'unsupported schemaVersion 99',
          'design.type must be text or image',
        ]),
      );
    }
  });
});
