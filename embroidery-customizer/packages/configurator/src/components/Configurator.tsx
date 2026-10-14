import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'preact/hooks';
import {
  DESIGN_TEMPLATES,
  FONTS,
  LIMITS,
  NO_PRICING,
  THREAD_COLORS,
  SIZE_TIERS,
  availablePlacements,
  checkUpload,
  createId,
  feePrice,
  findThreadColor,
  formatMoney,
  getPreset,
  getSurface,
  imageIntrinsicSize,
  isSampleLogoUrl,
  positionsConflict,
  priceBreakdown,
  sizeTier,
  resolveGarmentColor,
  resolvePlacement,
  textLines,
  validateConfiguration,
  withBulkDiscount,
  type DesignTemplate,
  type EmbroideryConfiguration,
  type ImageDesign,
  type FeeCode,
  type ModelAdapter,
  type PlacementId,
  type PriceBreakdown,
  type PricingSettings,
  type ProductContext,
  type RenderedDimensions,
  type ResolvedPlacement,
  type ValidationIssue,
} from '@embroidery/shared';
import {
  buildLineItemProperties,
  type AddItemInput,
  type CartAdapter,
  type CartLine,
  type FeeInput,
} from '@embroidery/shopify-cart';
import { removeBackground } from '../engine/backgroundRemoval';
import { DesignRasterizer, type RasterResult } from '../engine/designRasterizer';
import { ensureFont, ensureUiFont } from '../engine/fonts';
import type { GarmentInfo, GarmentViewer } from '../engine/garmentViewer';
import type { PersistenceAdapter } from '../persistence/types';
import {
  STEPS,
  activeLayer,
  buildConfiguration,
  editorReducer,
  freePositions,
  initialEditorState,
  templateLayers,
  layerDesign,
  productSelection,
  variantForOption,
  type EditorLayer,
  type EditorState,
  type StepIndex,
} from '../state/editorState';
import {
  forgetDesign,
  listSavedDesigns,
  rememberDesign,
  shareUrl,
  type SavedDesign,
} from '../state/savedDesigns';
import { DesignStep } from './DesignStep';
import { LayerBar, layerTitle } from './LayerBar';
import { PlacementStep } from './PlacementStep';
import { ProductStep, isColorOption } from './ProductStep';
import { ReviewStep, type ReviewLayer } from './ReviewStep';
import { TeamOrderPanel, newTeamRow, type TeamRow } from './TeamOrderPanel';
import { TemplatePicker, type TemplateSession } from './TemplatePicker';
import { PriceBar } from './PriceBar';
import { Viewer } from './Viewer';
import { Notice } from './controls';
import { IconBag, IconCheck } from './icons';

export interface ConfiguratorSettings {
  heading: string;
  subtitle: string;
  /** Visual theme: 'clean' (subtle, inherits the shop font), 'atelier' (warm serif) or 'sport'. */
  theme: 'clean' | 'atelier' | 'sport';
  /** Show a Clean / Sport / Atelier switch (client previews). */
  themeSwitcher: boolean;
  defaultText: string;
  defaultPositionId: PlacementId;
  defaultThreadColorId: string;
  /** Garment colour option value to start on (e.g. "White"), unless a variant was chosen. */
  defaultGarmentColor: string;
  fontIds: string[];
  threadColorIds: string[];
  positionIds: PlacementId[];
  maxUploadBytes: number;
  /** Extra colour-name → hex mapping for the garment tint (null = original texture). */
  garmentColors: Record<string, string | null>;
  /** 'stay' shows a confirmation; 'cart' navigates to the cart after adding. */
  afterAdd: 'stay' | 'cart';
  cartUrl: string | null;
  sellingPlanId: string | null;
  /** Max designs per item (1 disables multi-design). */
  maxDesigns: number;
  teamOrders: boolean;
  sharing: boolean;
  /** Offer ready-made design templates on the Design step. */
  templates: boolean;
}

export const DEFAULT_SETTINGS: ConfiguratorSettings = {
  theme: 'clean',
  themeSwitcher: false,
  heading: 'Make it yours.',
  subtitle: 'Your name, your logo, your style. Create a piece that’s personal.',
  defaultText: 'YOUR NAME',
  defaultPositionId: 'left_chest',
  defaultThreadColorId: 'red',
  defaultGarmentColor: 'Black',
  fontIds: FONTS.map((f) => f.id),
  threadColorIds: THREAD_COLORS.map((c) => c.id),
  positionIds: ['left_chest', 'center_chest', 'right_chest', 'upper_back', 'center_back'],
  maxUploadBytes: LIMITS.maxUploadBytes,
  garmentColors: {},
  afterAdd: 'stay',
  cartUrl: null,
  sellingPlanId: null,
  maxDesigns: LIMITS.maxDesigns,
  teamOrders: true,
  sharing: true,
  templates: true,
};

export interface EditRequest {
  config: EmbroideryConfiguration;
  lineKey: string;
  customizationId: string;
}

export interface ConfiguratorProps {
  mode: 'demo' | 'shopify';
  adapter: ModelAdapter;
  modelUrl: string;
  product: ProductContext;
  cart: CartAdapter;
  persistence: PersistenceAdapter;
  settings?: Partial<ConfiguratorSettings>;
  /** Embroidery fees (charged as fee-product cart lines). Omit for no fees. */
  pricing?: PricingSettings;
  initialVariantId?: string | null;
  /** Variant chosen in the theme's own picker (kept in sync one-way). */
  externalVariantId?: string | null;
  edit?: EditRequest | null;
  /** Saved/shared design reference to open (e.g. from `?embroidery_design=` in the URL). */
  sharedDesignRef?: string | null;
  onAdded?: (line: CartLine) => void;
  onUpdated?: (line: CartLine) => void;
  onCancelEdit?: () => void;
  onViewCart?: () => void;
  /** Garments offered in this customizer (see GarmentConfigurator). */
  garments?: { id: string; label: string }[];
  garmentId?: string;
  /** Switch garment, carrying the current designs (and uploaded files) over. */
  onGarmentChange?: (id: string, carry: GarmentCarry) => void;
  /** Designs carried over from the previous garment. */
  carry?: GarmentCarry | null;
}

/** What survives a garment switch: the designs, option choices and uploaded logo files. */
export interface GarmentCarry {
  design: EmbroideryConfiguration;
  options: Record<string, string>;
  files: Map<string, File>;
}

interface Toast {
  tone: 'success' | 'error' | 'info';
  message: string;
  showCart?: boolean;
}

/** A message meant for the customer (validation), not an unexpected failure. */
class UserFacingError extends Error {}

interface LayerLayout {
  layerId: string;
  resolved: ResolvedPlacement | null;
  raster: RasterResult | null;
}

const STEP_TITLES = [
  'Choose your garment',
  'Create your design',
  'Place your embroidery',
  'Review your order',
];
const STEP_INTROS = [
  'Pick a size and colour. The 3D preview updates instantly.',
  'Type your text or upload a logo. Add more designs for other positions.',
  'Choose where each design is stitched, then fine-tune the position.',
  'Check every detail, then add one item or a whole team order.',
];

function relativeLuminance(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Renders an image URL (e.g. an SVG sample logo) to a transparent PNG file. */
async function rasterizeToPng(url: string, name: string, size = 1024): Promise<File> {
  const img = await decodeImage(url);
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  c.getContext('2d')?.drawImage(img, 0, 0, size, size);
  const blob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not prepare the logo. Please try again.');
  return new File([blob], name, { type: 'image/png' });
}

function decodeImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('decode failed'));
    img.src = url;
  });
}

async function decodeForTexture(url: string): Promise<CanvasImageSource> {
  const el = await decodeImage(url);
  const max = 1600; // keeps memory bounded on phones
  const scale = Math.min(1, max / Math.max(el.naturalWidth, el.naturalHeight));
  if (scale >= 1) return el;
  const c = document.createElement('canvas');
  c.width = Math.round(el.naturalWidth * scale);
  c.height = Math.round(el.naturalHeight * scale);
  c.getContext('2d')?.drawImage(el, 0, 0, c.width, c.height);
  return c;
}

/** Decoded artwork for every layer, keyed by preview URL. */
function useArtworkMap(urls: string[]): Map<string, CanvasImageSource> {
  const [map, setMap] = useState(() => new Map<string, CanvasImageSource>());
  const key = urls.join('|');
  useEffect(() => {
    let alive = true;
    void Promise.all(
      urls.map(
        async (u) => [u, map.get(u) ?? (await decodeForTexture(u).catch(() => null))] as const,
      ),
    ).then((entries) => {
      if (alive) setMap(new Map(entries.filter((e): e is [string, CanvasImageSource] => !!e[1])));
    });
    return () => {
      alive = false;
    };
  }, [key]);
  return map;
}

/** First available variant in the default garment colour (any size), if the product has it. */
function defaultColorVariant(product: ProductContext, color: string): string | undefined {
  const idx = product.options.findIndex((o) => isColorOption(o.name));
  if (idx < 0 || !color) return undefined;
  const want = color.trim().toLowerCase();
  return product.variants.find((v) => v.available && v.options[idx]?.toLowerCase() === want)?.id;
}

const sizeOptionOf = (product: ProductContext) =>
  product.options.find((o) => /size/i.test(o.name))?.name ?? null;

export function Configurator(props: ConfiguratorProps) {
  const { adapter, product, cart, persistence, mode } = props;
  const settings = useMemo(() => ({ ...DEFAULT_SETTINGS, ...props.settings }), [props.settings]);
  const pricing = props.pricing ?? NO_PRICING;
  const maxDesigns = Math.max(1, Math.min(LIMITS.maxDesigns, settings.maxDesigns));
  const reducer = useMemo(() => editorReducer(adapter), [adapter]);
  const makeInitial = useCallback(
    () =>
      initialEditorState(adapter, product, props.modelUrl, {
        variantId:
          props.initialVariantId ?? defaultColorVariant(product, settings.defaultGarmentColor),
        text: settings.defaultText,
        positionId: settings.defaultPositionId,
        threadColorId: settings.defaultThreadColorId,
      }),
    [adapter, product, props.modelUrl, props.initialVariantId, settings],
  );
  const [state, dispatch] = useReducer(reducer, undefined, makeInitial);
  const layer = activeLayer(state);

  const viewerRef = useRef<GarmentViewer | null>(null);
  const [viewerReady, setViewerReady] = useState(false);
  const [garmentInfo, setGarmentInfo] = useState<GarmentInfo | null>(null);
  const [fontsTick, setFontsTick] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [orderMode, setOrderMode] = useState<'single' | 'team'>('single');
  const sizeOption = sizeOptionOf(product);
  const [teamRows, setTeamRows] = useState<TeamRow[]>(() => [
    newTeamRow(sizeOption ? (state.product.options[sizeOption] ?? '') : ''),
  ]);
  const [share, setShare] = useState<{ busy: boolean; url: string | null; message: string | null }>(
    {
      busy: false,
      url: null,
      message: null,
    },
  );
  const [saved, setSaved] = useState<SavedDesign[]>(() =>
    settings.sharing ? listSavedDesigns() : [],
  );
  const rasterizers = useRef(new Map<string, DesignRasterizer>());
  const layoutCache = useRef(new Map<string, { sig: string; value: LayerLayout }>());
  /** Original upload per object URL, plus the original for logos whose background was removed. */
  const files = useRef(new Map<string, File>(props.carry?.files ?? []));
  /** Object URLs handed to the next garment on a switch (must not be revoked on unmount). */
  const handedOver = useRef(new Set<string>());
  const originals = useRef(
    new Map<string, { file: File; url: string; width: number; height: number }>(),
  );
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const THEME_KEY = 'embroidery-theme-choice';
  const [themeChoice, setThemeChoice] = useState<ConfiguratorSettings['theme']>(() => {
    if (!settings.themeSwitcher) return settings.theme;
    try {
      const saved = localStorage.getItem(THEME_KEY);
      return saved === 'clean' || saved === 'sport' || saved === 'atelier' ? saved : settings.theme;
    } catch {
      return settings.theme;
    }
  });
  useEffect(() => {
    if (!settings.themeSwitcher) setThemeChoice(settings.theme);
  }, [settings.theme, settings.themeSwitcher]);
  const theme = settings.themeSwitcher ? themeChoice : settings.theme;
  const chooseTheme = (t: ConfiguratorSettings['theme']) => {
    setThemeChoice(t);
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {
      /* private mode */
    }
  };
  useEffect(() => void ensureUiFont(theme), [theme]);

  /* ---------------- fonts: selected ones first, the full list when the Design step opens ---------------- */
  const fontKey = state.layers.map((l) => l.text.fontId).join(',');
  useEffect(() => {
    let alive = true;
    const ids = new Set(
      state.step === 1 ? settings.fontIds : state.layers.map((l) => l.text.fontId),
    );
    FONTS.filter((f) => ids.has(f.id) && settings.fontIds.includes(f.id)).forEach(
      (f) => void ensureFont(f).then(() => alive && setFontsTick((t) => t + 1)),
    );
    return () => {
      alive = false;
    };
  }, [settings.fontIds, fontKey, state.step === 1]);

  /* ---------------- open a cart line for editing / a shared design ---------------- */
  useEffect(() => {
    if (!props.edit) return;
    dispatch({
      type: 'load',
      config: props.edit.config,
      editing: { lineKey: props.edit.lineKey, customizationId: props.edit.customizationId },
    });
    setOrderMode('single');
    setToast({
      tone: 'info',
      message: 'Loaded your saved design. Make changes, then update your cart item.',
    });
  }, [props.edit]);

  const openSaved = useCallback(
    async (ref: string, silent = false) => {
      try {
        const config = await persistence.loadConfiguration(ref);
        dispatch({ type: 'load', config, editing: null, asNew: true });
        if (!silent)
          setToast({
            tone: 'success',
            message: 'Design loaded. Adjust anything, then add it to your cart.',
          });
        else setToast({ tone: 'info', message: 'Shared design loaded.' });
      } catch (e) {
        setToast({
          tone: 'error',
          message: e instanceof Error ? e.message : 'That design could not be opened.',
        });
      }
    },
    [persistence],
  );
  useEffect(() => {
    if (props.sharedDesignRef) void openSaved(props.sharedDesignRef, true);
  }, [props.sharedDesignRef, openSaved]);

  // Stored artwork (edit / shared designs) needs a fresh same-origin preview URL.
  const missingPreviews = state.layers
    .filter((l) => l.image?.storageRef && !l.image.previewUrl)
    .map((l) => [l.id, l.image!.storageRef!] as const);
  const missingKey = missingPreviews.map((m) => m.join(':')).join('|');
  useEffect(() => {
    if (!missingPreviews.length) return;
    let alive = true;
    for (const [layerId, ref] of missingPreviews) {
      persistence
        .resolveArtworkUrl(ref)
        .then(
          (previewUrl) =>
            alive && dispatch({ type: 'updateImage', layerId, patch: { previewUrl } }),
        )
        .catch((e: Error) => alive && setToast({ tone: 'error', message: e.message }));
    }
    return () => {
      alive = false;
    };
  }, [missingKey, persistence]);

  useEffect(() => {
    if (props.externalVariantId)
      dispatch({ type: 'selectVariant', variantId: props.externalVariantId, product });
  }, [props.externalVariantId, product]);

  useEffect(
    () => () => {
      files.current.forEach((_, url) => !handedOver.current.has(url) && URL.revokeObjectURL(url));
      originals.current.forEach(
        (o) => !handedOver.current.has(o.url) && URL.revokeObjectURL(o.url),
      );
    },
    [],
  );

  /* ---------------- designs carried over from another garment ---------------- */
  useEffect(() => {
    if (!props.carry) return;
    dispatch({
      type: 'load',
      config: props.carry.design,
      editing: null,
      keepProduct: true,
      allowed: settings.positionIds,
    });
  }, []);

  /* ---------------- designs → bitmaps → resolved placements ---------------- */
  const artworkUrls = state.layers
    .filter((l) => l.activeDesign === 'image' && l.image?.previewUrl)
    .map((l) => l.image!.previewUrl!);
  const artworks = useArtworkMap(artworkUrls);

  const rasterizerFor = (id: string) => {
    let r = rasterizers.current.get(id);
    if (!r) {
      r = new DesignRasterizer();
      rasterizers.current.set(id, r);
    }
    return r;
  };

  const computeLayout = useCallback(
    (l: EditorLayer, own?: DesignRasterizer): LayerLayout => {
      const rasterizer = own ?? rasterizerFor(l.id);
      const preset = getPreset(adapter, l.placement.positionId);
      if (!preset) return { layerId: l.id, resolved: null, raster: null };
      if (l.activeDesign === 'text' || !l.image) {
        if (l.activeDesign === 'image' || textLines(l.text.text).length === 0)
          return { layerId: l.id, resolved: null, raster: null };
        const resolved = resolvePlacement(adapter, l.placement, rasterizer.measureTextSize(l.text));
        return {
          layerId: l.id,
          resolved,
          raster: rasterizer.renderText(l.text, resolved.widthCm, resolved.heightCm),
        };
      }
      const resolved = resolvePlacement(adapter, l.placement, imageIntrinsicSize(preset, l.image));
      const art = l.image.previewUrl ? artworks.get(l.image.previewUrl) : undefined;
      return {
        layerId: l.id,
        resolved,
        raster: art
          ? rasterizer.renderImage(
              art,
              resolved.widthCm,
              resolved.heightCm,
              l.image.stitchStyle ?? 'flat',
            )
          : null,
      };
    },
    [adapter, artworks],
  );

  const layouts = useMemo((): LayerLayout[] => {
    const cache = layoutCache.current;
    const ids = new Set(state.layers.map((l) => l.id));
    for (const id of [...cache.keys()]) if (!ids.has(id)) cache.delete(id);
    for (const id of [...rasterizers.current.keys()])
      if (!ids.has(id)) rasterizers.current.delete(id);
    return state.layers.map((l) => {
      // Re-rasterize only layers that changed, so editing one design doesn't re-upload the others.
      const art = l.image?.previewUrl ? artworks.has(l.image.previewUrl) : false;
      const sig = JSON.stringify([l.activeDesign, l.text, l.image, l.placement, art, fontsTick]);
      const hit = cache.get(l.id);
      if (hit && hit.sig === sig) return hit.value;
      try {
        const value = computeLayout(l);
        cache.set(l.id, { sig, value });
        return value;
      } catch (error) {
        console.error('[embroidery] layout failed', error);
        return { layerId: l.id, resolved: null, raster: null };
      }
    });
  }, [state.layers, artworks, fontsTick, computeLayout]);
  const layoutOf = (id: string) => layouts.find((x) => x.layerId === id) ?? null;
  const activeLayout = layoutOf(layer.id);

  const renderedMap = useMemo(() => {
    const out: Record<string, RenderedDimensions | null> = {};
    for (const x of layouts)
      out[x.layerId] = x.resolved
        ? { widthCm: x.resolved.widthCm, heightCm: x.resolved.heightCm, fitted: x.resolved.fitted }
        : null;
    return out;
  }, [layouts]);

  /* ---------------- push to the 3D viewer ---------------- */
  const decalsFor = (lays: LayerLayout[], layers: EditorLayer[]) =>
    lays.flatMap((x) => {
      const l = layers.find((y) => y.id === x.layerId);
      const surface = x.resolved && getSurface(adapter, x.resolved.preset.surfaceId);
      if (!l || !x.raster || !x.resolved || !surface) return [];
      return [
        {
          id: x.layerId,
          canvas: x.raster.canvas,
          version: x.raster.version,
          surface,
          center: x.resolved.center,
          widthCm: x.raster.canvasWidthCm,
          heightCm: x.raster.canvasHeightCm,
          rotationDeg: l.placement.rotationDeg,
          height: x.raster.height,
          relief: x.raster.relief,
        },
      ];
    });
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !viewerReady) return;
    viewer.setDecals(decalsFor(layouts, state.layers));
  }, [layouts, viewerReady, adapter]);

  const colorOption = product.options.find((o) => isColorOption(o.name));
  const garmentHex = resolveGarmentColor(
    colorOption ? state.product.options[colorOption.name] : undefined,
    settings.garmentColors,
  );
  useEffect(() => {
    if (viewerReady) viewerRef.current?.setGarmentColor(garmentHex ?? null);
  }, [garmentHex, viewerReady]);

  // Turn the garment to face the selected design's surface.
  const surfaceId = getPreset(adapter, layer.placement.positionId)?.surfaceId;
  const facingSurface = surfaceId === 'back' ? 'back' : surfaceId === 'front' ? 'front' : null;
  const lastSurface = useRef(facingSurface);
  useEffect(() => {
    if (!viewerReady || lastSurface.current === facingSurface) return;
    lastSurface.current = facingSurface;
    if (facingSurface) viewerRef.current?.setView(facingSurface);
  }, [facingSurface, viewerReady]);

  useEffect(() => {
    viewerRef.current?.setDragEnabled(viewerReady && state.step === 2);
  }, [state.step, viewerReady]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus({ preventScroll: true });
    setStepError(null);
    if (state.step === 3 && viewerRef.current)
      setThumbnail(viewerRef.current.capture(420, facingSurface ?? 'front'));
  }, [state.step]);

  useEffect(() => {
    if (!confirmReset) return;
    const t = setTimeout(() => setConfirmReset(false), 4000);
    return () => clearTimeout(t);
  }, [confirmReset]);

  /* ---------------- validation + pricing ---------------- */
  const issues: ValidationIssue[] = useMemo(() => {
    const many = state.layers.length > 1;
    const list: ValidationIssue[] = [];
    state.layers.forEach((l, i) => {
      if (l.activeDesign === 'image' && !l.image)
        list.push({
          field: 'image',
          layer: i,
          message: `${many ? `Design ${i + 1}: ` : ''}Upload your logo or image, or switch to text.`,
        });
      if (!settings.positionIds.includes(l.placement.positionId))
        list.push({
          field: 'positionId',
          layer: i,
          message: 'Choose one of the offered positions.',
        });
    });
    if (list.length) return list;
    return validateConfiguration(adapter, buildConfiguration(state, renderedMap));
  }, [state, renderedMap, adapter, settings.positionIds]);

  const designIssues = issues.filter(
    (i) =>
      ![
        'variantId',
        'quantity',
        'positionId',
        'offset',
        'rotationDeg',
        'scale',
        'surfaceId',
      ].includes(i.field),
  );
  const garmentContrastHex = garmentHex ?? garmentInfo?.originalColorHex ?? null;
  const threadHex = findThreadColor(layer.text.threadColorId)?.hex;
  const lowContrast = !!(
    garmentContrastHex &&
    threadHex &&
    contrastRatio(garmentContrastHex, threadHex) < 1.6
  );

  const pricedDesigns = state.layers.map((l) => ({
    design: layerDesign(l),
    rendered: renderedMap[l.id] ?? null,
  }));
  const variant = product.variants.find((v) => v.id === state.product.variantId);
  const textLayers = state.layers.filter((l) => l.activeDesign === 'text');
  const [personalizedId, setPersonalizedId] = useState<string | null>(null);
  // Jersey number: a template's number layer, else a text design that is just a number ("10").
  const numberLayer =
    textLayers.find((l) => l.role === 'number') ??
    textLayers.find((l) => /^\d{1,2}$/.test(l.text.text.trim())) ??
    null;
  const nameCandidates = textLayers.filter((l) => l.id !== numberLayer?.id);
  // Default name design: a template's name layer, a text design on the back (where team names
  // usually go), else the first text design.
  const personalizedLayer =
    nameCandidates.find((l) => l.id === personalizedId) ??
    nameCandidates.find((l) => l.role === 'name') ??
    nameCandidates.find((l) => getPreset(adapter, l.placement.positionId)?.surfaceId === 'back') ??
    nameCandidates[0] ??
    null;
  /** Per-row text for a layer (name or number), or null when the layer isn't personalized. */
  const rowTextFor = (row: TeamRow, layerId: string): string | null => {
    if (personalizedLayer && layerId === personalizedLayer.id && row.text.trim())
      return row.text.trim();
    if (numberLayer && layerId === numberLayer.id && row.number.trim()) return row.number.trim();
    return null;
  };
  const teamVariant = (row: TeamRow) =>
    sizeOption ? variantForOption(product, state.product.options, sizeOption, row.size) : variant;
  /** Designs for one team row: the personalized text is re-measured, since size tiers can change. */
  const rowDesigns = (row: TeamRow) =>
    state.layers.map((l) => {
      const override = l.activeDesign === 'text' ? rowTextFor(row, l.id) : null;
      if (override === null) return { design: layerDesign(l), rendered: renderedMap[l.id] ?? null };
      const text = { ...l.text, text: override };
      const resolved = resolvePlacement(
        adapter,
        l.placement,
        rasterizerFor(l.id).measureTextSize(text),
      );
      return { design: text, rendered: { widthCm: resolved.widthCm, heightCm: resolved.heightCm } };
    });
  // Recomputed on every render: cheap, and always in sync with size / font / style / logo changes.
  const breakdown: PriceBreakdown = (() => {
    if (orderMode === 'team' && !state.editing) {
      const parts = teamRows.map((r) =>
        priceBreakdown(rowDesigns(r), teamVariant(r)?.price ?? 0, r.quantity, pricing),
      );
      const first = parts[0] ?? priceBreakdown(pricedDesigns, variant?.price ?? 0, 1, pricing);
      // Undiscounted per row; the tier is chosen by the whole order's quantity.
      const gross = (x: PriceBreakdown) => x.total + (x.bulkDiscount?.amount ?? 0);
      return withBulkDiscount(
        {
          ...first,
          quantity: parts.reduce((n, x) => n + x.quantity, 0),
          total: parts.reduce((n, x) => n + gross(x), 0),
          bulkDiscount: null,
        },
        parts.reduce((n, x) => n + x.basePrice * x.quantity, 0),
        pricing,
      );
    }
    return priceBreakdown(pricedDesigns, variant?.price ?? 0, state.product.quantity, pricing);
  })();
  const money = (n: number) => formatMoney(n, product.currency, product.locale);
  const priceHint = (code: FeeCode) =>
    feePrice(pricing, code) > 0 ? `+${money(feePrice(pricing, code))}` : null;
  const activeRendered = renderedMap[layer.id] ?? null;
  const sizeHint = (() => {
    if (!activeRendered || (!feePrice(pricing, 'size_medium') && !feePrice(pricing, 'size_large')))
      return null;
    const tier = sizeTier(activeRendered);
    if (tier === 'small') return `Small size (under ${SIZE_TIERS.mediumFromCm} cm) · included`;
    if (tier === 'medium')
      return `Medium size (${SIZE_TIERS.mediumFromCm}–${SIZE_TIERS.largeFromCm} cm) · ${priceHint('size_medium') ?? 'included'}`;
    return `Large size (${SIZE_TIERS.largeFromCm} cm+) · ${priceHint('size_large') ?? 'included'}`;
  })();

  const feeInputs = (b: PriceBreakdown): FeeInput[] =>
    b.fees
      .filter((f) => f.variantId)
      .map((f) => ({
        kind: f.kind,
        variantId: f.variantId!,
        perItem: f.perItem,
        meta: {
          title: `Embroidery fee — ${f.label}`,
          variantTitle: '',
          price: f.unitPrice,
        },
      }));

  /* ---------------- handlers ---------------- */
  const onViewer = useCallback((viewer: GarmentViewer | null, info: GarmentInfo | null) => {
    viewerRef.current = viewer;
    setGarmentInfo(info);
    setViewerReady(!!viewer);
  }, []);

  const stateRef = useRef<EditorState>(state);
  stateRef.current = state;
  const onDesignDrag = useCallback(
    (dx: number, dy: number, phase: 'start' | 'move' | 'end', layerId: string) => {
      const target = stateRef.current.layers.find((l) => l.id === layerId);
      if (!target) return;
      if (phase === 'start') {
        dispatch({ type: 'selectLayer', layerId });
        dragStart.current = { x: target.placement.offsetXCm, y: target.placement.offsetYCm };
      } else if (phase === 'move' && dragStart.current)
        dispatch({
          type: 'updatePlacement',
          layerId,
          patch: { offsetXCm: dragStart.current.x + dx, offsetYCm: dragStart.current.y + dy },
        });
      else dragStart.current = null;
    },
    [],
  );

  /** Clicking a design on the 3D garment selects it (and opens it for editing from Product/Review). */
  const onDesignClick = (layerId: string) => {
    dispatch({ type: 'selectLayer', layerId });
    if (stateRef.current.step === 0 || stateRef.current.step === 3) goTo(1);
  };

  const releaseUrl = (url: string | null | undefined) => {
    if (url && files.current.has(url)) {
      URL.revokeObjectURL(url);
      files.current.delete(url);
    }
  };

  /** Checks and decodes an upload; on success it's registered for upload at add-to-cart. */
  const prepareImage = async (file: File): Promise<{ image: ImageDesign } | { error: string }> => {
    const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const check = checkUpload(file, header, settings.maxUploadBytes);
    if (!check.ok || !check.mime) return { error: check.message ?? 'Unsupported file.' };
    const url = URL.createObjectURL(file);
    let img: HTMLImageElement;
    try {
      img = await decodeImage(url);
    } catch {
      URL.revokeObjectURL(url);
      return { error: 'We couldn’t read this image. It may be damaged — try exporting it again.' };
    }
    const { naturalWidth: w, naturalHeight: h } = img;
    if (w < LIMITS.minImagePx || h < LIMITS.minImagePx) {
      URL.revokeObjectURL(url);
      return {
        error: `This image is only ${w}×${h}px. Use at least ${LIMITS.minImagePx}px on each side for a clean result.`,
      };
    }
    if (w > LIMITS.maxImagePx || h > LIMITS.maxImagePx) {
      URL.revokeObjectURL(url);
      return {
        error: `This image is ${w}×${h}px. Please keep it under ${LIMITS.maxImagePx}px on each side.`,
      };
    }
    files.current.set(url, file);
    return {
      image: {
        type: 'image',
        storageRef: null,
        previewUrl: url,
        originalFilename: file.name.slice(0, 120),
        mimeType: check.mime,
        byteSize: file.size,
        widthPx: w,
        heightPx: h,
        scale: 0.5,
        backgroundRemoved: false,
      },
    };
  };

  /** Upload artwork onto the selected design. */
  const onUpload = async (file: File): Promise<string | null> => {
    const prepared = await prepareImage(file);
    if ('error' in prepared) return prepared.error;
    releaseUrl(layer.image?.previewUrl);
    originals.current.delete(layer.id);
    const preset = getPreset(adapter, layer.placement.positionId)!;
    dispatch({
      type: 'setImage',
      image: {
        ...prepared.image,
        scale: Math.min(1, preset.defaultImageWidthCm / preset.maxWidthCm),
      },
    });
    setToast({
      tone: 'success',
      message: `${file.name} is on the shirt. Adjust its size or placement.`,
    });
    return null;
  };

  /** "+ Add logo" (any step): a new design that starts as the uploaded artwork. */
  const onAddLogo = async (file: File) => {
    const prepared = await prepareImage(file);
    if ('error' in prepared) {
      setToast({ tone: 'error', message: prepared.error });
      return;
    }
    dispatch({ type: 'addLayer', allowed: settings.positionIds, image: prepared.image });
    if (stateRef.current.step === 0 || stateRef.current.step === 3) goTo(1);
    setToast({
      tone: 'success',
      message: `${file.name} added as a new design. Move it on the shirt or change its position.`,
    });
  };

  /** "+ Add text" (any step): a new text design, opened for typing. */
  const onAddText = () => {
    dispatch({ type: 'addLayer', allowed: settings.positionIds });
    if (stateRef.current.step !== 1) goTo(1);
  };

  /** Remove (tolerance) or restore (null) the active logo's background. Works from the original upload. */
  const onBackground = async (tolerance: number | null): Promise<string | null> => {
    const image = layer.image;
    if (!image) return null;
    const currentFile = image.previewUrl ? files.current.get(image.previewUrl) : undefined;
    const original =
      originals.current.get(layer.id) ??
      (currentFile && !image.backgroundRemoved
        ? {
            file: currentFile,
            url: image.previewUrl!,
            width: image.widthPx,
            height: image.heightPx,
          }
        : null);
    if (!original) return 'Upload the logo again to change its background.';
    if (tolerance === null) {
      releaseUrl(image.previewUrl);
      files.current.set(original.url, original.file);
      originals.current.delete(layer.id);
      dispatch({
        type: 'updateImage',
        patch: {
          previewUrl: original.url,
          storageRef: null,
          mimeType: original.file.type as typeof image.mimeType,
          byteSize: original.file.size,
          widthPx: original.width,
          heightPx: original.height,
          backgroundRemoved: false,
        },
      });
      return 'Original artwork restored.';
    }
    try {
      const decoded = await decodeImage(original.url);
      const result = await removeBackground(decoded, tolerance);
      if (result.alreadyTransparent) return 'This image already has a transparent background.';
      if (result.removed < 0.005) return 'No solid background colour was found around the edges.';
      originals.current.set(layer.id, original);
      files.current.delete(original.url); // keep the URL alive for "Restore", but it's no longer the upload
      if (image.previewUrl !== original.url) releaseUrl(image.previewUrl);
      const name = original.file.name.replace(/\.[^.]+$/, '') + '-no-background.png';
      const file = new File([result.blob], name, { type: 'image/png' });
      const url = URL.createObjectURL(file);
      files.current.set(url, file);
      dispatch({
        type: 'updateImage',
        patch: {
          previewUrl: url,
          storageRef: null,
          mimeType: 'image/png',
          byteSize: file.size,
          widthPx: result.width,
          heightPx: result.height,
          backgroundRemoved: true,
          originalFilename: original.file.name.slice(0, 120),
        },
      });
      return `Background removed (${Math.round(result.removed * 100)}% of the image).`;
    } catch (e) {
      console.error('[embroidery] background removal failed', e);
      return 'Sorry — the background could not be removed from this image.';
    }
  };

  const goTo = (step: StepIndex) => dispatch({ type: 'goTo', step });

  const next = () => {
    if (state.step === 1 && designIssues.length) {
      const first = designIssues[0]!;
      if (first.layer !== undefined && state.layers[first.layer])
        dispatch({ type: 'selectLayer', layerId: state.layers[first.layer]!.id });
      setStepError(first.message);
      return;
    }
    if (state.step < 3) goTo((state.step + 1) as StepIndex);
  };

  const reset = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    setConfirmReset(false);
    dispatch({ type: 'reset', state: makeInitial() });
    setOrderMode('single');
    viewerRef.current?.setView('home');
    setToast({ tone: 'info', message: 'Customization reset to the default design.' });
  };

  /** Uploads any artwork not yet stored; returns the layers with storage refs filled in. */
  const persistArtwork = async (): Promise<EditorLayer[]> => {
    const out: EditorLayer[] = [];
    for (const l of stateRef.current.layers) {
      if (l.activeDesign !== 'image' || !l.image || l.image.storageRef) {
        out.push(l);
        continue;
      }
      setBusy('Saving artwork…');
      let file = l.image.previewUrl ? files.current.get(l.image.previewUrl) : undefined;
      // Built-in template logos are vector art: stored as a 1024px PNG like any upload.
      if (!file && isSampleLogoUrl(l.image.previewUrl)) {
        file = await rasterizeToPng(l.image.previewUrl!, l.image.originalFilename);
        files.current.set(l.image.previewUrl!, file);
      }
      if (!file) throw new Error('Please upload your artwork again.');
      const stored = await persistence.uploadArtwork(file, {
        filename: file.name,
        mimeType: l.image.mimeType,
      });
      const patch = { storageRef: stored.storageRef, byteSize: file.size };
      dispatch({ type: 'updateImage', layerId: l.id, patch });
      out.push({ ...l, image: { ...l.image, ...patch } });
    }
    return out;
  };

  /** Front (+ back when used) render of the garment as a JPEG for the order email and staff. */
  const composeMockup = async (): Promise<Blob | null> => {
    const viewer = viewerRef.current;
    if (!viewer) return null;
    const hasBack = state.layers.some(
      (l) => getPreset(adapter, l.placement.positionId)?.surfaceId === 'back',
    );
    const shots = (hasBack ? (['front', 'back'] as const) : (['front'] as const))
      .map((v) => viewer.captureCanvas(640, v))
      .filter((c): c is HTMLCanvasElement => !!c);
    if (!shots.length) return null;
    const pad = 20;
    const c = document.createElement('canvas');
    c.width = shots.reduce((w, x) => w + x.width, 0) + pad * (shots.length + 1);
    c.height = Math.max(...shots.map((x) => x.height)) + pad * 2;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#f4f4f2'; // JPEG has no transparency; a soft studio grey
    ctx.fillRect(0, 0, c.width, c.height);
    let x = pad;
    for (const shot of shots) {
      ctx.drawImage(shot, x, pad);
      x += shot.width + pad;
    }
    return new Promise((resolve) => c.toBlob((b) => resolve(b), 'image/jpeg', 0.86));
  };

  /**
   * Saves a mockup and returns its URL; never blocks the order if it fails. `decals` swaps in
   * other designs first (team rows); the caller restores the live designs afterwards.
   */
  const saveMockup = async (decals?: ReturnType<typeof decalsFor>): Promise<string | null> => {
    if (!persistence.uploadMockup || !viewerRef.current) return null;
    try {
      if (decals) viewerRef.current.setDecals(decals);
      const blob = await composeMockup();
      return blob ? ((await persistence.uploadMockup(blob))?.url ?? null) : null;
    } catch (e) {
      console.warn('[embroidery] mockup skipped', e);
      return null;
    }
  };

  const itemMeta = (variantTitle: string, price: number) => ({
    title: product.title,
    variantTitle,
    price,
    image: viewerRef.current?.capture(240, facingSurface ?? 'front') ?? null,
  });

  const submitSingle = async () => {
    const layers = await persistArtwork();
    setBusy('Saving design…');
    const config = buildConfiguration(stateRef.current, renderedMap, { layers });
    const { configRef } = await persistence.saveConfiguration(config);
    const mockupUrl = await saveMockup();
    const properties = buildLineItemProperties(config, { configRef, mockupUrl });
    const meta = itemMeta(variant?.title ?? '', variant?.price ?? 0);
    const fees = feeInputs(breakdown);
    setBusy(state.editing ? 'Updating cart…' : 'Adding to cart…');
    if (state.editing) {
      const line = await cart.updateCustomizedItem({
        lineKey: state.editing.lineKey,
        customizationId: state.editing.customizationId,
        variantId: state.product.variantId,
        quantity: state.product.quantity,
        properties,
        meta,
        fees,
      });
      setToast({
        tone: 'success',
        message: 'Cart item updated with your new design.',
        showCart: true,
      });
      dispatch({ type: 'committed' });
      props.onUpdated?.(line);
      return;
    }
    const line = await cart.addItem({
      variantId: state.product.variantId,
      quantity: state.product.quantity,
      properties,
      sellingPlanId: settings.sellingPlanId,
      meta,
      fees,
    });
    dispatch({ type: 'committed' });
    props.onAdded?.(line);
    if (settings.afterAdd === 'cart' && settings.cartUrl) {
      window.location.href = settings.cartUrl;
      return;
    }
    setToast({
      tone: 'success',
      message: `Added to ${mode === 'demo' ? 'demo ' : ''}cart. Your next change will be saved as a new item.`,
      showCart: true,
    });
  };

  const teamRowError = (row: TeamRow): string | null => {
    const v = teamVariant(row);
    if (!v) return 'This size isn’t available in the chosen colour.';
    if (!v.available) return `${v.title} is sold out.`;
    return null;
  };

  const submitTeam = async () => {
    const rowIssues = teamRows
      .map((r, i) => {
        const e =
          teamRowError(r) ??
          (personalizedLayer && !r.text.trim() ? 'Enter a name.' : null) ??
          (numberLayer && !/^\d{1,2}$/.test(r.number.trim()) ? 'Enter a number (0–99).' : null);
        return e ? `Row ${i + 1}: ${e}` : null;
      })
      .filter((x): x is string => !!x);
    if (rowIssues.length) throw new UserFacingError(rowIssues[0]);
    const layers = await persistArtwork();
    const teamOrderId = createId();
    const inputs: AddItemInput[] = [];
    // Each person's mockup shows their own name / number; rendered with a scratch rasterizer.
    const scratch = new DesignRasterizer();
    let n = 0;
    try {
      for (const row of teamRows) {
        n += 1;
        setBusy(`Saving ${n} of ${teamRows.length}…`);
        const v = teamVariant(row)!;
        const rowLayers = layers.map((l) => {
          const override = l.activeDesign === 'text' ? rowTextFor(row, l.id) : null;
          return override === null ? l : { ...l, text: { ...l.text, text: override } };
        });
        const rendered = { ...renderedMap };
        for (const l of rowLayers) {
          if (l.activeDesign === 'text' && rowTextFor(row, l.id) !== null) {
            const resolved = resolvePlacement(
              adapter,
              l.placement,
              rasterizerFor(l.id).measureTextSize(l.text),
            );
            rendered[l.id] = {
              widthCm: resolved.widthCm,
              heightCm: resolved.heightCm,
              fitted: resolved.fitted,
            };
          }
        }
        const rowState: EditorState = {
          ...stateRef.current,
          product: productSelection(
            product,
            v,
            state.product.modelId,
            state.product.modelUrl,
            row.quantity,
          ),
        };
        const config = buildConfiguration(rowState, rendered, {
          layers: rowLayers,
          configurationId: createId(),
          teamOrderId,
        });
        const issuesForRow = validateConfiguration(adapter, config);
        if (issuesForRow.length) throw new UserFacingError(`Row ${n}: ${issuesForRow[0]!.message}`);
        const { configRef } = await persistence.saveConfiguration(config);
        const rowBreakdown = priceBreakdown(rowDesigns(row), v.price, row.quantity, pricing);
        const personal = rowLayers.some(
          (l) => l.activeDesign === 'text' && rowTextFor(row, l.id) !== null,
        );
        const mockupUrl = await saveMockup(
          personal
            ? decalsFor(
                rowLayers.map((l) =>
                  l.activeDesign === 'text' && rowTextFor(row, l.id) !== null
                    ? computeLayout(l, scratch)
                    : (layoutOf(l.id) ?? { layerId: l.id, resolved: null, raster: null }),
                ),
                rowLayers,
              )
            : undefined,
        );
        inputs.push({
          variantId: v.id,
          quantity: row.quantity,
          properties: buildLineItemProperties(config, {
            configRef,
            teamPosition: `${n} of ${teamRows.length}`,
            mockupUrl,
          }),
          meta: {
            ...itemMeta(v.title, v.price),
            title: `${product.title}${row.text ? ` — ${row.text.trim()}` : ''}${row.number ? ` #${row.number.trim()}` : ''}`,
          },
          fees: feeInputs(rowBreakdown),
        });
      }
    } finally {
      // Put the live designs back on the garment.
      viewerRef.current?.setDecals(decalsFor(layouts, stateRef.current.layers));
    }
    setBusy('Adding to cart…');
    await cart.addItems(inputs);
    dispatch({ type: 'committed' });
    if (settings.afterAdd === 'cart' && settings.cartUrl) {
      window.location.href = settings.cartUrl;
      return;
    }
    setToast({
      tone: 'success',
      message: `Added ${inputs.length} personalized item${inputs.length === 1 ? '' : 's'} to your ${mode === 'demo' ? 'demo ' : ''}cart.`,
      showCart: true,
    });
  };

  const submit = async () => {
    if (issues.length || busy) {
      if (issues.length) setStepError(issues[0]!.message);
      return;
    }
    setToast(null);
    setStepError(null);
    try {
      if (orderMode === 'team' && !state.editing) await submitTeam();
      else await submitSingle();
    } catch (error) {
      if (!(error instanceof UserFacingError)) console.error('[embroidery] submit failed', error);
      setToast({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Something went wrong. Please try again.',
      });
    } finally {
      setBusy(null);
    }
  };

  const onShare = async () => {
    if (issues.length) {
      setStepError(issues[0]!.message);
      return;
    }
    setShare({ busy: true, url: null, message: null });
    try {
      const layers = await persistArtwork();
      setBusy(null);
      const config = buildConfiguration(stateRef.current, renderedMap, { layers });
      const { configRef } = await persistence.saveConfiguration(config);
      const url = shareUrl(configRef);
      setSaved(
        rememberDesign({
          ref: configRef,
          title: product.title,
          summary: layers.map((l) => layerTitle(adapter, l)).join(' + '),
          savedAt: new Date().toISOString(),
        }),
      );
      let message = 'Saved. Copy the link below to share it.';
      try {
        await navigator.clipboard.writeText(url);
        message = 'Saved — link copied to your clipboard.';
      } catch {
        /* clipboard blocked: the link is shown for manual copy */
      }
      if (persistence.mode === 'demo') message += ' (Demo: links open in this browser only.)';
      setShare({ busy: false, url, message });
    } catch (e) {
      setBusy(null);
      setShare({
        busy: false,
        url: null,
        message: e instanceof Error ? e.message : 'Could not save this design.',
      });
    }
  };

  /* ---------------- render ---------------- */
  const allowed = availablePlacements(adapter, settings.positionIds).map((p) => p.id);
  const usedBy: Partial<Record<PlacementId, string>> = {};
  for (const preset of adapter.placements)
    state.layers.forEach((l, i) => {
      if (
        l.id === layer.id ||
        usedBy[preset.id] ||
        !positionsConflict(adapter, l.placement.positionId, preset.id)
      )
        return;
      usedBy[preset.id] =
        l.placement.positionId === preset.id
          ? `Used by design ${i + 1}`
          : `Overlaps design ${i + 1}`;
    });
  const canAddLayer =
    state.layers.length < maxDesigns &&
    freePositions(state, adapter, settings.positionIds).length > 0;
  const layerBar =
    maxDesigns > 1 ? (
      <LayerBar
        adapter={adapter}
        layers={state.layers}
        activeLayerId={layer.id}
        maxDesigns={maxDesigns}
        canAdd={canAddLayer}
        onSelect={(layerId) => dispatch({ type: 'selectLayer', layerId })}
        onAddText={onAddText}
        onAddLogo={(f) => void onAddLogo(f)}
        onRemove={(layerId) => {
          const removed = state.layers.find((l) => l.id === layerId);
          releaseUrl(removed?.image?.previewUrl);
          dispatch({ type: 'removeLayer', layerId });
        }}
      />
    ) : null;
  const switchGarment = (id: string) => {
    if (!props.onGarmentChange || id === props.garmentId) return;
    const carried = new Map<string, File>();
    for (const l of state.layers) {
      const url = l.image?.previewUrl;
      const file = url ? files.current.get(url) : undefined;
      if (url && file) {
        carried.set(url, file);
        handedOver.current.add(url);
      }
    }
    props.onGarmentChange(id, {
      design: buildConfiguration(state, renderedMap),
      options: state.product.options,
      files: carried,
    });
  };

  /* ---------------- templates: applied live, undoable ---------------- */
  const [tplSession, setTplSession] = useState<
    (TemplateSession & { ids: string[]; snapshot: EditorLayer[]; thread: string }) | null
  >(null);
  const templateOpts = { allowed: settings.positionIds, fontIds: settings.fontIds, maxDesigns };
  const layersOf = (
    t: DesignTemplate,
    values: Record<string, string> = {},
    extra: { ids?: string[]; thread?: string } = {},
  ) =>
    templateLayers(adapter, t, values, {
      ...templateOpts,
      ids: extra.ids,
      threadColorId: extra.thread ?? tplSession?.thread ?? layer.text.threadColorId,
    });
  const pickTemplate = (t: DesignTemplate) => {
    const values = Object.fromEntries(t.fields.map((f) => [f.key, f.defaultValue]));
    const thread = tplSession?.thread ?? layer.text.threadColorId;
    const layers = layersOf(t, values, { thread });
    if (!layers.length) return;
    dispatch({ type: 'applyTemplate', layers });
    setStepError(null);
    setTplSession({
      id: t.id,
      values,
      ids: layers.map((l) => l.id),
      // Keep the design from before the FIRST template, so Undo always goes back to it.
      snapshot: tplSession?.snapshot ?? state.layers,
      thread,
    });
  };
  const editTemplate = (values: Record<string, string>) => {
    const t = tplSession && DESIGN_TEMPLATES.find((x) => x.id === tplSession.id);
    if (!t || !tplSession) return;
    const layers = layersOf(t, values, { ids: tplSession.ids });
    if (layers.length) dispatch({ type: 'applyTemplate', layers });
    setTplSession({ ...tplSession, values });
  };
  const undoTemplate = () => {
    if (!tplSession) return;
    dispatch({ type: 'applyTemplate', layers: tplSession.snapshot });
    setTplSession(null);
    setToast({ tone: 'info', message: 'Template undone — your previous design is back.' });
  };
  const finishTemplate = () => {
    if (!tplSession) return;
    // Logos replaced by the template are gone for good now: free their previews.
    const kept = new Set(stateRef.current.layers.map((l) => l.image?.previewUrl));
    for (const l of tplSession.snapshot)
      if (l.image?.previewUrl && !kept.has(l.image.previewUrl)) releaseUrl(l.image.previewUrl);
    setTplSession(null);
  };
  // Leaving the Design step settles the template.
  useEffect(() => {
    if (state.step !== 1) finishTemplate();
  }, [state.step]);

  /** Embroidery price of each template on this garment (sizes measured like the real design). */
  const templatePrices = useRef(new Map<string, string | null>());
  const scratchRasterizer = useRef<DesignRasterizer | null>(null);
  const priceOfTemplate = (t: DesignTemplate): string | null => {
    const key = `${adapter.id}|${fontsTick}|${t.id}`;
    if (templatePrices.current.has(key)) return templatePrices.current.get(key)!;
    scratchRasterizer.current ??= new DesignRasterizer();
    const designs = layersOf(t).map((l) => {
      const r = resolvePlacement(
        adapter,
        l.placement,
        scratchRasterizer.current!.measureTextSize(l.text),
      );
      return { design: l.text, rendered: { widthCm: r.widthCm, heightCm: r.heightCm } };
    });
    const fees = priceBreakdown(designs, 0, 1, pricing).perItem;
    const label = fees > 0 ? `+${money(fees)}` : null;
    templatePrices.current.set(key, label);
    return label;
  };

  const pristine =
    state.layers.length === 1 &&
    state.layers[0]!.activeDesign === 'text' &&
    state.layers[0]!.text.text === settings.defaultText;
  const templatePicker = settings.templates ? (
    <TemplatePicker
      adapter={adapter}
      templates={DESIGN_TEMPLATES.filter((t) => layersOf(t).length > 0)}
      layersOf={(t, values) => layersOf(t, values)}
      shirtHex={garmentHex ?? garmentInfo?.originalColorHex ?? '#2c4aa6'}
      threadHex={(id) => findThreadColor(id)?.hex ?? '#ffffff'}
      priceOf={priceOfTemplate}
      session={tplSession}
      onPick={pickTemplate}
      onValues={editTemplate}
      onUndo={undoTemplate}
      onDone={finishTemplate}
      defaultOpen={pristine}
    />
  ) : null;
  const reviewLayers: ReviewLayer[] = state.layers.map((l) => ({
    layerId: l.id,
    design: layerDesign(l),
    resolved: layoutOf(l.id)?.resolved ?? null,
    rotationDeg: l.placement.rotationDeg,
  }));
  const canTeam = settings.teamOrders && !state.editing;
  const submitLabel = state.editing
    ? 'Update Cart Item'
    : orderMode === 'team'
      ? `Add ${teamRows.length} to Cart`
      : 'Add to Cart';

  return (
    <div
      class="emb-root"
      data-mode={mode}
      data-theme={theme}
      data-step={state.step}
      data-testid="configurator"
    >
      <header class="emb-header">
        <div>
          <p class="emb-eyebrow">
            <span class="emb-eyebrow__stitch" aria-hidden="true" />
            Embroidery studio
          </p>
          <h2 class="emb-title">{settings.heading}</h2>
          <p class="emb-subtitle">{settings.subtitle}</p>
        </div>
        <div class="emb-header__aside">
          {settings.themeSwitcher ? (
            <div
              class="emb-theme-switch"
              role="radiogroup"
              aria-label="Design style"
              data-testid="theme-switch"
            >
              {(['clean', 'sport', 'atelier'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={theme === t}
                  class={theme === t ? 'is-on' : ''}
                  onClick={() => chooseTheme(t)}
                >
                  {t === 'clean' ? 'Clean' : t === 'sport' ? 'Sport' : 'Atelier'}
                </button>
              ))}
            </div>
          ) : null}
          {mode === 'demo' ? (
            <span class="emb-badge" title="Cart and saved designs stay in this browser.">
              Demo workspace
            </span>
          ) : null}
        </div>
      </header>

      {state.editing ? (
        <Notice tone="info" testId="editing-banner">
          <span>
            <strong>Editing a cart item.</strong> Saving replaces that line’s embroidery; other cart
            lines are unchanged.
          </span>
          <button
            type="button"
            class="emb-link"
            onClick={() => {
              dispatch({ type: 'reset', state: { ...makeInitial() } });
              dispatch({ type: 'committed' });
              props.onCancelEdit?.();
            }}
          >
            Cancel editing
          </button>
        </Notice>
      ) : null}

      <nav class="emb-steps-nav" aria-label="Customization steps">
        <span class="emb-steps__track" aria-hidden="true">
          <span style={{ transform: `scaleX(${state.step / (STEPS.length - 1)})` }} />
        </span>
        <ol class="emb-steps">
          {STEPS.map((label, i) => (
            <li key={label}>
              <button
                type="button"
                class={`emb-step${i === state.step ? ' is-current' : ''}${i < state.step ? ' is-done' : ''}`}
                aria-current={i === state.step ? 'step' : undefined}
                onClick={() => goTo(i as StepIndex)}
                data-testid={`step-${i + 1}`}
              >
                <span class="emb-step__num">{i < state.step ? <IconCheck /> : i + 1}</span>
                <span class="emb-step__label">{label}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <div class="emb-layout">
        <div class="emb-layout__viewer">
          <Viewer
            adapter={adapter}
            modelUrl={props.modelUrl}
            onViewer={onViewer}
            onDesignDrag={onDesignDrag}
            onDesignClick={onDesignClick}
            designSurface={activeLayout?.raster ? facingSurface : null}
            dragHint={state.step === 2}
            modelLabel={product.title}
          />
          <div class="emb-preview-summary">
            <div>
              <strong>{product.title}</strong>
              <span>{Object.values(state.product.options).join(' / ')}</span>
            </div>
            <span class="emb-preview-summary__designs">
              {state.layers.length} {state.layers.length === 1 ? 'design' : 'designs'}
            </span>
          </div>
        </div>

        <section class="emb-panel" aria-labelledby="emb-step-heading">
          <div class="emb-panel__head">
            <h3 class="emb-panel__title" id="emb-step-heading" tabIndex={-1} ref={headingRef}>
              {STEP_TITLES[state.step]}
            </h3>
            <p class="emb-panel__intro">{STEP_INTROS[state.step]}</p>
          </div>

          <div class="emb-panel__body">
            {state.step === 0 ? (
              <>
                <ProductStep
                  product={product}
                  selection={state.product}
                  colorOverrides={settings.garmentColors}
                  originalColorHex={garmentInfo?.originalColorHex ?? null}
                  onOption={(name, value) =>
                    dispatch({ type: 'selectOption', name, value, product })
                  }
                  garments={state.editing ? undefined : props.garments}
                  garmentId={props.garmentId}
                  onGarment={switchGarment}
                />
                {settings.sharing && saved.length ? (
                  <div class="emb-saved" data-testid="saved-designs">
                    <p class="emb-field__label">Your saved designs</p>
                    <ul>
                      {saved.map((d) => (
                        <li key={d.ref}>
                          <span>
                            <strong>{d.summary || d.title}</strong>
                            <span class="emb-muted">
                              {' '}
                              · {new Date(d.savedAt).toLocaleDateString(product.locale)}
                            </span>
                          </span>
                          <span class="emb-row">
                            <button
                              type="button"
                              class="emb-link"
                              onClick={() => void openSaved(d.ref)}
                            >
                              Open
                            </button>
                            <button
                              type="button"
                              class="emb-link"
                              onClick={() =>
                                void navigator.clipboard
                                  ?.writeText(shareUrl(d.ref))
                                  .then(() => setToast({ tone: 'info', message: 'Link copied.' }))
                              }
                            >
                              Copy link
                            </button>
                            <button
                              type="button"
                              class="emb-link"
                              onClick={() => setSaved(forgetDesign(d.ref))}
                            >
                              Remove
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            ) : null}
            {/* A sibling of the per-design (keyed) DesignStep, so switching or replacing designs
                doesn't reset its open state / category filter. */}
            {state.step === 1 ? <div class="emb-stack">{templatePicker}</div> : null}
            {state.step === 1 ? (
              <DesignStep
                key={layer.id}
                header={layerBar}
                maxTextSizeCm={Math.min(
                  LIMITS.maxTextSizeCm,
                  getPreset(adapter, layer.placement.positionId)?.maxHeightCm ??
                    LIMITS.maxTextSizeCm,
                )}
                activeDesign={layer.activeDesign}
                text={layer.text}
                image={layer.image}
                fontIds={settings.fontIds}
                threadColorIds={settings.threadColorIds}
                maxUploadBytes={settings.maxUploadBytes}
                lowContrast={layer.activeDesign === 'text' && lowContrast}
                fitted={!!activeLayout?.resolved?.fitted}
                onDesignType={(designType) => dispatch({ type: 'setDesignType', designType })}
                onText={(patch) => dispatch({ type: 'updateText', patch })}
                onImageScale={(scale) => dispatch({ type: 'updateImage', patch: { scale } })}
                onUpload={onUpload}
                onBackground={onBackground}
                onStitchStyle={(stitchStyle) =>
                  layer.activeDesign === 'image'
                    ? dispatch({ type: 'updateImage', patch: { stitchStyle } })
                    : dispatch({ type: 'updateText', patch: { stitchStyle } })
                }
                priceHint={priceHint}
                sizeHint={sizeHint}
                onRemoveImage={() => {
                  releaseUrl(layer.image?.previewUrl);
                  originals.current.delete(layer.id);
                  dispatch({ type: 'removeImage' });
                }}
              />
            ) : null}
            {state.step === 2 ? (
              <PlacementStep
                header={layerBar}
                adapter={adapter}
                placement={layer.placement}
                allowed={allowed}
                usedBy={usedBy}
                resolved={activeLayout?.resolved ?? null}
                sizeHint={sizeHint}
                onPosition={(positionId) => dispatch({ type: 'setPosition', positionId })}
                onPatch={(patch) => dispatch({ type: 'updatePlacement', patch })}
              />
            ) : null}
            {state.step === 3 ? (
              <ReviewStep
                product={product}
                selection={state.product}
                layers={reviewLayers}
                thumbnail={thumbnail}
                issues={issues}
                breakdown={breakdown}
                orderMode={canTeam ? orderMode : 'single'}
                canTeam={canTeam}
                share={share}
                onShare={() => void onShare()}
                onOrderMode={(m) => {
                  setOrderMode(m);
                  if (m !== 'team') return;
                  // Start the first row from the design on screen (name + number).
                  setTeamRows((rows) =>
                    rows.length === 1 && !rows[0]!.text && !rows[0]!.number
                      ? [
                          {
                            ...rows[0]!,
                            text: personalizedLayer?.text.text.trim().split('\n')[0] ?? '',
                            number: numberLayer?.text.text.trim() ?? '',
                          },
                        ]
                      : rows,
                  );
                }}
                teamPanel={
                  <TeamOrderPanel
                    product={product}
                    sizeOption={sizeOption}
                    rows={teamRows}
                    personalizedLabel={
                      personalizedLayer ? layerTitle(adapter, personalizedLayer) : null
                    }
                    numberLabel={numberLayer ? layerTitle(adapter, numberLayer) : null}
                    personalizeOptions={nameCandidates.map((l) => ({
                      id: l.id,
                      label: getPreset(adapter, l.placement.positionId)?.label ?? '',
                    }))}
                    personalizedId={personalizedLayer?.id ?? null}
                    onPersonalize={setPersonalizedId}
                    onChange={setTeamRows}
                    rowError={teamRowError}
                  />
                }
                addDesign={
                  maxDesigns > 1 ? (
                    <LayerBar
                      actionsOnly
                      adapter={adapter}
                      layers={state.layers}
                      activeLayerId={layer.id}
                      maxDesigns={maxDesigns}
                      canAdd={canAddLayer}
                      onSelect={(layerId) => dispatch({ type: 'selectLayer', layerId })}
                      onAddText={onAddText}
                      onAddLogo={(f) => void onAddLogo(f)}
                      onRemove={() => undefined}
                    />
                  ) : null
                }
                onQuantity={(quantity) => dispatch({ type: 'setQuantity', quantity })}
                onEdit={(step, layerId) => {
                  if (layerId) dispatch({ type: 'selectLayer', layerId });
                  goTo(step);
                }}
              />
            ) : null}
          </div>

          {stepError ? (
            <p class="emb-field__error emb-step-error" role="alert" data-testid="step-error">
              {stepError}
            </p>
          ) : null}

          <div class="emb-dock">
            <PriceBar breakdown={breakdown} currency={product.currency} locale={product.locale} />
            <div class="emb-actions">
              <button
                type="button"
                class="emb-btn emb-btn--secondary"
                onClick={() => goTo((state.step - 1) as StepIndex)}
                disabled={state.step === 0}
              >
                Back
              </button>
              {state.step < 3 ? (
                <button
                  type="button"
                  class="emb-btn emb-btn--primary"
                  onClick={next}
                  data-testid="continue"
                >
                  Continue
                </button>
              ) : (
                <button
                  type="button"
                  class="emb-btn emb-btn--primary"
                  onClick={() => void submit()}
                  disabled={!!busy}
                  aria-disabled={issues.length > 0}
                  data-testid="add-to-cart"
                >
                  {busy ? (
                    <span class="emb-spinner emb-spinner--sm" aria-hidden="true" />
                  ) : (
                    <IconBag />
                  )}
                  <span>{busy ?? submitLabel}</span>
                </button>
              )}
            </div>
          </div>
          <div class="emb-actions__secondary">
            <button type="button" class="emb-link" onClick={reset} data-testid="reset">
              {confirmReset ? 'Click again to confirm reset' : 'Reset Customization'}
            </button>
            {state.step < 3 ? (
              <button type="button" class="emb-link" onClick={() => goTo(3)}>
                Skip to review
              </button>
            ) : null}
          </div>
        </section>
      </div>

      <div class="emb-toast-region" role="status" aria-live="polite" data-testid="toast">
        {toast ? (
          <div class={`emb-toast emb-toast--${toast.tone}`}>
            <span>{toast.message}</span>
            {toast.showCart && (props.onViewCart || settings.cartUrl) ? (
              props.onViewCart ? (
                <button type="button" class="emb-link" onClick={props.onViewCart}>
                  View cart
                </button>
              ) : (
                <a class="emb-link" href={settings.cartUrl!}>
                  View cart
                </a>
              )
            ) : null}
            <button
              type="button"
              class="emb-toast__close"
              aria-label="Dismiss message"
              onClick={() => setToast(null)}
            >
              ×
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
