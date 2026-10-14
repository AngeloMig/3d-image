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
    <>
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
        {b.bulkDiscount ? (
          <div class="emb-price__saving" data-testid="summary-bulk-saving">
            <dt>
              Bulk saving · {b.bulkDiscount.percentOff}% off garments ({b.bulkDiscount.minQuantity}+
              items)
            </dt>
            <dd>−{m(b.bulkDiscount.amount)}</dd>
          </div>
        ) : null}
        <div class="emb-price__total">
          <dt>Total{b.quantity > 1 ? ` (${b.quantity} items)` : ''}</dt>
          <dd data-testid="price-total">{m(b.total)}</dd>
        </div>
      </dl>
      {b.bulkDiscount ? (
        <p class="emb-price__note">Bulk saving is applied automatically at checkout.</p>
      ) : null}
      {b.nextBulkTier ? (
        <p class="emb-price__note emb-price__note--nudge" data-testid="summary-bulk-nudge">
          Order {b.nextBulkTier.minQuantity}+ items and save {b.nextBulkTier.percentOff}% on
          garments{b.quantity > 1 ? ` (${b.nextBulkTier.more} more to go)` : ''}.
        </p>
      ) : null}
    </>
  );
}
