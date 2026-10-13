import { describe, expect, it } from 'vitest';
import { TSHIRT_V1, type ProductContext } from '@embroidery/shared';
import { buildConfiguration, editorReducer, initialEditorState } from './editorState';

const product: ProductContext = {
  id: 'p',
  title: 'Tee',
  currency: 'USD',
  locale: 'en-US',
  isDemo: true,
  options: [
    { name: 'Size', values: ['S', 'M'] },
    { name: 'Color', values: ['White', 'Black'] },
  ],
  variants: [
    { id: 'v1', title: 'S / White', options: ['S', 'White'], available: true, price: 100 },
    { id: 'v2', title: 'S / Black', options: ['S', 'Black'], available: true, price: 100 },
    { id: 'v3', title: 'M / White', options: ['M', 'White'], available: false, price: 100 },
    { id: 'v4', title: 'M / Black', options: ['M', 'Black'], available: true, price: 100 },
  ],
};
const reduce = editorReducer(TSHIRT_V1);
const init = () => initialEditorState(TSHIRT_V1, product, 'model.glb');

describe('editor reducer', () => {
  it('starts with YOUR NAME on the left chest', () => {
    const s = init();
    expect(s.text.text).toBe('YOUR NAME');
    expect(s.placement.positionId).toBe('left_chest');
    expect(s.product.variantId).toBe('v1');
  });

  it('resolves variants from option changes', () => {
    let s = reduce(init(), { type: 'selectOption', name: 'Color', value: 'Black', product });
    expect(s.product.variantId).toBe('v2');
    s = reduce(s, { type: 'selectOption', name: 'Size', value: 'M', product });
    expect(s.product).toMatchObject({ variantId: 'v4', options: { Size: 'M', Color: 'Black' } });
  });

  it('resets offsets and uses the preset text size when the position changes', () => {
    let s = reduce(init(), { type: 'updatePlacement', patch: { offsetXCm: 2 } });
    s = reduce(s, { type: 'setPosition', positionId: 'center_back' });
    expect(s.placement).toMatchObject({
      positionId: 'center_back',
      surfaceId: 'back',
      offsetXCm: 0,
    });
    expect(s.text.sizeCm).toBe(3.5);
  });

  it('ignores unavailable positions and clamps placement values', () => {
    let s = reduce(init(), { type: 'setPosition', positionId: 'left_sleeve' });
    expect(s.placement.positionId).toBe('left_chest');
    s = reduce(s, { type: 'updatePlacement', patch: { offsetYCm: 99 } });
    expect(s.placement.offsetYCm).toBe(3);
  });

  it('keeps the text design when switching to image and back', () => {
    let s = reduce(init(), { type: 'updateText', patch: { text: 'KEEP' } });
    s = reduce(s, { type: 'setDesignType', designType: 'image' });
    s = reduce(s, { type: 'setDesignType', designType: 'text' });
    expect(s.text.text).toBe('KEEP');
  });

  it('builds a configuration from the active design and issues a new id after committing', () => {
    const s = init();
    const config = buildConfiguration(s, { widthCm: 8, heightCm: 1, fitted: false });
    expect(config.design.type).toBe('text');
    expect(config.rendered?.widthCm).toBe(8);
    const next = reduce(s, { type: 'committed' });
    expect(next.configurationId).not.toBe(s.configurationId);
  });

  it('clamps quantity', () => {
    expect(reduce(init(), { type: 'setQuantity', quantity: 0 }).product.quantity).toBe(1);
    expect(reduce(init(), { type: 'setQuantity', quantity: 500 }).product.quantity).toBe(99);
  });
});
