import {
  LIMITS,
  findFont,
  findThreadColor,
  formatDimensions,
  formatMoney,
  textLines,
  type ImageDesign,
  type ProductContext,
  type ProductSelection,
  type ResolvedPlacement,
  type TextDesign,
  type ValidationIssue,
} from '@embroidery/shared';
import { Notice } from './controls';
import { IconMinus, IconPlus } from './icons';

interface Props {
  product: ProductContext;
  selection: ProductSelection;
  design: TextDesign | ImageDesign | null;
  resolved: ResolvedPlacement | null;
  rotationDeg: number;
  thumbnail: string | null;
  issues: ValidationIssue[];
  onQuantity: (q: number) => void;
  onEdit: (step: 0 | 1 | 2) => void;
}

export function ReviewStep(p: Props) {
  const variant = p.product.variants.find((v) => v.id === p.selection.variantId);
  const rows: [string, string, 0 | 1 | 2][] = [
    ['Product', `${p.product.title}${variant ? ` — ${variant.title}` : ''}`, 0],
  ];
  if (p.design?.type === 'text') {
    rows.push(['Design type', 'Text', 1]);
    rows.push(['Text', textLines(p.design.text).join(' / ') || '—', 1]);
    rows.push(['Font', findFont(p.design.fontId)?.label ?? p.design.fontId, 1]);
    rows.push([
      'Thread colour',
      findThreadColor(p.design.threadColorId)?.label ?? p.design.threadColorId,
      1,
    ]);
  } else if (p.design?.type === 'image') {
    rows.push(['Design type', 'Logo / Image', 1]);
    rows.push(['Artwork', p.design.originalFilename, 1]);
    rows.push(['Thread colours', 'Matched to your artwork when digitized', 1]);
  }
  if (p.resolved) {
    rows.push(['Position', p.resolved.preset.label, 2]);
    rows.push(['Dimensions', formatDimensions(p.resolved.widthCm, p.resolved.heightCm), 2]);
    if (p.rotationDeg) rows.push(['Rotation', `${p.rotationDeg}°`, 2]);
  }
  const total = variant
    ? formatMoney(variant.price * p.selection.quantity, p.product.currency, p.product.locale)
    : null;

  return (
    <div class="emb-stack">
      <div class="emb-review">
        {p.thumbnail ? (
          <img
            class="emb-review__thumb"
            src={p.thumbnail}
            alt="Preview of your embroidered garment"
            data-testid="review-thumb"
          />
        ) : null}
        <dl class="emb-summary" data-testid="review-summary">
          {rows.map(([k, v, step]) => (
            <div class="emb-summary__row" key={k}>
              <dt>{k}</dt>
              <dd>
                <span>{v}</span>
                <button
                  type="button"
                  class="emb-link"
                  onClick={() => p.onEdit(step)}
                  aria-label={`Edit ${k.toLowerCase()}`}
                >
                  Edit
                </button>
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {p.issues.length ? (
        <Notice tone="error" testId="review-issues">
          <strong>Please fix before adding to cart:</strong>
          <ul>
            {p.issues.map((i) => (
              <li key={i.field + i.message}>{i.message}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      <div class="emb-qty-row">
        <div class="emb-qty" role="group" aria-label="Quantity">
          <button
            type="button"
            aria-label="Decrease quantity"
            onClick={() => p.onQuantity(p.selection.quantity - 1)}
            disabled={p.selection.quantity <= 1}
          >
            <IconMinus />
          </button>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={LIMITS.maxQuantity}
            value={p.selection.quantity}
            aria-label="Quantity"
            data-testid="quantity"
            onChange={(e) => p.onQuantity(Number((e.currentTarget as HTMLInputElement).value) || 1)}
          />
          <button
            type="button"
            aria-label="Increase quantity"
            onClick={() => p.onQuantity(p.selection.quantity + 1)}
            disabled={p.selection.quantity >= LIMITS.maxQuantity}
          >
            <IconPlus />
          </button>
        </div>
        {total ? (
          <p class="emb-total">
            <span>Total</span> <strong>{total}</strong>
          </p>
        ) : null}
      </div>

      <p class="emb-caveat" data-testid="caveat">
        Visual preview only; actual stitch appearance may vary.
      </p>
    </div>
  );
}
