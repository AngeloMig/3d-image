import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  DemoPersistence,
  mountConfigurator,
  type ConfiguratorProps,
  type EditRequest,
  type MountHandle,
} from '@embroidery/configurator';
import { TSHIRT_V1, formatMoney } from '@embroidery/shared';
import { sharedRefFromUrl } from '@embroidery/configurator';
import {
  DemoCartAdapter,
  PROPERTY_KEYS,
  readCustomization,
  readFee,
  visibleProperties,
  type CartLine,
  type CartSnapshot,
} from '@embroidery/shopify-cart';
import { DEMO_PRICING, DEMO_PRODUCT } from '@embroidery/configurator/demo-product';

/** Mounts the real configurator through the same shadow-DOM entry point Shopify uses. */
function ShadowConfigurator(props: ConfiguratorProps) {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<MountHandle | null>(null);
  useEffect(() => {
    if (!host.current) return;
    handle.current = mountConfigurator(host.current, props);
    return () => {
      handle.current?.unmount();
      handle.current = null;
    };
  }, []);
  useEffect(() => {
    handle.current?.update(props);
  });
  return <div ref={host} class="demo-configurator" />;
}

export function DemoApp() {
  const cart = useMemo(() => new DemoCartAdapter(), []);
  const persistence = useMemo(() => new DemoPersistence(), []);
  const [snapshot, setSnapshot] = useState<CartSnapshot>({
    lines: [],
    itemCount: 0,
    currency: 'USD',
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [edit, setEdit] = useState<EditRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sharedDesignRef] = useState(() => sharedRefFromUrl());
  const modelUrl = new URL(
    `${import.meta.env.BASE_URL}models/${TSHIRT_V1.modelFile}`,
    location.href,
  ).href;

  useEffect(() => {
    void cart.getCart().then(setSnapshot);
    return cart.subscribe(setSnapshot);
  }, [cart]);

  const startEdit = async (line: CartLine) => {
    setError(null);
    const { configRef, customizationId } = readCustomization(line.properties);
    if (!configRef || !customizationId)
      return setError('This line has no saved embroidery reference.');
    try {
      const config = await persistence.loadConfiguration(configRef);
      config.product = { ...config.product, quantity: line.quantity, variantId: line.variantId };
      setEdit({ config, lineKey: line.key, customizationId });
      setDrawerOpen(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this design.');
    }
  };

  // Badge counts customized items, not the fee lines that ride along with them.
  const itemCount = snapshot.lines
    .filter((l) => !readFee(l.properties))
    .reduce((n, l) => n + l.quantity, 0);

  const [theme, setTheme] = useState<'clean' | 'sport' | 'atelier'>(() => {
    try {
      const saved = localStorage.getItem('embroidery-demo-theme');
      return saved === 'sport' || saved === 'atelier' ? saved : 'clean';
    } catch {
      return 'clean';
    }
  });
  useEffect(() => {
    document.documentElement.dataset.demoTheme = theme;
    try {
      localStorage.setItem('embroidery-demo-theme', theme);
    } catch {
      /* private mode */
    }
  }, [theme]);
  const settings = useMemo(() => ({ theme }), [theme]);

  const props: ConfiguratorProps = {
    mode: 'demo',
    settings,
    adapter: TSHIRT_V1,
    modelUrl,
    product: DEMO_PRODUCT,
    cart,
    persistence,
    pricing: DEMO_PRICING,
    sharedDesignRef,
    edit,
    onUpdated: () => {
      setEdit(null);
      setDrawerOpen(true);
    },
    onCancelEdit: () => setEdit(null),
    onViewCart: () => setDrawerOpen(true),
  };

  return (
    <>
      <header class="demo-bar">
        <div class="demo-bar__brand">
          <span class="demo-bar__mark" aria-hidden="true">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M6 4v16M12 4v16M18 4v16M3 8h18M3 16h18" />
            </svg>
          </span>
          <span>
            Thread Studio<span class="demo-bar__brand-dot">.</span>
          </span>
          <span class="demo-bar__tag">Embroidery, made personal</span>
        </div>
        <div class="demo-bar__right">
          <div class="demo-theme" role="radiogroup" aria-label="Design style">
            {(['clean', 'sport', 'atelier'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={theme === t}
                class={theme === t ? 'is-on' : ''}
                onClick={() => setTheme(t)}
                data-testid={`theme-${t}`}
              >
                {t === 'clean' ? 'Clean' : t === 'sport' ? 'Sport' : 'Atelier'}
              </button>
            ))}
          </div>
          <button
            type="button"
            class="demo-bar__cart"
            onClick={() => setDrawerOpen(true)}
            aria-haspopup="dialog"
            data-testid="open-cart"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
              aria-hidden="true"
            >
              <path d="M6 8h12l-1 12H7L6 8Z" />
              <path d="M9 8V6a3 3 0 0 1 6 0v2" />
            </svg>
            Cart{' '}
            <span class="demo-bar__count" data-testid="cart-count">
              {itemCount}
            </span>
          </button>
        </div>
      </header>

      <main class="demo-main">
        <ShadowConfigurator {...props} />
      </main>

      {drawerOpen ? (
        <CartDrawer
          snapshot={snapshot}
          error={error}
          onClose={() => setDrawerOpen(false)}
          onEdit={(l) => void startEdit(l)}
          onRemove={(l) => void cart.removeLine(l.key)}
          onQuantity={(l, q) => void cart.setQuantity(l.key, q)}
        />
      ) : null}
    </>
  );
}

function CartDrawer(p: {
  snapshot: CartSnapshot;
  error: string | null;
  onClose: () => void;
  onEdit: (line: CartLine) => void;
  onRemove: (line: CartLine) => void;
  onQuantity: (line: CartLine, quantity: number) => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && p.onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previous?.focus();
    };
  }, []);
  const subtotal = p.snapshot.lines.reduce((s, l) => s + (l.price ?? 0) * l.quantity, 0);
  return (
    <div
      class="demo-drawer"
      role="presentation"
      onClick={(e) => e.target === e.currentTarget && p.onClose()}
    >
      <div
        class="demo-drawer__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-title"
        tabIndex={-1}
        ref={panel}
        data-testid="cart-drawer"
      >
        <div class="demo-drawer__head">
          <h2 id="cart-title">Demo cart</h2>
          <button type="button" class="demo-icon-btn" onClick={p.onClose} aria-label="Close cart">
            ×
          </button>
        </div>
        <p class="demo-drawer__note">
          Demo only — stored in this browser. In Shopify the same flow uses <code>cart/add.js</code>{' '}
          and <code>cart/change.js</code>.
        </p>
        {p.error ? (
          <p class="demo-error" role="alert">
            {p.error}
          </p>
        ) : null}
        {p.snapshot.lines.length === 0 ? (
          <p class="demo-empty">Your demo cart is empty. Customize a shirt and add it.</p>
        ) : (
          <ul class="demo-lines">
            {p.snapshot.lines
              .filter((l) => !readFee(l.properties))
              .map((line) => (
                <li class="demo-line" key={line.key} data-testid="cart-line">
                  {line.image ? (
                    <img src={line.image} alt="" class="demo-line__img" />
                  ) : (
                    <span class="demo-line__img" />
                  )}
                  <div class="demo-line__body">
                    <div class="demo-line__top">
                      <strong>{line.title}</strong>
                      <span>
                        {line.price !== null
                          ? formatMoney(line.price * line.quantity, 'USD', 'en-US')
                          : ''}
                      </span>
                    </div>
                    <p class="demo-line__variant">
                      {line.variantTitle} · Qty {line.quantity}
                    </p>
                    <dl class="demo-props">
                      {visibleProperties(line.properties)
                        .filter(([k]) => k !== PROPERTY_KEYS.customizationId)
                        .map(([k, v]) => (
                          <div key={k}>
                            <dt>{k}</dt>
                            <dd>{v}</dd>
                          </div>
                        ))}
                    </dl>
                    <details class="demo-hidden-props">
                      <summary>Fulfilment references</summary>
                      <dl class="demo-props">
                        {Object.entries(line.properties)
                          .filter(([k]) => k.startsWith('_') || k === PROPERTY_KEYS.customizationId)
                          .map(([k, v]) => (
                            <div key={k}>
                              <dt>{k}</dt>
                              <dd>
                                <code>{v}</code>
                              </dd>
                            </div>
                          ))}
                      </dl>
                    </details>
                    {p.snapshot.lines
                      .filter(
                        (f) =>
                          readFee(f.properties)?.customizationId ===
                          readCustomization(line.properties).customizationId,
                      )
                      .map((fee) => (
                        <p class="demo-fee" key={fee.key} data-testid="fee-line">
                          <span>
                            + {fee.title} × {fee.quantity}
                          </span>
                          <span>
                            {formatMoney((fee.price ?? 0) * fee.quantity, 'USD', 'en-US')}
                          </span>
                        </p>
                      ))}
                    <div class="demo-line__actions">
                      <span class="demo-qty" role="group" aria-label="Quantity">
                        <button
                          type="button"
                          aria-label="Decrease quantity"
                          onClick={() => p.onQuantity(line, line.quantity - 1)}
                        >
                          −
                        </button>
                        <span>{line.quantity}</span>
                        <button
                          type="button"
                          aria-label="Increase quantity"
                          onClick={() => p.onQuantity(line, line.quantity + 1)}
                        >
                          +
                        </button>
                      </span>
                      <button
                        type="button"
                        class="demo-btn"
                        onClick={() => p.onEdit(line)}
                        data-testid="edit-line"
                      >
                        Edit Embroidery
                      </button>
                      <button
                        type="button"
                        class="demo-btn demo-btn--ghost"
                        onClick={() => p.onRemove(line)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </li>
              ))}
          </ul>
        )}
        {p.snapshot.lines.length ? (
          <div class="demo-drawer__foot">
            <span>Subtotal</span>
            <strong>{formatMoney(subtotal, 'USD', 'en-US')}</strong>
          </div>
        ) : null}
      </div>
    </div>
  );
}
