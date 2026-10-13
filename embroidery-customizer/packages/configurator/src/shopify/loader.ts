/**
 * embroidery-loader.js — tiny, dependency-free bootstrapper included by the Liquid block/embed.
 * Three.js + the configurator (~200 KB gz) are only downloaded when a customizer comes into
 * view (or a cart "Edit embroidery" button is clicked).
 */

type EntryModule = typeof import('./entry');

const loaded = new Map<string, Promise<EntryModule>>();
const loadModule = (src: string): Promise<EntryModule> => {
  let p = loaded.get(src);
  if (!p) {
    p = import(/* @vite-ignore */ src) as Promise<EntryModule>;
    loaded.set(src, p);
  }
  return p;
};

/* ------------------------------------------------------------------ product blocks */

function mountBlock(el: HTMLElement): void {
  const src = el.dataset.moduleSrc;
  if (el.dataset.embroideryState || !src) return;
  el.dataset.embroideryState = 'loading';
  loadModule(src)
    .then((m) => m.mountFromElement(el))
    .then(() => (el.dataset.embroideryState = 'ready'))
    .catch((error: unknown) => {
      console.error('[embroidery] customizer failed to load', error);
      el.dataset.embroideryState = 'error';
      const msg = el.querySelector<HTMLElement>('[data-embroidery-fallback]');
      if (msg) msg.hidden = false;
    });
}

function initBlocks(): void {
  const blocks = document.querySelectorAll<HTMLElement>(
    '[data-embroidery-root]:not([data-embroidery-state])',
  );
  if (!blocks.length) return;
  if (!('IntersectionObserver' in window)) return blocks.forEach(mountBlock);
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        mountBlock(e.target as HTMLElement);
      }),
    { rootMargin: '600px 0px' },
  );
  blocks.forEach((b) => io.observe(b));
}

/* ------------------------------------------------------------------ cart edit hook */

interface CartItem {
  key: string;
  quantity: number;
  variant_id: number;
  handle: string;
  properties: Record<string, string> | null;
}

interface CartEditConfig {
  moduleSrc: string;
  root: string;
  proxyPath: string;
  modelUrl: string;
  currency: string;
  locale: string;
  label: string;
}

const CUSTOMIZATION_KEY = 'Customization ID';
const CONFIG_REF_KEY = '_Embroidery Config Ref';
const ROW_SELECTORS =
  'tr, li, [role="row"], .cart-item, .cart__item, .cart-drawer-item, [data-cart-item], .line-item';

function editButton(cfg: CartEditConfig, item: CartItem): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'embroidery-edit-button';
  button.textContent = cfg.label;
  button.dataset.embroideryEditKey = item.key;
  button.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    button.disabled = true;
    const original = button.textContent;
    button.textContent = 'Loading…';
    try {
      const m = await loadModule(cfg.moduleSrc);
      await m.openCartEditor({
        lineKey: item.key,
        customizationId: item.properties![CUSTOMIZATION_KEY]!,
        configRef: item.properties![CONFIG_REF_KEY]!,
        quantity: item.quantity,
        variantId: String(item.variant_id),
        productHandle: item.handle,
        root: cfg.root,
        proxyPath: cfg.proxyPath,
        modelUrl: cfg.modelUrl,
        currency: cfg.currency,
        locale: cfg.locale,
      });
    } catch (error) {
      console.error('[embroidery] could not open editor', error);
      alert(
        'Sorry — this design could not be opened for editing. Please remove the item and customize it again.',
      );
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });
  return button;
}

/**
 * Theme-neutral placement: themes render visible line properties, so we locate the element
 * showing the line's Customization ID and insert the button next to it. Themes can instead add
 * `<span data-embroidery-edit-slot="{{ item.key }}"></span>` anywhere in the line markup.
 */
async function decorateCart(cfg: CartEditConfig): Promise<void> {
  let cart: { items: CartItem[] };
  try {
    const res = await fetch(`${cfg.root}cart.js`, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    cart = (await res.json()) as { items: CartItem[] };
  } catch {
    return;
  }
  for (const item of cart.items) {
    const id = item.properties?.[CUSTOMIZATION_KEY];
    if (!id || !item.properties?.[CONFIG_REF_KEY]) continue;
    const slots = document.querySelectorAll<HTMLElement>(
      `[data-embroidery-edit-slot="${CSS.escape(item.key)}"]`,
    );
    if (slots.length) {
      slots.forEach((slot) => {
        if (!slot.querySelector('.embroidery-edit-button')) slot.appendChild(editButton(cfg, item));
      });
      continue;
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const hits: Element[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (
        n.nodeValue?.includes(id) &&
        n.parentElement &&
        !n.parentElement.closest('script, template, embroidery-cart-editor')
      )
        hits.push(n.parentElement);
    }
    for (const hit of hits) {
      const row = hit.closest(ROW_SELECTORS) ?? hit.parentElement;
      if (
        !row ||
        row.querySelector(
          `.embroidery-edit-button[data-embroidery-edit-key="${CSS.escape(item.key)}"]`,
        )
      )
        continue;
      // Insert after the property's own wrapper (e.g. <div class="product-option">).
      const anchor = hit.closest('.product-option, dd, li, p, div') ?? hit;
      anchor.insertAdjacentElement('afterend', editButton(cfg, item));
    }
  }
}

function initCartEdit(): void {
  const el = document.querySelector<HTMLElement>('[data-embroidery-cart-edit]');
  if (!el || !el.dataset.moduleSrc) return;
  const cfg: CartEditConfig = {
    moduleSrc: el.dataset.moduleSrc,
    root: (el.dataset.root || '/').replace(/\/?$/, '/'),
    proxyPath: el.dataset.proxyPath || '/apps/embroidery',
    modelUrl: el.dataset.modelUrl || '',
    currency: el.dataset.currency || 'USD',
    locale: el.dataset.locale || 'en',
    label: el.dataset.label || 'Edit embroidery',
  };
  let timer = 0;
  const schedule = () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => void decorateCart(cfg), 250);
  };
  schedule();
  // Cart drawers re-render their markup after quantity changes etc.
  new MutationObserver((records) => {
    if (
      records.some((r) =>
        [...r.addedNodes].some(
          (n) => n instanceof HTMLElement && !n.classList.contains('embroidery-edit-button'),
        ),
      )
    )
      schedule();
  }).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('embroidery:cart:changed', schedule);
}

function init(): void {
  initBlocks();
  initCartEdit();
  // Theme editor: re-init when sections/blocks are added or re-rendered.
  document.addEventListener('shopify:section:load', initBlocks);
  document.addEventListener('shopify:block:select', initBlocks);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

// Side-effect module (no runtime exports); keeps TypeScript treating it as a module.
export {};
