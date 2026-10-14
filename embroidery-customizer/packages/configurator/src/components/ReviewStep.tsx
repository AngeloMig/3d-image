import type { ComponentChildren } from 'preact';
import {
  LIMITS,
  findFont,
  findStitchStyle,
  findThreadColor,
  formatDimensions,
  textLines,
  type EmbroideryDesign,
  type PriceBreakdown,
  type ProductContext,
  type ProductSelection,
  type ResolvedPlacement,
  type ValidationIssue,
} from '@embroidery/shared';
import { Choice, Notice } from './controls';
import { IconMinus, IconPlus } from './icons';
import { PriceSummary } from './PriceSummary';

export interface ReviewLayer {
  layerId: string;
  design: EmbroideryDesign;
  resolved: ResolvedPlacement | null;
  rotationDeg: number;
}

interface Props {
  product: ProductContext;
  selection: ProductSelection;
  layers: ReviewLayer[];
  thumbnail: string | null;
  issues: ValidationIssue[];
  breakdown: PriceBreakdown;
  orderMode: 'single' | 'team';
  canTeam: boolean;
  teamPanel: ComponentChildren;
  share: { busy: boolean; url: string | null; message: string | null };
  onOrderMode: (m: 'single' | 'team') => void;
  onShare: () => void;
  onQuantity: (q: number) => void;
  onEdit: (step: 0 | 1 | 2, layerId?: string) => void;
  /** "Add text / Add logo" shortcuts under the summary. */
  addDesign?: ComponentChildren;
}

/** One compact line set per design: what is stitched, then where and how. */
function designSummary(layer: ReviewLayer): { main: string; where: string; how: string } {
  const d = layer.design;
  const where = layer.resolved
    ? `${layer.resolved.preset.label} · ${formatDimensions(layer.resolved.widthCm, layer.resolved.heightCm)}${layer.rotationDeg ? ` · ${layer.rotationDeg}°` : ''}`
    : '';
  if (d.type === 'text')
    return {
      main: `“${textLines(d.text).join(' / ') || '—'}”`,
      where,
      how: `${findFont(d.fontId)?.label ?? d.fontId} · ${findThreadColor(d.threadColorId)?.label ?? d.threadColorId} thread · ${findStitchStyle(d.stitchStyle).label}`,
    };
  return {
    main: d.originalFilename + (d.backgroundRemoved ? ' (background removed)' : ''),
    where,
    how: `Logo · ${findStitchStyle(d.stitchStyle).label} · colours matched to your artwork`,
  };
}

export function ReviewStep(p: Props) {
  const variant = p.product.variants.find((v) => v.id === p.selection.variantId);

  return (
    <div class="emb-stack">
      <div class="emb-review" data-testid="review-summary">
        {p.thumbnail ? (
          <img
            class="emb-review__thumb"
            src={p.thumbnail}
            alt="Preview of your embroidered garment"
            data-testid="review-thumb"
          />
        ) : null}
        <div class="emb-review__body">
          <div class="emb-review__product">
            <div>
              <strong>{p.product.title}</strong>
              {variant && p.orderMode === 'single' ? <span>{variant.title}</span> : null}
            </div>
            <button
              type="button"
              class="emb-link"
              onClick={() => p.onEdit(0)}
              aria-label="Edit product"
            >
              Edit
            </button>
          </div>
          <ol class="emb-review__designs">
            {p.layers.map((l, i) => {
              const d = designSummary(l);
              return (
                <li class="emb-rdesign" key={l.layerId}>
                  <span class="emb-rdesign__num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <div class="emb-rdesign__text">
                    <p class="emb-rdesign__main">{d.main}</p>
                    {d.where ? <p class="emb-rdesign__meta">{d.where}</p> : null}
                    <p class="emb-rdesign__meta">{d.how}</p>
                  </div>
                  <button
                    type="button"
                    class="emb-link"
                    onClick={() => p.onEdit(1, l.layerId)}
                    aria-label={`Edit design ${i + 1}`}
                  >
                    Edit
                  </button>
                </li>
              );
            })}
          </ol>
          {p.addDesign}
        </div>
      </div>

      {p.canTeam ? (
        <Choice
          label="Order type"
          value={p.orderMode}
          variant="segmented"
          testId="order-mode"
          onChange={p.onOrderMode}
          options={[
            { value: 'single', label: 'Single item' },
            { value: 'team', label: 'Team / bulk order' },
          ]}
        />
      ) : null}

      {p.orderMode === 'team' ? (
        p.teamPanel
      ) : (
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
              onChange={(e) =>
                p.onQuantity(Number((e.currentTarget as HTMLInputElement).value) || 1)
              }
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
        </div>
      )}

      <PriceSummary
        breakdown={p.breakdown}
        currency={p.product.currency}
        locale={p.product.locale}
      />

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

      <div class="emb-share" data-testid="share">
        <button
          type="button"
          class="emb-btn emb-btn--secondary emb-btn--sm"
          onClick={p.onShare}
          disabled={p.share.busy}
          data-testid="share-button"
        >
          {p.share.busy ? 'Saving…' : 'Save & share design'}
        </button>
        {p.share.url ? (
          <input
            class="emb-share__url"
            readOnly
            value={p.share.url}
            aria-label="Share link"
            data-testid="share-url"
            onFocus={(e) => (e.currentTarget as HTMLInputElement).select()}
          />
        ) : null}
        {p.share.message ? (
          <p class="emb-field__hint" role="status">
            {p.share.message}
          </p>
        ) : null}
      </div>

      <p class="emb-caveat" data-testid="caveat">
        Visual preview only; actual stitch appearance may vary.
      </p>
    </div>
  );
}
