import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  DemoPersistence,
  mountConfigurator,
  type ConfiguratorProps,
  type EditRequest,
  type MountHandle,
} from '@embroidery/configurator';
import { TSHIRT_V1, formatMoney } from '@embroidery/shared';
import {
  DemoCartAdapter,
  PROPERTY_KEYS,
  readCustomization,
  visibleProperties,
  type CartLine,
  type CartSnapshot,
} from '@embroidery/shopify-cart';
import { DEMO_PRODUCT } from '@embroidery/configurator/demo-product';

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

  const props: ConfiguratorProps = {
    mode: 'demo',
    adapter: TSHIRT_V1,
    modelUrl,
    product: DEMO_PRODUCT,
    cart,
    persistence,
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
            ✳︎
          </span>
          <span>Demo Storefront</span>
          <span class="demo-bar__tag">Local demo · no Shopify connection</span>
        </div>
        <button
          type="button"
          class="demo-bar__cart"
          onClick={() => setDrawerOpen(true)}
          aria-haspopup="dialog"
          data-testid="open-cart"
        >
          Demo cart{' '}
          <span class="demo-bar__count" data-testid="cart-count">
            {snapshot.itemCount}
          </span>
        </button>
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
            {p.snapshot.lines.map((line) => (
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
                  <div class="demo-line__actions">
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
