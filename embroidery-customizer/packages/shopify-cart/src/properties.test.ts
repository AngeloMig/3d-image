import { describe, expect, it } from 'vitest';
import { TSHIRT_V1, createConfiguration, type EmbroideryConfiguration } from '@embroidery/shared';
import {
  PROPERTY_KEYS,
  buildLineItemProperties,
  mergeLineItemProperties,
  readCustomization,
  visibleProperties,
} from './properties';

const base = createConfiguration(TSHIRT_V1, {
  productId: '1',
  variantId: '42',
  options: { Size: 'M' },
  quantity: 1,
  modelId: TSHIRT_V1.id,
  modelUrl: 'm.glb',
});
const textConfig: EmbroideryConfiguration = {
  ...base,
  design: {
    ...base.design,
    type: 'text',
    text: 'JANE\nDOE',
    fontId: 'serif',
    threadColorId: 'black',
  } as EmbroideryConfiguration['design'],
  placement: { ...base.placement, offsetXCm: 1, offsetYCm: -0.5, rotationDeg: 5 },
  rendered: { widthCm: 8.04, heightCm: 2.96, fitted: false },
};

describe('buildLineItemProperties', () => {
  it('writes readable fulfilment metadata for text', () => {
    const p = buildLineItemProperties(textConfig, { configRef: 'cfg_abc' });
    expect(p).toMatchObject({
      'Embroidery Type': 'Text',
      'Embroidery Text': 'JANE / DOE',
      Font: 'Classic Serif',
      'Thread Color': 'Black',
      Placement: 'Left Chest',
      'Embroidery Size': '8.0 × 3.0 cm',
      'Position Adjustment': '1.0 cm right, 0.5 cm down',
      Rotation: '5°',
      'Customization ID': textConfig.configurationId,
      '_Embroidery Config Ref': 'cfg_abc',
    });
  });

  it('references artwork by filename + opaque ref, never image data', () => {
    const p = buildLineItemProperties(
      {
        ...textConfig,
        design: {
          type: 'image',
          storageRef: 'art_1',
          previewUrl: 'blob:x',
          originalFilename: 'logo.png',
          mimeType: 'image/png',
          byteSize: 9,
          widthPx: 100,
          heightPx: 100,
          scale: 1,
        },
      },
      { configRef: 'cfg' },
    );
    expect(p['Artwork File']).toBe('logo.png');
    expect(p['_Embroidery Artwork Ref']).toBe('art_1');
    expect(p['Embroidery Text']).toBeUndefined();
    expect(JSON.stringify(p)).not.toMatch(/blob:|data:|base64/);
  });

  it('hides internal references from customers (underscore keys)', () => {
    const keys = visibleProperties(buildLineItemProperties(textConfig, { configRef: 'x' })).map(
      ([k]) => k,
    );
    expect(keys).not.toContain('_Embroidery Config Ref');
    expect(keys).toContain('Customization ID');
  });
});

describe('mergeLineItemProperties', () => {
  it('preserves unrelated keys and replaces every embroidery key', () => {
    const existing = {
      'Gift Note': 'Happy birthday',
      _other_app: 'keep-me',
      'Artwork File': 'old.png', // stale key from a previous image design
      'Embroidery Type': 'Logo / Image',
      'Customization ID': 'old',
    };
    const next = buildLineItemProperties(textConfig, { configRef: 'new' });
    const merged = mergeLineItemProperties(existing, next);
    expect(merged['Gift Note']).toBe('Happy birthday');
    expect(merged._other_app).toBe('keep-me');
    expect(merged['Artwork File']).toBeUndefined();
    expect(merged['Embroidery Type']).toBe('Text');
    expect(merged[PROPERTY_KEYS.configRef]).toBe('new');
  });

  it('stringifies non-string values and drops nulls', () => {
    expect(mergeLineItemProperties({ a: 1, b: null }, {})).toEqual({ a: '1' });
  });

  it('reads the customization reference back', () => {
    expect(readCustomization(buildLineItemProperties(textConfig, { configRef: 'r' }))).toEqual({
      customizationId: textConfig.configurationId,
      configRef: 'r',
    });
    expect(readCustomization(null)).toEqual({ customizationId: null, configRef: null });
  });
});
