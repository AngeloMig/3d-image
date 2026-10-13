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
}

type Row = [label: string, value: string, step: 0 | 1 | 2, layerId?: string];

function designRows(layer: ReviewLayer, prefix: string): Row[] {
  const d = layer.design;
  const rows: Row[] = [];
  if (d.type === 'text') {
    rows.push([`${prefix}Text`, textLines(d.text).join(' / ') || '—', 1, layer.layerId]);
    rows.push([
      `${prefix}Style`,
      `${findFont(d.fontId)?.label ?? d.fontId} · ${findThreadColor(d.threadColorId)?.label ?? d.threadColorId} thread · ${findStitchStyle(d.stitchStyle).label}`,
      1,
      layer.layerId,
    ]);
  } else {
    rows.push([
      `${prefix}Logo`,
      d.originalFilename + (d.backgroundRemoved ? ' (background removed)' : ''),
      1,
      layer.layerId,
    ]);
    rows.push([
      `${prefix}Style`,
      `${findStitchStyle(d.stitchStyle).label} · thread colours matched to your artwork`,
      1,
      layer.layerId,
    ]);
  }
  if (layer.resolved) {
    rows.push([
      `${prefix}Position`,
      `${layer.resolved.preset.label} · ${formatDimensions(layer.resolved.widthCm, layer.resolved.heightCm)}${layer.rotationDeg ? ` · ${layer.rotationDeg}°` : ''}`,
      2,
      layer.layerId,
    ]);
  }
  return rows;
}

export function ReviewStep(p: Props) {
  const variant = p.product.variants.find((v) => v.id === p.selection.variantId);
  const many = p.layers.length > 1;
  const rows: Row[] = [
    [
      'Product',
      `${p.product.title}${variant && p.orderMode === 'single' ? ` — ${variant.title}` : ''}`,
      0,
    ],
    ...p.layers.flatMap((l, i) => designRows(l, many ? `Design ${i + 1} · ` : '')),
  ];

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
          {rows.map(([k, v, step, layerId]) => (
            <div class="emb-summary__row" key={k}>
              <dt>{k}</dt>
              <dd>
                <span>{v}</span>
                <button
                  type="button"
                  class="emb-link"
                  onClick={() => p.onEdit(step, layerId)}
                  aria-label={`Edit ${k.toLowerCase()}`}
                >
                  Edit
                </button>
              </dd>
            </div>
          ))}
        </dl>
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
