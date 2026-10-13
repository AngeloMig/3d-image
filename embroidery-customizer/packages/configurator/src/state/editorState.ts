import {
  DEFAULT_TEXT_DESIGN,
  LIMITS,
  SCHEMA_VERSION,
  availablePlacements,
  clamp,
  constrainPlacement,
  createId,
  createLayerId,
  defaultPlacement,
  getPreset,
  positionsConflict,
  type DesignLayer,
  type EmbroideryConfiguration,
  type EmbroideryDesign,
  type ImageDesign,
  type ModelAdapter,
  type Placement,
  type PlacementId,
  type ProductContext,
  type ProductSelection,
  type ProductVariant,
  type RenderedDimensions,
  type TextDesign,
} from '@embroidery/shared';

export const STEPS = ['Product', 'Design', 'Placement', 'Review'] as const;
export type StepIndex = 0 | 1 | 2 | 3;

export interface EditingLine {
  lineKey: string;
  customizationId: string;
}

/**
 * One design being edited. Text and image drafts are kept side by side so switching a layer
 * between "Text" and "Upload" doesn't lose work.
 */
export interface EditorLayer {
  id: string;
  activeDesign: 'text' | 'image';
  text: TextDesign;
  image: ImageDesign | null;
  placement: Placement;
}

export interface EditorState {
  step: StepIndex;
  configurationId: string;
  createdAt: string;
  product: ProductSelection;
  layers: EditorLayer[];
  activeLayerId: string;
  editing: EditingLine | null;
}

type LayerPatch<T> = Partial<Omit<T, 'type'>>;

export type EditorAction =
  | { type: 'goTo'; step: StepIndex }
  | { type: 'selectOption'; name: string; value: string; product: ProductContext }
  | { type: 'selectVariant'; variantId: string; product: ProductContext }
  | { type: 'setQuantity'; quantity: number }
  | { type: 'selectLayer'; layerId: string }
  | { type: 'addLayer'; positionId?: PlacementId; allowed?: PlacementId[] }
  | { type: 'removeLayer'; layerId: string }
  | { type: 'setDesignType'; designType: 'text' | 'image' }
  | { type: 'updateText'; patch: LayerPatch<TextDesign> }
  | { type: 'setImage'; image: ImageDesign }
  | { type: 'updateImage'; patch: LayerPatch<ImageDesign>; layerId?: string }
  | { type: 'removeImage' }
  | { type: 'setPosition'; positionId: PlacementId }
  | { type: 'updatePlacement'; patch: Partial<Omit<Placement, 'surfaceId' | 'positionId'>>; layerId?: string }
  | { type: 'reset'; state: EditorState }
  | { type: 'load'; config: EmbroideryConfiguration; editing: EditingLine | null; asNew?: boolean }
  | { type: 'committed' };

/* ------------------------------------------------------------------ products */

export function optionsOf(product: ProductContext, variant: ProductVariant): Record<string, string> {
  const out: Record<string, string> = {};
  product.options.forEach((o, i) => {
    const v = variant.options[i];
    if (v !== undefined) out[o.name] = v;
  });
  return out;
}

export function findVariant(product: ProductContext, options: Record<string, string>): ProductVariant | undefined {
  return product.variants.find((v) => product.options.every((o, i) => v.options[i] === options[o.name]));
}

/** Pick the best variant after one option changes: exact match, else closest available. */
export function variantForOption(
  product: ProductContext,
  current: Record<string, string>,
  name: string,
  value: string,
): ProductVariant | undefined {
  const wanted = { ...current, [name]: value };
  const exact = findVariant(product, wanted);
  if (exact) return exact;
  const idx = product.options.findIndex((o) => o.name === name);
  const candidates = product.variants.filter((v) => v.options[idx] === value);
  const score = (v: ProductVariant) =>
    product.options.reduce((s, o, i) => s + (v.options[i] === wanted[o.name] ? 1 : 0), 0) + (v.available ? 0.5 : 0);
  return candidates.sort((a, b) => score(b) - score(a))[0];
}

export function productSelection(
  product: ProductContext,
  variant: ProductVariant,
  modelId: string,
  modelUrl: string,
  quantity = 1,
): ProductSelection {
  return {
    productId: product.id,
    variantId: variant.id,
    options: optionsOf(product, variant),
    quantity,
    modelId,
    modelUrl,
    productTitle: product.title,
    variantTitle: variant.title,
  };
}

/* ------------------------------------------------------------------ layers */

export function newLayer(
  adapter: ModelAdapter,
  positionId: PlacementId,
  text: Partial<TextDesign> = {},
): EditorLayer {
  const preset = getPreset(adapter, positionId);
  return {
    id: createLayerId(),
    activeDesign: 'text',
    text: { ...DEFAULT_TEXT_DESIGN, sizeCm: preset?.defaultTextSizeCm ?? DEFAULT_TEXT_DESIGN.sizeCm, ...text },
    image: null,
    placement: defaultPlacement(adapter, positionId),
  };
}

/** The design that will actually be stitched for a layer. */
export const layerDesign = (layer: EditorLayer): EmbroideryDesign =>
  layer.activeDesign === 'image' && layer.image ? layer.image : layer.text;

export const activeLayer = (state: EditorState): EditorLayer =>
  state.layers.find((l) => l.id === state.activeLayerId) ?? state.layers[0]!;

/** Positions not used by any other layer, in preset order. */
export function freePositions(state: EditorState, adapter: ModelAdapter, allowed?: PlacementId[], exceptLayerId?: string): PlacementId[] {
  const used = state.layers.filter((l) => l.id !== exceptLayerId).map((l) => l.placement.positionId);
  return availablePlacements(adapter, allowed)
    .map((p) => p.id)
    .filter((id) => !used.some((u) => positionsConflict(adapter, u, id)));
}

export function initialEditorState(
  adapter: ModelAdapter,
  product: ProductContext,
  modelUrl: string,
  opts: { variantId?: string; text?: string; positionId?: PlacementId; threadColorId?: string } = {},
): EditorState {
  const variant =
    product.variants.find((v) => v.id === opts.variantId) ??
    product.variants.find((v) => v.available) ??
    product.variants[0];
  if (!variant) throw new Error('Product has no variants.');
  const layer = newLayer(adapter, opts.positionId ?? 'left_chest', {
    text: opts.text ?? DEFAULT_TEXT_DESIGN.text,
    threadColorId: opts.threadColorId ?? DEFAULT_TEXT_DESIGN.threadColorId,
  });
  return {
    step: 0,
    configurationId: createId(),
    createdAt: new Date().toISOString(),
    product: productSelection(product, variant, adapter.id, modelUrl),
    layers: [layer],
    activeLayerId: layer.id,
    editing: null,
  };
}

function mapLayer(state: EditorState, layerId: string | undefined, fn: (l: EditorLayer) => EditorLayer): EditorState {
  const id = layerId ?? state.activeLayerId;
  return { ...state, layers: state.layers.map((l) => (l.id === id ? fn(l) : l)) };
}

function fromConfigLayer(layer: DesignLayer, adapter: ModelAdapter): EditorLayer {
  const preset = getPreset(adapter, layer.placement.positionId);
  return {
    id: layer.layerId,
    activeDesign: layer.design.type,
    text:
      layer.design.type === 'text'
        ? layer.design
        : { ...DEFAULT_TEXT_DESIGN, sizeCm: preset?.defaultTextSizeCm ?? DEFAULT_TEXT_DESIGN.sizeCm },
    image: layer.design.type === 'image' ? layer.design : null,
    placement: constrainPlacement(adapter, layer.placement),
  };
}

export function editorReducer(adapter: ModelAdapter) {
  return (state: EditorState, action: EditorAction): EditorState => {
    switch (action.type) {
      case 'goTo':
        return { ...state, step: action.step };
      case 'selectOption': {
        const variant = variantForOption(action.product, state.product.options, action.name, action.value);
        if (!variant) return state;
        return {
          ...state,
          product: productSelection(action.product, variant, state.product.modelId, state.product.modelUrl, state.product.quantity),
        };
      }
      case 'selectVariant': {
        const variant = action.product.variants.find((v) => v.id === action.variantId);
        if (!variant || variant.id === state.product.variantId) return state;
        return {
          ...state,
          product: productSelection(action.product, variant, state.product.modelId, state.product.modelUrl, state.product.quantity),
        };
      }
      case 'setQuantity':
        return { ...state, product: { ...state.product, quantity: Math.round(clamp(action.quantity, 1, LIMITS.maxQuantity)) } };

      case 'selectLayer':
        return state.layers.some((l) => l.id === action.layerId) ? { ...state, activeLayerId: action.layerId } : state;
      case 'addLayer': {
        if (state.layers.length >= LIMITS.maxDesigns) return state;
        const free = freePositions(state, adapter, action.allowed);
        const positionId = action.positionId && free.includes(action.positionId) ? action.positionId : free[0];
        if (!positionId) return state;
        const source = activeLayer(state).text;
        const layer = newLayer(adapter, positionId, {
          text: 'YOUR TEXT',
          fontId: source.fontId,
          threadColorId: source.threadColorId,
        });
        return { ...state, layers: [...state.layers, layer], activeLayerId: layer.id };
      }
      case 'removeLayer': {
        if (state.layers.length <= 1) return state;
        const layers = state.layers.filter((l) => l.id !== action.layerId);
        const activeLayerId = state.activeLayerId === action.layerId ? layers[0]!.id : state.activeLayerId;
        return { ...state, layers, activeLayerId };
      }

      case 'setDesignType':
        return mapLayer(state, undefined, (l) => ({ ...l, activeDesign: action.designType }));
      case 'updateText':
        return mapLayer(state, undefined, (l) => {
          const text = { ...l.text, ...action.patch };
          text.sizeCm = Math.round(clamp(text.sizeCm, LIMITS.minTextSizeCm, LIMITS.maxTextSizeCm) * 10) / 10;
          text.letterSpacing = clamp(text.letterSpacing, LIMITS.minLetterSpacing, LIMITS.maxLetterSpacing);
          return { ...l, text, activeDesign: 'text' };
        });
      case 'setImage':
        return mapLayer(state, undefined, (l) => ({ ...l, image: action.image, activeDesign: 'image' }));
      case 'updateImage':
        return mapLayer(state, action.layerId, (l) =>
          l.image
            ? {
                ...l,
                image: {
                  ...l.image,
                  ...action.patch,
                  scale: clamp(action.patch.scale ?? l.image.scale, LIMITS.minImageScale, LIMITS.maxImageScale),
                },
              }
            : l,
        );
      case 'removeImage':
        return mapLayer(state, undefined, (l) => ({ ...l, image: null, activeDesign: 'text' }));

      case 'setPosition': {
        const preset = getPreset(adapter, action.positionId);
        if (!preset || !preset.available) return state;
        const takenByOther = state.layers.some(
          (l) => l.id !== state.activeLayerId && positionsConflict(adapter, l.placement.positionId, action.positionId),
        );
        if (takenByOther) return state;
        return mapLayer(state, undefined, (l) => ({
          ...l,
          placement: defaultPlacement(adapter, action.positionId),
          text: { ...l.text, sizeCm: preset.defaultTextSizeCm },
          image: l.image
            ? { ...l.image, scale: clamp(preset.defaultImageWidthCm / preset.maxWidthCm, LIMITS.minImageScale, 1) }
            : null,
        }));
      }
      case 'updatePlacement':
        return mapLayer(state, action.layerId, (l) => ({
          ...l,
          placement: constrainPlacement(adapter, { ...l.placement, ...action.patch }),
        }));

      case 'reset':
        return { ...action.state, editing: state.editing };
      case 'load': {
        const c = action.config;
        const layers = c.layers.map((l) => fromConfigLayer(l, adapter));
        return {
          step: 0,
          // "asNew" (shared/saved designs) starts a fresh customization so it becomes its own cart line.
          configurationId: action.asNew ? createId() : c.configurationId,
          createdAt: action.asNew ? new Date().toISOString() : c.createdAt,
          product: { ...c.product, modelId: state.product.modelId, modelUrl: state.product.modelUrl },
          layers,
          activeLayerId: layers[0]!.id,
          editing: action.editing,
        };
      }
      case 'committed':
        // Next customization gets a fresh identity so it becomes a separate cart line.
        return { ...state, configurationId: createId(), createdAt: new Date().toISOString(), editing: null };
      default:
        return state;
    }
  };
}

export function buildConfiguration(
  state: EditorState,
  rendered: Record<string, RenderedDimensions | null> = {},
  overrides: { layers?: EditorLayer[]; configurationId?: string; teamOrderId?: string | null } = {},
): EmbroideryConfiguration {
  const layers = overrides.layers ?? state.layers;
  return {
    configurationId: overrides.configurationId ?? state.configurationId,
    schemaVersion: SCHEMA_VERSION,
    product: state.product,
    layers: layers.map((l) => ({
      layerId: l.id,
      design: layerDesign(l),
      placement: l.placement,
      rendered: rendered[l.id] ?? null,
    })),
    teamOrderId: overrides.teamOrderId ?? null,
    createdAt: state.createdAt,
    updatedAt: new Date().toISOString(),
  };
}
