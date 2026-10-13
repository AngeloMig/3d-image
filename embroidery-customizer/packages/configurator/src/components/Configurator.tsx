import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'preact/hooks';
import {
  FONTS,
  LIMITS,
  THREAD_COLORS,
  availablePlacements,
  checkUpload,
  findThreadColor,
  getPreset,
  getSurface,
  imageIntrinsicSize,
  resolveGarmentColor,
  resolvePlacement,
  textLines,
  validateConfiguration,
  type EmbroideryConfiguration,
  type ModelAdapter,
  type PlacementId,
  type ProductContext,
  type ResolvedPlacement,
  type ValidationIssue,
} from '@embroidery/shared';
import { buildLineItemProperties, type CartAdapter, type CartLine } from '@embroidery/shopify-cart';
import { DesignRasterizer, type RasterResult } from '../engine/designRasterizer';
import { ensureFont } from '../engine/fonts';
import type { GarmentInfo, GarmentViewer } from '../engine/garmentViewer';
import type { PersistenceAdapter } from '../persistence/types';
import {
  STEPS,
  buildConfiguration,
  editorReducer,
  initialEditorState,
  type StepIndex,
} from '../state/editorState';
import { DesignStep } from './DesignStep';
import { PlacementStep } from './PlacementStep';
import { ProductStep, isColorOption } from './ProductStep';
import { ReviewStep } from './ReviewStep';
import { Viewer } from './Viewer';
import { Notice } from './controls';
import { IconBag, IconCheck } from './icons';

export interface ConfiguratorSettings {
  heading: string;
  subtitle: string;
  defaultText: string;
  defaultPositionId: PlacementId;
  defaultThreadColorId: string;
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
}

export const DEFAULT_SETTINGS: ConfiguratorSettings = {
  heading: 'Customize Your Embroidery',
  subtitle:
    'Add a name, initials or your logo — see it stitched onto the garment in 3D before you order.',
  defaultText: 'YOUR NAME',
  defaultPositionId: 'left_chest',
  defaultThreadColorId: 'white',
  fontIds: FONTS.map((f) => f.id),
  threadColorIds: THREAD_COLORS.map((c) => c.id),
  positionIds: ['left_chest', 'center_chest', 'right_chest', 'upper_back', 'center_back'],
  maxUploadBytes: LIMITS.maxUploadBytes,
  garmentColors: {},
  afterAdd: 'stay',
  cartUrl: null,
  sellingPlanId: null,
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
  initialVariantId?: string | null;
  /** Variant chosen in the theme's own picker (kept in sync one-way). */
  externalVariantId?: string | null;
  edit?: EditRequest | null;
  onAdded?: (line: CartLine) => void;
  onUpdated?: (line: CartLine) => void;
  onCancelEdit?: () => void;
  onViewCart?: () => void;
}

interface Toast {
  tone: 'success' | 'error' | 'info';
  message: string;
  showCart?: boolean;
}

const STEP_TITLES = [
  'Choose your garment',
  'Create your design',
  'Place your embroidery',
  'Review your order',
];
const STEP_INTROS = [
  'Pick a size and colour. The 3D preview updates instantly.',
  'Type your text or upload a logo. It appears on the shirt as you edit.',
  'Choose where it’s stitched, then fine-tune the position.',
  'Check every detail before adding it to your cart.',
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

function decodeImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('decode failed'));
    img.src = url;
  });
}

/** Decoded artwork, downscaled for texture use (keeps memory bounded on phones). */
function useArtwork(url: string | null): CanvasImageSource | null {
  const [img, setImg] = useState<CanvasImageSource | null>(null);
  useEffect(() => {
    if (!url) {
      setImg(null);
      return;
    }
    let alive = true;
    decodeImage(url)
      .then((el) => {
        if (!alive) return;
        const max = 1600;
        const scale = Math.min(1, max / Math.max(el.naturalWidth, el.naturalHeight));
        if (scale >= 1) return setImg(el);
        const c = document.createElement('canvas');
        c.width = Math.round(el.naturalWidth * scale);
        c.height = Math.round(el.naturalHeight * scale);
        c.getContext('2d')?.drawImage(el, 0, 0, c.width, c.height);
        setImg(c);
      })
      .catch(() => alive && setImg(null));
    return () => {
      alive = false;
    };
  }, [url]);
  return img;
}

export function Configurator(props: ConfiguratorProps) {
  const { adapter, product, cart, persistence, mode } = props;
  const settings = useMemo(() => ({ ...DEFAULT_SETTINGS, ...props.settings }), [props.settings]);
  const reducer = useMemo(() => editorReducer(adapter), [adapter]);
  const makeInitial = useCallback(
    () =>
      initialEditorState(adapter, product, props.modelUrl, {
        variantId: props.initialVariantId ?? undefined,
        text: settings.defaultText,
        positionId: settings.defaultPositionId,
        threadColorId: settings.defaultThreadColorId,
      }),
    [adapter, product, props.modelUrl, props.initialVariantId, settings],
  );
  const [state, dispatch] = useReducer(reducer, undefined, makeInitial);

  const viewerRef = useRef<GarmentViewer | null>(null);
  const [viewerReady, setViewerReady] = useState(false);
  const [garmentInfo, setGarmentInfo] = useState<GarmentInfo | null>(null);
  const [fontsTick, setFontsTick] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const rasterizer = useMemo(() => new DesignRasterizer(), []);
  const files = useRef(new Map<string, File>());
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  /* ---------------- fonts: load once, re-render the texture when each arrives ---------------- */
  useEffect(() => {
    let alive = true;
    FONTS.filter((f) => settings.fontIds.includes(f.id)).forEach(
      (f) => void ensureFont(f).then(() => alive && setFontsTick((t) => t + 1)),
    );
    return () => {
      alive = false;
    };
  }, [settings.fontIds]);

  /* ---------------- edit-in-cart: load saved configuration ---------------- */
  useEffect(() => {
    if (!props.edit) return;
    dispatch({
      type: 'load',
      config: props.edit.config,
      editing: { lineKey: props.edit.lineKey, customizationId: props.edit.customizationId },
    });
    setToast({
      tone: 'info',
      message: 'Loaded your saved design. Make changes, then update your cart item.',
    });
  }, [props.edit]);

  // Stored artwork (edit mode) needs a fresh same-origin preview URL.
  const storageRef = state.image?.storageRef ?? null;
  const hasPreview = !!state.image?.previewUrl;
  useEffect(() => {
    if (!storageRef || hasPreview) return;
    let alive = true;
    persistence
      .resolveArtworkUrl(storageRef)
      .then((previewUrl) => alive && dispatch({ type: 'updateImage', patch: { previewUrl } }))
      .catch((e: Error) => alive && setToast({ tone: 'error', message: e.message }));
    return () => {
      alive = false;
    };
  }, [storageRef, hasPreview, persistence]);

  useEffect(() => {
    if (props.externalVariantId)
      dispatch({ type: 'selectVariant', variantId: props.externalVariantId, product });
  }, [props.externalVariantId, product]);

  // Revoke object URLs we created when unmounting.
  useEffect(
    () => () => {
      files.current.forEach((_, url) => URL.revokeObjectURL(url));
      files.current.clear();
    },
    [],
  );

  /* ---------------- design → bitmap → resolved placement ---------------- */
  const artwork = useArtwork(
    state.activeDesign === 'image' ? (state.image?.previewUrl ?? null) : null,
  );

  const layout = useMemo((): {
    resolved: ResolvedPlacement;
    raster: RasterResult | null;
  } | null => {
    try {
      const preset = getPreset(adapter, state.placement.positionId);
      if (!preset) return null;
      if (state.activeDesign === 'text') {
        if (textLines(state.text.text).length === 0) return null;
        const resolved = resolvePlacement(
          adapter,
          state.placement,
          rasterizer.measureTextSize(state.text),
        );
        return {
          resolved,
          raster: rasterizer.renderText(state.text, resolved.widthCm, resolved.heightCm),
        };
      }
      if (!state.image) return null;
      const resolved = resolvePlacement(
        adapter,
        state.placement,
        imageIntrinsicSize(preset, state.image),
      );
      return {
        resolved,
        raster: artwork
          ? rasterizer.renderImage(artwork, resolved.widthCm, resolved.heightCm)
          : null,
      };
    } catch (error) {
      console.error('[embroidery] layout failed', error);
      return null;
    }
    // fontsTick: re-measure once web fonts arrive
  }, [
    adapter,
    rasterizer,
    state.activeDesign,
    state.text,
    state.image,
    state.placement,
    artwork,
    fontsTick,
  ]);

  /* ---------------- push to the 3D viewer ---------------- */
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !viewerReady) return;
    if (!layout?.raster) {
      viewer.setDecal(null);
      return;
    }
    const surface = getSurface(adapter, layout.resolved.preset.surfaceId);
    if (!surface) return;
    viewer.setDecal({
      canvas: layout.raster.canvas,
      version: layout.raster.version,
      surface,
      center: layout.resolved.center,
      widthCm: layout.raster.canvasWidthCm,
      heightCm: layout.raster.canvasHeightCm,
      rotationDeg: state.placement.rotationDeg,
    });
  }, [layout, viewerReady, adapter, state.placement.rotationDeg]);

  const colorOption = product.options.find((o) => isColorOption(o.name));
  const garmentHex = resolveGarmentColor(
    colorOption ? state.product.options[colorOption.name] : undefined,
    settings.garmentColors,
  );
  useEffect(() => {
    if (viewerReady) viewerRef.current?.setGarmentColor(garmentHex ?? null);
  }, [garmentHex, viewerReady]);

  // Turn the garment to face the chosen surface.
  const surfaceId =
    layout?.resolved.preset.surfaceId ?? getPreset(adapter, state.placement.positionId)?.surfaceId;
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

  // Move focus to the step heading for keyboard / screen-reader users (not on first paint).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus({ preventScroll: true });
    setStepError(null);
    if (state.step === 3 && viewerRef.current) {
      setThumbnail(viewerRef.current.capture(420, facingSurface ?? 'front'));
    }
  }, [state.step]);

  useEffect(() => {
    if (!confirmReset) return;
    const t = setTimeout(() => setConfirmReset(false), 4000);
    return () => clearTimeout(t);
  }, [confirmReset]);

  /* ---------------- derived validation ---------------- */
  const rendered = layout
    ? {
        widthCm: layout.resolved.widthCm,
        heightCm: layout.resolved.heightCm,
        fitted: layout.resolved.fitted,
      }
    : null;
  const issues: ValidationIssue[] = useMemo(() => {
    if (state.activeDesign === 'image' && !state.image)
      return [{ field: 'image', message: 'Upload your logo or image, or switch to text.' }];
    const list = validateConfiguration(adapter, buildConfiguration(state, rendered));
    if (!settings.positionIds.includes(state.placement.positionId))
      list.push({ field: 'positionId', message: 'Choose one of the offered positions.' });
    return list;
  }, [state, rendered?.widthCm, rendered?.heightCm, adapter, settings.positionIds]);

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
  const threadHex = findThreadColor(state.text.threadColorId)?.hex;
  const lowContrast = !!(
    garmentContrastHex &&
    threadHex &&
    contrastRatio(garmentContrastHex, threadHex) < 1.6
  );

  /* ---------------- handlers ---------------- */
  const onViewer = useCallback((viewer: GarmentViewer | null, info: GarmentInfo | null) => {
    viewerRef.current = viewer;
    setGarmentInfo(info);
    setViewerReady(!!viewer);
  }, []);

  const onDesignDrag = useCallback(
    (dx: number, dy: number, phase: 'start' | 'move' | 'end') => {
      if (phase === 'start')
        dragStart.current = { x: state.placement.offsetXCm, y: state.placement.offsetYCm };
      else if (phase === 'move' && dragStart.current)
        dispatch({
          type: 'updatePlacement',
          patch: { offsetXCm: dragStart.current.x + dx, offsetYCm: dragStart.current.y + dy },
        });
      else dragStart.current = null;
    },
    [state.placement.offsetXCm, state.placement.offsetYCm],
  );

  const onUpload = async (file: File): Promise<string | null> => {
    const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const check = checkUpload(file, header, settings.maxUploadBytes);
    if (!check.ok || !check.mime) return check.message ?? 'Unsupported file.';
    const url = URL.createObjectURL(file);
    let img: HTMLImageElement;
    try {
      img = await decodeImage(url);
    } catch {
      URL.revokeObjectURL(url);
      return 'We couldn’t read this image. It may be damaged — try exporting it again.';
    }
    const { naturalWidth: w, naturalHeight: h } = img;
    if (w < LIMITS.minImagePx || h < LIMITS.minImagePx) {
      URL.revokeObjectURL(url);
      return `This image is only ${w}×${h}px. Use at least ${LIMITS.minImagePx}px on each side for a clean result.`;
    }
    if (w > LIMITS.maxImagePx || h > LIMITS.maxImagePx) {
      URL.revokeObjectURL(url);
      return `This image is ${w}×${h}px. Please keep it under ${LIMITS.maxImagePx}px on each side.`;
    }
    const previous = state.image?.previewUrl;
    if (previous && files.current.has(previous)) {
      URL.revokeObjectURL(previous);
      files.current.delete(previous);
    }
    files.current.set(url, file);
    const preset = getPreset(adapter, state.placement.positionId)!;
    dispatch({
      type: 'setImage',
      image: {
        type: 'image',
        storageRef: null,
        previewUrl: url,
        originalFilename: file.name.slice(0, 120),
        mimeType: check.mime,
        byteSize: file.size,
        widthPx: w,
        heightPx: h,
        scale: Math.min(1, preset.defaultImageWidthCm / preset.maxWidthCm),
      },
    });
    setToast({
      tone: 'success',
      message: `${file.name} is on the shirt. Adjust its size or placement.`,
    });
    return null;
  };

  const goTo = (step: StepIndex) => dispatch({ type: 'goTo', step });

  const next = () => {
    if (state.step === 1 && designIssues.length) {
      setStepError(designIssues[0]!.message);
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
    viewerRef.current?.setView('home');
    setToast({ tone: 'info', message: 'Customization reset to the default design.' });
  };

  const submit = async () => {
    if (issues.length || busy) {
      if (issues.length) setStepError(issues[0]!.message);
      return;
    }
    setToast(null);
    try {
      let image = state.activeDesign === 'image' ? state.image : null;
      if (image && !image.storageRef) {
        setBusy('Saving artwork…');
        const file = image.previewUrl ? files.current.get(image.previewUrl) : undefined;
        if (!file) throw new Error('Please upload your artwork again.');
        const stored = await persistence.uploadArtwork(file, {
          filename: image.originalFilename,
          mimeType: image.mimeType,
        });
        image = { ...image, storageRef: stored.storageRef };
        dispatch({ type: 'updateImage', patch: { storageRef: stored.storageRef } });
      }
      setBusy('Saving design…');
      const config = buildConfiguration({ ...state, image: image ?? state.image }, rendered);
      const { configRef } = await persistence.saveConfiguration(config);
      const properties = buildLineItemProperties(config, { configRef });
      const variant = product.variants.find((v) => v.id === state.product.variantId);
      const meta = {
        title: product.title,
        variantTitle: variant?.title ?? '',
        price: variant?.price ?? 0,
        image: viewerRef.current?.capture(240, facingSurface ?? 'front') ?? null,
      };
      setBusy(state.editing ? 'Updating cart…' : 'Adding to cart…');
      if (state.editing) {
        const line = await cart.updateCustomizedItem({
          lineKey: state.editing.lineKey,
          customizationId: state.editing.customizationId,
          variantId: state.product.variantId,
          quantity: state.product.quantity,
          properties,
          meta,
        });
        setToast({
          tone: 'success',
          message: 'Cart item updated with your new design.',
          showCart: true,
        });
        dispatch({ type: 'committed' });
        props.onUpdated?.(line);
      } else {
        const line = await cart.addItem({
          variantId: state.product.variantId,
          quantity: state.product.quantity,
          properties,
          sellingPlanId: settings.sellingPlanId,
          meta,
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
      }
    } catch (error) {
      console.error('[embroidery] submit failed', error);
      setToast({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Something went wrong. Please try again.',
      });
    } finally {
      setBusy(null);
    }
  };

  /* ---------------- render ---------------- */
  const allowed = availablePlacements(adapter, settings.positionIds).map((p) => p.id);
  const design = state.activeDesign === 'image' ? state.image : state.text;

  return (
    <div class="emb-root" data-mode={mode} data-testid="configurator">
      <header class="emb-header">
        <div>
          <p class="emb-eyebrow">Embroidery studio</p>
          <h2 class="emb-title">{settings.heading}</h2>
          <p class="emb-subtitle">{settings.subtitle}</p>
        </div>
        {mode === 'demo' ? (
          <span
            class="emb-badge"
            title="Runs without Shopify. Cart and storage are local to this browser."
          >
            Demo mode
          </span>
        ) : null}
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
            designSurface={layout?.raster ? facingSurface : null}
            dragHint={state.step === 2}
            modelLabel={product.title}
          />
        </div>

        <section class="emb-panel" aria-labelledby="emb-step-heading">
          <div class="emb-panel__head">
            <p class="emb-panel__count">
              Step {state.step + 1} of {STEPS.length}
            </p>
            <h3 class="emb-panel__title" id="emb-step-heading" tabIndex={-1} ref={headingRef}>
              {STEP_TITLES[state.step]}
            </h3>
            <p class="emb-panel__intro">{STEP_INTROS[state.step]}</p>
          </div>

          <div class="emb-panel__body">
            {state.step === 0 ? (
              <ProductStep
                product={product}
                selection={state.product}
                colorOverrides={settings.garmentColors}
                originalColorHex={garmentInfo?.originalColorHex ?? null}
                onOption={(name, value) => dispatch({ type: 'selectOption', name, value, product })}
              />
            ) : null}
            {state.step === 1 ? (
              <DesignStep
                activeDesign={state.activeDesign}
                text={state.text}
                image={state.image}
                fontIds={settings.fontIds}
                threadColorIds={settings.threadColorIds}
                maxUploadBytes={settings.maxUploadBytes}
                lowContrast={state.activeDesign === 'text' && lowContrast}
                fitted={!!layout?.resolved.fitted}
                onDesignType={(designType) => dispatch({ type: 'setDesignType', designType })}
                onText={(patch) => dispatch({ type: 'updateText', patch })}
                onImageScale={(scale) => dispatch({ type: 'updateImage', patch: { scale } })}
                onUpload={onUpload}
                onRemoveImage={() => {
                  const url = state.image?.previewUrl;
                  if (url && files.current.has(url)) {
                    URL.revokeObjectURL(url);
                    files.current.delete(url);
                  }
                  dispatch({ type: 'removeImage' });
                }}
              />
            ) : null}
            {state.step === 2 ? (
              <PlacementStep
                adapter={adapter}
                placement={state.placement}
                allowed={allowed}
                resolved={layout?.resolved ?? null}
                onPosition={(positionId) => dispatch({ type: 'setPosition', positionId })}
                onPatch={(patch) => dispatch({ type: 'updatePlacement', patch })}
              />
            ) : null}
            {state.step === 3 ? (
              <ReviewStep
                product={product}
                selection={state.product}
                design={design}
                resolved={layout?.resolved ?? null}
                rotationDeg={state.placement.rotationDeg}
                thumbnail={thumbnail}
                issues={issues}
                onQuantity={(quantity) => dispatch({ type: 'setQuantity', quantity })}
                onEdit={goTo}
              />
            ) : null}
          </div>

          {stepError ? (
            <p class="emb-field__error emb-step-error" role="alert" data-testid="step-error">
              {stepError}
            </p>
          ) : null}

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
                <span>{busy ?? (state.editing ? 'Update Cart Item' : 'Add to Cart')}</span>
              </button>
            )}
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
