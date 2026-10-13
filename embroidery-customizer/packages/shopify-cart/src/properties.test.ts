import { describe, expect, it } from 'vitest';
import {
  TSHIRT_V1,
  createConfiguration,
  createLayer,
  type DesignLayer,
  type EmbroideryConfiguration,
  type ImageDesign,
} from '@embroidery/shared';
import {
  PROPERTY_KEYS,
  buildFeeProperties,
  buildLineItemProperties,
  isOwnedKey,
  mergeLineItemProperties,
  readCustomization,
  readFee,
  visibleProperties,
} from './properties';

const product = { productId: '1', variantId: '42', options: { Size: 'M' }, quantity: 1, modelId: TSHIRT_V1.id, modelUrl: 'm.glb' };
const textLayer: DesignLayer = {
  ...createLayer(TSHIRT_V1, 'left_chest', {
    type: 'text',
    text: 'JANE\nDOE',
    fontId: 'serif',
    threadColorId: 'black',
    sizeCm: 1,
    letterSpacing: 0,
    alignment: 'center',
  }),
  rendered: { widthCm: 8.04, heightCm: 2.96, fitted: false },
};
textLayer.placement = { ...textLayer.placement, offsetXCm: 1, offsetYCm: -0.5, rotationDeg: 5 };
const textConfig: EmbroideryConfiguration = createConfiguration(TSHIRT_V1, product, { layers: [textLayer] });

const logo: ImageDesign = {
  type: 'image',
  storageRef: 'art_1',
  previewUrl: 'blob:x',
  originalFilename: 'logo.png',
  mimeType: 'image/png',
  byteSize: 9,
  widthPx: 100,
  heightPx: 100,
  scale: 1,
  backgroundRemoved: true,
};

describe('buildLineItemProperties', () => {
  it('writes readable fulfilment metadata for a single text design', () => {
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
    expect(p[PROPERTY_KEYS.designs]).toBeUndefined();
  });

  it('numbers additional designs and never includes image data', () => {
    const back = { ...createLayer(TSHIRT_V1, 'center_back', logo), rendered: { widthCm: 20, heightCm: 20, fitted: false } };
    const p = buildLineItemProperties({ ...textConfig, layers: [textLayer, back] }, { configRef: 'cfg' });
    expect(p['Embroidery Designs']).toBe('2');
    expect(p['Placement']).toBe('Left Chest');
    expect(p['Design 2 – Type']).toBe('Logo / Image');
    expect(p['Design 2 – Artwork File']).toBe('logo.png');
    expect(p['Design 2 – Background Removed']).toBe('Yes');
    expect(p['Design 2 – Placement']).toBe('Center Back');
    expect(p['_Design 2 – Artwork Ref']).toBe('art_1');
    expect(JSON.stringify(p)).not.toMatch(/blob:|data:|base64/);
  });

  it('labels team order lines', () => {
    const p = buildLineItemProperties({ ...textConfig, teamOrderId: 'abcdef12-0000-4000-8000-000000000000' }, { configRef: 'x', teamPosition: '3 of 12' });
    expect(p['Team Order']).toBe('ABCDEF12 (3 of 12)');
  });

  it('hides internal references from customers (underscore keys)', () => {
    const keys = visibleProperties(buildLineItemProperties(textConfig, { configRef: 'x' })).map(([k]) => k);
    expect(keys).not.toContain('_Embroidery Config Ref');
    expect(keys).toContain('Customization ID');
  });
});

describe('mergeLineItemProperties', () => {
  it('preserves unrelated keys and replaces every embroidery key, including numbered ones', () => {
    const existing = {
      'Gift Note': 'Happy birthday',
      _other_app: 'keep-me',
      'Artwork File': 'old.png',
      'Design 2 – Placement': 'Center Back', // design 2 was removed in the edit
      '_Design 2 – Embroidery Artwork Ref': 'art_old',
      'Embroidery Type': 'Logo / Image',
      'Customization ID': 'old',
    };
    const merged = mergeLineItemProperties(existing, buildLineItemProperties(textConfig, { configRef: 'new' }));
    expect(merged['Gift Note']).toBe('Happy birthday');
    expect(merged._other_app).toBe('keep-me');
    expect(merged['Artwork File']).toBeUndefined();
    expect(merged['Design 2 – Placement']).toBeUndefined();
    expect(merged['_Design 2 – Embroidery Artwork Ref']).toBeUndefined();
    expect(merged['Embroidery Type']).toBe('Text');
    expect(merged[PROPERTY_KEYS.configRef]).toBe('new');
  });

  it('recognises owned keys', () => {
    expect(isOwnedKey('Design 3 – Font')).toBe(true);
    expect(isOwnedKey('Gift Note')).toBe(false);
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

describe('fee line properties', () => {
  it('round-trips the link to the customized item', () => {
    const p = buildFeeProperties('abc-123', 'logo', 2, 'Classic Tee');
    expect(readFee(p)).toEqual({ customizationId: 'abc-123', kind: 'logo', perItem: 2 });
    expect(p.For).toContain('Classic Tee');
    expect(readFee({})).toBeNull();
  });
});
