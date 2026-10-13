import { formatMoney, type PriceBreakdown } from '@embroidery/shared';

/** Item price + embroidery fees. Fees are charged by Shopify through fee-product variants. */
export function PriceSummary(p: {
  breakdown: PriceBreakdown;
  currency: string;
  locale: string;
  compact?: boolean;
}) {
  const m = (n: number) => formatMoney(n, p.currency, p.locale);
  const b = p.breakdown;
  return (
    <dl class={`emb-price${p.compact ? ' emb-price--compact' : ''}`} data-testid="price-summary">
      <div>
        <dt>Garment</dt>
        <dd>{m(b.basePrice)}</dd>
      </div>
      {b.fees.map((f) => (
        <div key={f.kind}>
          <dt>
            {f.label}
            {f.perItem > 1 ? ` × ${f.perItem}` : ''}
          </dt>
          <dd>{m(f.unitPrice * f.perItem)}</dd>
        </div>
      ))}
      {b.quantity > 1 ? (
        <div>
          <dt>Per item</dt>
          <dd>{m(b.perItem)}</dd>
        </div>
      ) : null}
      <div class="emb-price__total">
        <dt>Total{b.quantity > 1 ? ` (${b.quantity} items)` : ''}</dt>
        <dd data-testid="price-total">{m(b.total)}</dd>
      </div>
    </dl>
  );
}
