import {
  DEFAULT_TEXT_DESIGN,
  LIMITS,
  SCHEMA_VERSION,
  clamp,
  constrainPlacement,
  createId,
  defaultPlacement,
  getPreset,
  type EmbroideryConfiguration,
  type ImageDesign,
  type ModelAdapter,
  type Placement,
  type PlacementId,
  type ProductContext,
  type ProductSelection,
  type ProductVariant,
  type RenderedDimensions,
  type TextDesign,
  type UV,
} from '@embroidery/shared';

export const STEPS = ['Product', 'Design', 'Placement', 'Review'] as const;
export type StepIndex = 0 | 1 | 2 | 3;

export interface EditingLine {
  lineKey: string;
  customizationId: string;
}

export interface EditorState {
  step: StepIndex;
  configurationId: string;
  createdAt: string;
  product: ProductSelection;
  activeDesign: 'text' | 'image';
  text: TextDesign;
  image: ImageDesign | null;
  placement: Placement;
  editing: EditingLine | null;
}

export type EditorAction =
  | { type: 'goTo'; step: StepIndex }
  | { type: 'selectOption'; name: string; value: string; product: ProductContext }
  | { type: 'selectVariant'; variantId: string; product: ProductContext }
  | { type: 'setQuantity'; quantity: number }
  | { type: 'setDesignType'; designType: 'text' | 'image' }
  | { type: 'updateText'; patch: Partial<Omit<TextDesign, 'type'>> }
  | { type: 'setImage'; image: ImageDesign }
  | { type: 'updateImage'; patch: Partial<Omit<ImageDesign, 'type'>> }
  | { type: 'removeImage' }
  | { type: 'setPosition'; positionId: PlacementId }
  | { type: 'updatePlacement'; patch: Partial<Omit<Placement, 'surfaceId' | 'positionId'>> }
  | { type: 'reset'; state: EditorState }
  | { type: 'load'; config: EmbroideryConfiguration; editing: EditingLine | null }
  | { type: 'committed' };

export function optionsOf(
  product: ProductContext,
  variant: ProductVariant,
): Record<string, string> {
  const out: Record<string, string> = {};
  product.options.forEach((o, i) => {
    const v = variant.options[i];
    if (v !== undefined) out[o.name] = v;
  });
  return out;
}

export function findVariant(
  product: ProductContext,
  options: Record<string, string>,
): ProductVariant | undefined {
  return product.variants.find((v) =>
    product.options.every((o, i) => v.options[i] === options[o.name]),
  );
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
    product.options.reduce((s, o, i) => s + (v.options[i] === wanted[o.name] ? 1 : 0), 0) +
    (v.available ? 0.5 : 0);
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

export function initialEditorState(
  adapter: ModelAdapter,
  product: ProductContext,
  modelUrl: string,
  opts: {
    variantId?: string;
    text?: string;
    positionId?: PlacementId;
    threadColorId?: string;
  } = {},
): EditorState {
  const variant =
    product.variants.find((v) => v.id === opts.variantId) ??
    product.variants.find((v) => v.available) ??
    product.variants[0];
  if (!variant) throw new Error('Product has no variants.');
  const positionId = opts.positionId ?? 'left_chest';
  const preset = getPreset(adapter, positionId);
  return {
    step: 0,
    configurationId: createId(),
    createdAt: new Date().toISOString(),
    product: productSelection(product, variant, adapter.id, modelUrl),
    activeDesign: 'text',
    text: {
      ...DEFAULT_TEXT_DESIGN,
      text: opts.text ?? DEFAULT_TEXT_DESIGN.text,
      threadColorId: opts.threadColorId ?? DEFAULT_TEXT_DESIGN.threadColorId,
      sizeCm: preset?.defaultTextSizeCm ?? DEFAULT_TEXT_DESIGN.sizeCm,
    },
    image: null,
    placement: defaultPlacement(adapter, positionId),
    editing: null,
  };
}

export function editorReducer(adapter: ModelAdapter) {
  return (state: EditorState, action: EditorAction): EditorState => {
    switch (action.type) {
      case 'goTo':
        return { ...state, step: action.step };
      case 'selectOption': {
        const variant = variantForOption(
          action.product,
          state.product.options,
          action.name,
          action.value,
        );
        if (!variant) return state;
        return {
          ...state,
          product: productSelection(
            action.product,
            variant,
            state.product.modelId,
            state.product.modelUrl,
            state.product.quantity,
          ),
        };
      }
      case 'selectVariant': {
        const variant = action.product.variants.find((v) => v.id === action.variantId);
        if (!variant || variant.id === state.product.variantId) return state;
        return {
          ...state,
          product: productSelection(
            action.product,
            variant,
            state.product.modelId,
            state.product.modelUrl,
            state.product.quantity,
          ),
        };
      }
      case 'setQuantity':
        return {
          ...state,
          product: {
            ...state.product,
            quantity: Math.round(clamp(action.quantity, 1, LIMITS.maxQuantity)),
          },
        };
      case 'setDesignType':
        return { ...state, activeDesign: action.designType };
      case 'updateText': {
        const next = { ...state.text, ...action.patch };
        next.sizeCm =
          Math.round(clamp(next.sizeCm, LIMITS.minTextSizeCm, LIMITS.maxTextSizeCm) * 10) / 10;
        next.letterSpacing = clamp(
          next.letterSpacing,
          LIMITS.minLetterSpacing,
          LIMITS.maxLetterSpacing,
        );
        return { ...state, text: next, activeDesign: 'text' };
      }
      case 'setImage':
        return { ...state, image: action.image, activeDesign: 'image' };
      case 'updateImage':
        if (!state.image) return state;
        return {
          ...state,
          image: {
            ...state.image,
            ...action.patch,
            scale: clamp(
              action.patch.scale ?? state.image.scale,
              LIMITS.minImageScale,
              LIMITS.maxImageScale,
            ),
          },
        };
      case 'removeImage':
        return { ...state, image: null, activeDesign: 'text' };
      case 'setPosition': {
        const preset = getPreset(adapter, action.positionId);
        if (!preset || !preset.available) return state;
        const image = state.image
          ? {
              ...state.image,
              scale: clamp(preset.defaultImageWidthCm / preset.maxWidthCm, LIMITS.minImageScale, 1),
            }
          : null;
        return {
          ...state,
          placement: defaultPlacement(adapter, action.positionId),
          text: { ...state.text, sizeCm: preset.defaultTextSizeCm },
          image,
        };
      }
      case 'updatePlacement':
        return {
          ...state,
          placement: constrainPlacement(adapter, { ...state.placement, ...action.patch }),
        };
      case 'reset':
        return { ...action.state, editing: state.editing };
      case 'load': {
        const c = action.config;
        return {
          step: 0,
          configurationId: c.configurationId,
          createdAt: c.createdAt,
          product: c.product,
          activeDesign: c.design.type,
          text: c.design.type === 'text' ? c.design : state.text,
          image: c.design.type === 'image' ? c.design : null,
          placement: constrainPlacement(adapter, c.placement),
          editing: action.editing,
        };
      }
      case 'committed':
        // Next customization gets a fresh identity so it becomes a separate cart line.
        return {
          ...state,
          configurationId: createId(),
          createdAt: new Date().toISOString(),
          editing: null,
        };
      default:
        return state;
    }
  };
}

export function buildConfiguration(
  state: EditorState,
  rendered: RenderedDimensions | null,
  uvCenter: UV | null = state.placement.uvCenter,
): EmbroideryConfiguration {
  const design = state.activeDesign === 'image' && state.image ? state.image : state.text;
  return {
    configurationId: state.configurationId,
    schemaVersion: SCHEMA_VERSION,
    product: state.product,
    design,
    placement: { ...state.placement, uvCenter },
    rendered,
    createdAt: state.createdAt,
    updatedAt: new Date().toISOString(),
  };
}
