/**
 * Simulated Online Store 2.0 product + cart page. The block markup mirrors what the Liquid app
 * block renders, and the cart rows mirror Dawn's markup (visible line properties).
 */
import entryUrl from './entry?url';

const root = document.querySelector<HTMLElement>('[data-embroidery-root]')!;
root.dataset.moduleSrc = new URL(entryUrl, location.href).href;
document.querySelector<HTMLElement>('[data-embroidery-cart-edit]')!.dataset.moduleSrc =
  root.dataset.moduleSrc;
// Load the real loader only after the Liquid-equivalent data attributes are in place.
void import('@embroidery/configurator/shopify-loader');

interface Item {
  key: string;
  quantity: number;
  variant_title: string;
  product_title: string;
  price: number;
  properties: Record<string, string> | null;
}

const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;
const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

async function renderCart() {
  const cart = (await (await fetch('/cart.js')).json()) as { items: Item[]; item_count: number };
  document.querySelector('[data-cart-count]')!.textContent = String(cart.item_count);
  const body = document.querySelector('[data-cart-items]')!;
  body.innerHTML = cart.items.length
    ? cart.items
        .map(
          (i, n) => `<tr class="cart-item" data-index="${n + 1}">
        <td><strong>${esc(i.product_title)}</strong><div>${esc(i.variant_title)}</div>
          <dl>${Object.entries(i.properties ?? {})
            .filter(([k, v]) => !k.startsWith('_') && v)
            .map(
              ([k, v]) =>
                `<div class="product-option"><dt>${esc(k)}: </dt><dd>${esc(v)}</dd></div>`,
            )
            .join('')}</dl></td>
        <td>${i.quantity}</td><td>${fmt(i.price * i.quantity)}</td></tr>`,
        )
        .join('')
    : '<tr><td colspan="3">Your cart is empty</td></tr>';
}

document.addEventListener('embroidery:cart:changed', () => void renderCart());
document.querySelector('[name="id"]')!.addEventListener('change', (e) => {
  const id = (e.target as HTMLSelectElement).value;
  history.replaceState(null, '', `?variant=${id}`);
});
void renderCart();
