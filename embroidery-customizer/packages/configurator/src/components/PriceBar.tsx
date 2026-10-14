import { useEffect, useRef, useState } from 'preact/hooks';
import { formatMoney, type PriceBreakdown } from '@embroidery/shared';

/**
 * Live price in the sticky action dock: the garment price plus every add-on (embroidery,
 * size, style, premium font, extra logos) is always listed, and the total highlights when it
 * changes so customers see what each option costs.
 */
export function PriceBar(p: { breakdown: PriceBreakdown; currency: string; locale: string }) {
  const sample = !p.breakdown.chargeable;
  const [flash, setFlash] = useState(false);
  const last = useRef(p.breakdown.total);
  useEffect(() => {
    if (last.current === p.breakdown.total) return;
    last.current = p.breakdown.total;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 900);
    return () => clearTimeout(t);
  }, [p.breakdown.total]);
  const m = (n: number) => formatMoney(n, p.currency, p.locale);
  const b = p.breakdown;
  return (
    <div class={`emb-pricebar${flash ? ' is-flash' : ''}`} data-testid="price-bar">
      <ul class="emb-pricebar__lines" aria-label="Price breakdown" data-testid="price-lines">
        <li>
          <span>Garment</span>
          <b>{m(b.basePrice)}</b>
        </li>
        {b.fees.map((f) => (
          <li key={f.kind} class="is-addon" data-fee={f.kind}>
            <span>
              {f.label}
              {f.perItem > 1 ? ` ×${f.perItem}` : ''}
            </span>
            <b>+{m(f.unitPrice * f.perItem)}</b>
          </li>
        ))}
        {b.quantity > 1 ? (
          <li>
            <span>× {b.quantity} items</span>
          </li>
        ) : null}
        {b.bulkDiscount ? (
          <li class="is-saving" data-testid="bulk-saving">
            <span>Bulk saving ({b.bulkDiscount.percentOff}% off garments)</span>
            <b>−{m(b.bulkDiscount.amount)}</b>
          </li>
        ) : null}
        {b.nextBulkTier && b.quantity > 1 ? (
          <li class="is-nudge" data-testid="bulk-nudge">
            Add {b.nextBulkTier.more} more {b.nextBulkTier.more === 1 ? 'item' : 'items'} to save{' '}
            {b.nextBulkTier.percentOff}% on garments
          </li>
        ) : null}
      </ul>
      <div class="emb-pricebar__total">
        <span class="emb-pricebar__label">
          Total
          {sample ? <em class="emb-pricebar__sample"> · sample prices, not charged yet</em> : null}
        </span>
        <strong class="emb-pricebar__amount" aria-live="polite" data-testid="price-bar-total">
          {m(b.total)}
        </strong>
      </div>
    </div>
  );
}
