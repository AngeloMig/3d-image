/**
 * Shopify storefront entry (lazy-loaded by embroidery-loader.js). Uses the exact same
 * <Configurator> as the standalone demo, wired to the real Ajax cart and the app proxy.
 */
import { render, type ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  LIMITS,
  feeCodeForVariantTitle,
  parseBulkTiers,
  getModelAdapter,
  type PlacementId,
  type PricingSettings,
} from '@embroidery/shared';
import { sharedRefFromUrl } from '../state/savedDesigns';
import { DemoCartAdapter, ShopifyCartAdapter, normalizeRoot } from '@embroidery/shopify-cart';
import styles from '../styles.css?inline';
import {
  Configurator,
  type ConfiguratorProps,
  type ConfiguratorSettings,
  type EditRequest,
} from '../components/Configurator';
import { IconClose } from '../components/icons';
import { AppProxyPersistence } from '../persistence/appProxyPersistence';
import { DemoPersistence } from '../persistence/demoPersistence';
import { FallbackPersistence } from '../persistence/fallbackPersistence';
import { fromShopifyProduct, type ShopifyProductJson } from './product';

export interface BlockData {
  product: ShopifyProductJson | null;
  selectedVariantId?: string | number | null;
  currency: string;
  locale: string;
  root: string;
  modelUrl: string;
  modelId?: string;
  proxyPath: string;
  /** The shop's primary URL (https://shop.com), for absolute links in order emails. */
  shopUrl?: string;
  display?: 'inline' | 'button';
  buttonLabel?: string;
  syncThemeVariant?: boolean;
  /** Variants of the block's "Embroidery fee product" (prices come from Shopify, never the browser). */
  feeVariants?: { title: string; price: number; id: string | number; available?: boolean }[] | null;
  /** Preview-only prices ("Logo: 8" per line, store currency) used when no fee product is set. */
  samplePrices?: string | null;
  /** "10: 10" per line → order 10+ items, save 10% (charged by Shopify automatic discounts). */
  bulkTiers?: string | null;
  settings?: {
    theme?: string;
    themeSwitcher?: boolean;
    maxDesigns?: number;
    teamOrders?: boolean;
    sharing?: boolean;
    templates?: boolean;
    heading?: string;
    subtitle?: string;
    defaultText?: string;
    defaultPositionId?: string;
    positionIds?: string[];
    threadColorIds?: string[];
    fontIds?: string[];
    maxUploadMb?: number;
    garmentColors?: string;
    afterAdd?: 'stay' | 'cart';
  };
}

/** "White: #ffffff" lines → { White: '#ffffff' }; "Royal: original" keeps the authored texture. */
export function parseColorMap(text: string | undefined): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const line of (text ?? '').split(/\n|,(?=[^,]*:)/)) {
    const m = line.match(/^\s*([^:]+?)\s*:\s*(#[0-9a-f]{3,8}|original)\s*$/i);
    if (m) out[m[1]!] = m[2]!.toLowerCase() === 'original' ? null : m[2]!;
  }
  return out;
}

function toSettings(data: BlockData): Partial<ConfiguratorSettings> {
  const s = data.settings ?? {};
  const clean = <T,>(list: T[] | undefined) => (list && list.length ? list : undefined);
  const settings: Partial<ConfiguratorSettings> = {
    garmentColors: parseColorMap(s.garmentColors),
    cartUrl: `${normalizeRoot(data.root)}cart`,
    afterAdd: s.afterAdd === 'cart' ? 'cart' : 'stay',
  };
  if (s.theme === 'clean' || s.theme === 'sport' || s.theme === 'atelier') settings.theme = s.theme;
  if (typeof s.themeSwitcher === 'boolean') settings.themeSwitcher = s.themeSwitcher;
  if (s.heading) settings.heading = s.heading;
  if (s.subtitle) settings.subtitle = s.subtitle;
  if (s.defaultText)
    settings.defaultText = s.defaultText.slice(0, LIMITS.maxCharsPerLine * LIMITS.maxLines);
  const positions = clean(s.positionIds) as PlacementId[] | undefined;
  if (positions) settings.positionIds = positions;
  if (s.defaultPositionId && (!positions || positions.includes(s.defaultPositionId as PlacementId)))
    settings.defaultPositionId = s.defaultPositionId as PlacementId;
  else if (positions?.[0]) settings.defaultPositionId = positions[0];
  const threads = clean(s.threadColorIds);
  if (threads) {
    settings.threadColorIds = threads;
    settings.defaultThreadColorId = threads[0]!;
  }
  const fonts = clean(s.fontIds);
  if (fonts) settings.fontIds = fonts;
  if (s.maxUploadMb)
    settings.maxUploadBytes = Math.min(20, Math.max(1, s.maxUploadMb)) * 1024 * 1024;
  if (typeof s.maxDesigns === 'number')
    settings.maxDesigns = Math.max(1, Math.min(LIMITS.maxDesigns, s.maxDesigns));
  if (typeof s.teamOrders === 'boolean') settings.teamOrders = s.teamOrders;
  if (typeof s.sharing === 'boolean') settings.sharing = s.sharing;
  if (typeof s.templates === 'boolean') settings.templates = s.templates;
  return settings;
}

/** Map fee-product variants to fee codes by title ("Logo", "Large size", "3D Puff"…). */
export function toPricing(
  variants: BlockData['feeVariants'],
  samplePrices?: string | null,
  bulkTiers?: string | null,
): PricingSettings {
  const fees: PricingSettings['fees'] = {};
  const tiers = parseBulkTiers(bulkTiers);
  if (!variants?.length && samplePrices) {
    // Display-only: variantId null → shown with a "not charged" note, never added to the cart.
    for (const line of samplePrices.split(/\n|,/)) {
      const m = line.match(/^\s*(.+?)\s*:\s*([0-9]+(?:[.,][0-9]{1,2})?)\s*$/);
      const code = m ? feeCodeForVariantTitle(m[1]!) : null;
      if (code)
        fees[code] = {
          price: Math.round(parseFloat(m![2]!.replace(',', '.')) * 100),
          variantId: null,
        };
    }
    return { fees, bulkTiers: tiers };
  }
  for (const v of variants ?? []) {
    const code = feeCodeForVariantTitle(v.title);
    if (code && v.available !== false)
      fees[code] = { price: Math.max(0, Number(v.price) || 0), variantId: String(v.id) };
  }
  return { fees, bulkTiers: tiers };
}

/** Build configurator props for a block; without a product it runs as a labelled demo. */
export async function buildProps(data: BlockData): Promise<ConfiguratorProps> {
  const adapter = getModelAdapter(data.modelId);
  const settings = toSettings(data);
  const sharedDesignRef = sharedRefFromUrl();
  if (!data.product) {
    const { DEMO_PRODUCT, DEMO_PRICING } = await import('./demoProduct');
    return {
      mode: 'demo',
      adapter,
      modelUrl: data.modelUrl,
      product: DEMO_PRODUCT,
      cart: new DemoCartAdapter(),
      persistence: new DemoPersistence(),
      pricing: DEMO_PRICING,
      sharedDesignRef,
      settings: { ...settings, cartUrl: null },
    };
  }
  return {
    mode: 'shopify',
    adapter,
    modelUrl: data.modelUrl,
    product: fromShopifyProduct(data.product, data.currency, data.locale),
    initialVariantId: data.selectedVariantId ? String(data.selectedVariantId) : null,
    cart: new ShopifyCartAdapter({ root: data.root }),
    persistence: new FallbackPersistence(
      new AppProxyPersistence(data.proxyPath, undefined, data.shopUrl || location.origin),
    ),
    pricing: toPricing(data.feeVariants, data.samplePrices, data.bulkTiers),
    sharedDesignRef,
    settings,
  };
}

/** Tracks the theme's own variant picker without touching it (URL ?variant= and form id input). */
function useThemeVariant(enabled: boolean, scope: HTMLElement): string | null {
  const [variantId, setVariantId] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const read = () => {
      const fromUrl = new URLSearchParams(location.search).get('variant');
      const section = scope.closest('section, .shopify-section') ?? document;
      const input = section.querySelector<HTMLInputElement>(
        'form[action*="/cart/add"] [name="id"]',
      );
      const next = fromUrl ?? input?.value ?? null;
      if (next) setVariantId((prev) => (prev === next ? prev : next));
    };
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement | null;
      if (
        t?.name === 'id' ||
        t?.closest?.('variant-selects, variant-radios, [data-variant-picker]')
      )
        setTimeout(read, 0);
    };
    document.addEventListener('change', onChange, true);
    window.addEventListener('popstate', read);
    // Many themes update the URL with history.replaceState — poll cheaply instead of patching it.
    const timer = window.setInterval(read, 800);
    return () => {
      document.removeEventListener('change', onChange, true);
      window.removeEventListener('popstate', read);
      clearInterval(timer);
    };
  }, [enabled, scope]);
  return variantId;
}

export function Dialog(p: { label: string; onClose: () => void; children: ComponentChildren }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && p.onClose();
    document.addEventListener('keydown', onKey);
    const overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.documentElement.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);
  return (
    <div class="emb-dialog" role="presentation">
      <div
        class="emb-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-label={p.label}
        tabIndex={-1}
        ref={panel}
      >
        <button
          type="button"
          class="emb-dialog__close"
          onClick={p.onClose}
          aria-label="Close customizer"
        >
          <IconClose />
        </button>
        {p.children}
      </div>
    </div>
  );
}

function BlockRoot(p: { props: ConfiguratorProps; data: BlockData; scope: HTMLElement }) {
  const [open, setOpen] = useState(false);
  const themeVariant = useThemeVariant(
    p.props.mode === 'shopify' && p.data.syncThemeVariant !== false,
    p.scope,
  );
  const configurator = <Configurator {...p.props} externalVariantId={themeVariant} />;
  if (p.data.display !== 'button') return configurator;
  return (
    <>
      <button
        type="button"
        class="emb-btn emb-btn--primary emb-launch"
        onClick={() => setOpen(true)}
        data-testid="launch"
      >
        {p.data.buttonLabel || 'Personalize with embroidery'}
      </button>
      {open ? (
        <Dialog label="Customize your embroidery" onClose={() => setOpen(false)}>
          {configurator}
        </Dialog>
      ) : null}
    </>
  );
}

function attachShadow(host: HTMLElement): HTMLDivElement {
  const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
  root.innerHTML = '';
  const style = document.createElement('style');
  style.textContent = styles;
  const container = document.createElement('div');
  container.className = 'emb-host';
  root.append(style, container);
  return container;
}

/** Called by the loader for every app block / section on the page. */
export async function mountFromElement(el: HTMLElement): Promise<() => void> {
  const script = el.querySelector<HTMLScriptElement>(
    'script[type="application/json"][data-embroidery-config]',
  );
  if (!script?.textContent) throw new Error('Embroidery block is missing its configuration JSON.');
  const data = JSON.parse(script.textContent) as BlockData;
  const props = await buildProps(data);
  const container = attachShadow(el);
  render(<BlockRoot props={props} data={data} scope={el} />, container);
  el.setAttribute('data-embroidery-mounted', 'true');
  return () => render(null, container);
}

export interface CartEditRequest {
  lineKey: string;
  customizationId: string;
  configRef: string;
  quantity: number;
  variantId: string;
  productHandle: string;
  root: string;
  proxyPath: string;
  modelUrl: string;
  currency: string;
  locale: string;
  feeVariants?: BlockData['feeVariants'];
  reloadAfterSave?: boolean;
}

/** Opens the same configurator in a dialog, pre-filled from the saved configuration. */
export async function openCartEditor(req: CartEditRequest): Promise<void> {
  const root = normalizeRoot(req.root);
  const persistence = new FallbackPersistence(new AppProxyPersistence(req.proxyPath));
  const [config, productJson] = await Promise.all([
    persistence.loadConfiguration(req.configRef),
    fetch(`${root}products/${encodeURIComponent(req.productHandle)}.js`, {
      credentials: 'same-origin',
    }).then((r) => {
      if (!r.ok) throw new Error('Product unavailable');
      return r.json() as Promise<ShopifyProductJson>;
    }),
  ]);
  config.product = { ...config.product, quantity: req.quantity, variantId: req.variantId };
  const edit: EditRequest = { config, lineKey: req.lineKey, customizationId: req.customizationId };

  const host = document.createElement('embroidery-cart-editor');
  document.body.appendChild(host);
  const container = attachShadow(host);
  const close = () => {
    render(null, container);
    host.remove();
  };
  const props: ConfiguratorProps = {
    mode: 'shopify',
    adapter: getModelAdapter(config.product.modelId),
    modelUrl: req.modelUrl || config.product.modelUrl,
    product: fromShopifyProduct(productJson, req.currency, req.locale),
    cart: new ShopifyCartAdapter({ root }),
    persistence,
    pricing: toPricing(req.feeVariants),
    settings: { cartUrl: `${root}cart`, teamOrders: false },
    edit,
    onUpdated: () => {
      close();
      // Cart markup differs per theme; a reload is the theme-neutral way to show fresh lines.
      if (req.reloadAfterSave !== false) location.reload();
    },
    onCancelEdit: close,
  };
  render(
    <Dialog label="Edit embroidery" onClose={close}>
      <Configurator {...props} />
    </Dialog>,
    container,
  );
}
