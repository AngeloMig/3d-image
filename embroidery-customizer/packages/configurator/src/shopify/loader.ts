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
  feeVariants: unknown;
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
        feeVariants: cfg.feeVariants as never,
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
const FEE_FOR = '_Embroidery Fee For';
const FEE_PER_ITEM = '_Embroidery Fee Per Item';

/**
 * Embroidery fee lines must follow their item: remove fees whose item was removed and match
 * fee quantity to item quantity after customers change it in the theme's cart. Returns true if
 * the cart was changed (then the cart page reloads so theme markup and totals refresh).
 */
async function syncFees(cfg: CartEditConfig, items: CartItem[]): Promise<boolean> {
  const qty = new Map<string, number>();
  for (const i of items) {
    const id = i.properties?.[CUSTOMIZATION_KEY];
    if (id && !i.properties?.[FEE_FOR]) qty.set(id, (qty.get(id) ?? 0) + i.quantity);
  }
  const updates: Record<string, number> = {};
  const additions: Record<string, unknown>[] = [];
  // Restore fee lines the customer deleted (each item lists what it owes in "_Embroidery Fees").
  for (const i of items) {
    const id = i.properties?.[CUSTOMIZATION_KEY];
    const plan = i.properties?.['_Embroidery Fees'];
    if (!id || i.properties?.[FEE_FOR] || !plan) continue;
    for (const part of plan.split(';')) {
      const [code, per, variantId] = part.split(':');
      const present = items.some(
        (f) => f.properties?.[FEE_FOR] === id && f.properties?.['_Embroidery Fee Kind'] === code,
      );
      if (!present && code && Number(per) > 0 && variantId)
        additions.push({
          id: Number(variantId),
          quantity: Number(per) * (qty.get(id) ?? i.quantity),
          properties: {
            For: `${i.properties?.['Embroidery Text'] ?? 'Custom item'} · ${id.slice(0, 8)}`,
            [FEE_FOR]: id,
            '_Embroidery Fee Kind': code,
            [FEE_PER_ITEM]: per,
          },
        });
    }
  }
  for (const i of items) {
    const forId = i.properties?.[FEE_FOR];
    const per = Number(i.properties?.[FEE_PER_ITEM]);
    if (!forId || !(per > 0)) continue;
    const expected = per * (qty.get(forId) ?? 0);
    if (expected !== i.quantity) updates[i.key] = expected;
  }
  if (!Object.keys(updates).length && !additions.length) return false;
  const post = (path: string, body: unknown) =>
    fetch(`${cfg.root}${path}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
  try {
    if (Object.keys(updates).length) await post('cart/update.js', { updates });
    if (additions.length) await post('cart/add.js', { items: additions });
  } catch {
    return false;
  }
  document.dispatchEvent(new CustomEvent('embroidery:cart:changed'));
  if (/\/cart\/?$/.test(location.pathname)) location.reload();
  return true;
}

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
  if (await syncFees(cfg, cart.items)) return; // cart changed — the page reloads / re-renders

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
    feeVariants: (() => {
      try {
        return el.dataset.feeVariants ? (JSON.parse(el.dataset.feeVariants) as unknown) : null;
      } catch {
        return null;
      }
    })(),
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
