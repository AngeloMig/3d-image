import { describe, expect, it } from 'vitest';
import { TSHIRT_V1, findTemplate, getModelAdapter, type ProductContext } from '@embroidery/shared';
import {
  activeLayer,
  buildConfiguration,
  editorReducer,
  initialEditorState,
  templateLayers,
} from './editorState';

const L = (s: ReturnType<typeof initialEditorState>) => activeLayer(s);

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
    expect(L(s).text.text).toBe('YOUR NAME');
    expect(L(s).placement.positionId).toBe('left_chest');
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
    expect(L(s).placement).toMatchObject({
      positionId: 'center_back',
      surfaceId: 'back',
      offsetXCm: 0,
    });
    expect(L(s).text.sizeCm).toBe(3.5);
  });

  it('ignores unavailable positions and clamps placement values', () => {
    let s = reduce(init(), { type: 'setPosition', positionId: 'left_sleeve' });
    expect(L(s).placement.positionId).toBe('left_chest');
    s = reduce(s, { type: 'updatePlacement', patch: { offsetYCm: 99 } });
    expect(L(s).placement.offsetYCm).toBe(3);
  });

  it('keeps the text design when switching to image and back', () => {
    let s = reduce(init(), { type: 'updateText', patch: { text: 'KEEP' } });
    s = reduce(s, { type: 'setDesignType', designType: 'image' });
    s = reduce(s, { type: 'setDesignType', designType: 'text' });
    expect(L(s).text.text).toBe('KEEP');
  });

  it('builds a configuration from the active design and issues a new id after committing', () => {
    const s = init();
    const config = buildConfiguration(s, { [L(s).id]: { widthCm: 8, heightCm: 1, fitted: false } });
    expect(config.layers[0]!.design.type).toBe('text');
    expect(config.layers[0]!.rendered?.widthCm).toBe(8);
    const next = reduce(s, { type: 'committed' });
    expect(next.configurationId).not.toBe(s.configurationId);
  });

  it('clamps quantity', () => {
    expect(reduce(init(), { type: 'setQuantity', quantity: 0 }).product.quantity).toBe(1);
    expect(reduce(init(), { type: 'setQuantity', quantity: 500 }).product.quantity).toBe(99);
  });

  it('adds up to four designs on free, non-overlapping positions, and removes them', () => {
    let s = init();
    s = reduce(s, { type: 'addLayer' }); // center chest overlaps left chest → right chest
    s = reduce(s, { type: 'addLayer', positionId: 'center_back' });
    s = reduce(s, { type: 'addLayer' });
    expect(s.layers.map((l) => l.placement.positionId)).toEqual([
      'left_chest',
      'right_chest',
      'center_back',
      'upper_back',
    ]);
    expect(s.activeLayerId).toBe(s.layers[3]!.id);
    expect(reduce(s, { type: 'addLayer' }).layers).toHaveLength(4); // max reached
    s = reduce(s, { type: 'removeLayer', layerId: s.layers[1]!.id });
    expect(s.layers.map((l) => l.placement.positionId)).toEqual([
      'left_chest',
      'center_back',
      'upper_back',
    ]);
  });

  it('blocks overlapping positions (center chest vs left/right chest)', () => {
    let s = reduce(init(), { type: 'addLayer', positionId: 'upper_back' });
    s = reduce(s, { type: 'setPosition', positionId: 'center_chest' });
    expect(L(s).placement.positionId).toBe('upper_back');
  });

  it('never lets two designs share a position', () => {
    let s = reduce(init(), { type: 'addLayer', positionId: 'upper_back' });
    s = reduce(s, { type: 'setPosition', positionId: 'left_chest' }); // taken by design 1
    expect(L(s).placement.positionId).toBe('upper_back');
  });

  it('edits only the selected design', () => {
    let s = reduce(init(), { type: 'addLayer', positionId: 'center_back' });
    s = reduce(s, { type: 'updateText', patch: { text: 'BACK' } });
    s = reduce(s, { type: 'selectLayer', layerId: s.layers[0]!.id });
    expect(s.layers[0]!.text.text).toBe('YOUR NAME');
    expect(s.layers[1]!.text.text).toBe('BACK');
    // drag updates a specific layer even if it's not selected
    s = reduce(s, { type: 'updatePlacement', layerId: s.layers[1]!.id, patch: { offsetYCm: 2 } });
    expect(s.layers[1]!.placement.offsetYCm).toBe(2);
    expect(s.layers[0]!.placement.offsetYCm).toBe(0);
  });

  it('loads a shared design as a new customization', () => {
    const s = init();
    const config = buildConfiguration(s);
    const loaded = reduce(s, { type: 'load', config, editing: null, asNew: true });
    expect(loaded.configurationId).not.toBe(config.configurationId);
    expect(loaded.layers[0]!.text.text).toBe('YOUR NAME');
    const editing = reduce(s, {
      type: 'load',
      config,
      editing: { lineKey: 'k', customizationId: config.configurationId },
    });
    expect(editing.configurationId).toBe(config.configurationId);
  });
});

describe('templates', () => {
  const jersey = findTemplate('team-jersey')!;

  it('builds every layer of a template with the customer’s values and roles', () => {
    const layers = templateLayers(TSHIRT_V1, jersey, { team: 'hawks', name: 'Sam', number: '7' });
    expect(layers.map((l) => [l.placement.positionId, l.text.text, l.role])).toEqual([
      ['center_chest', 'HAWKS', undefined],
      ['upper_back', 'SAM', 'name'],
      ['center_back', '7', 'number'],
    ]);
    // Big jersey numbers are capped by the position's height.
    expect(layers[2]!.text.sizeCm).toBeLessThanOrEqual(22);
    const s = reduce(init(), { type: 'applyTemplate', layers });
    expect(s.layers).toHaveLength(3);
    expect(s.activeLayerId).toBe(layers[0]!.id);
  });

  it('skips positions the shop doesn’t offer and respects the design limit', () => {
    const chestOnly = templateLayers(TSHIRT_V1, jersey, {}, { allowed: ['center_chest'] });
    expect(chestOnly.map((l) => l.placement.positionId)).toEqual(['center_chest']);
    expect(templateLayers(TSHIRT_V1, jersey, {}, { maxDesigns: 2 })).toHaveLength(2);
    const noVarsity = templateLayers(TSHIRT_V1, jersey, {}, { fontIds: ['block'] });
    expect(noVarsity.every((l) => l.text.fontId === 'block')).toBe(true);
  });
});

describe('switching garment', () => {
  it('carries designs over and moves positions the new garment can’t take', () => {
    const polo = getModelAdapter('polo');
    let tee = init();
    tee = reduce(tee, { type: 'setPosition', positionId: 'center_chest' });
    tee = reduce(tee, { type: 'addLayer', positionId: 'center_back' });
    const design = buildConfiguration(tee);
    const onPolo = initialEditorState(polo, product, 'polo.glb');
    const s = editorReducer(polo)(onPolo, {
      type: 'load',
      config: design,
      editing: null,
      keepProduct: true,
    });
    expect(s.product).toEqual(onPolo.product); // garment's own product/variant kept
    expect(s.layers.map((l) => l.placement.positionId)).toEqual(['left_chest', 'center_back']);
  });
});
