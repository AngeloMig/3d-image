import { LIMITS, validateText, type ProductContext } from '@embroidery/shared';
import { IconClose, IconPlus } from './icons';
import { Choice, Notice } from './controls';

export interface TeamRow {
  id: string;
  size: string;
  /** Per-person name (personalized design). */
  text: string;
  /** Jersey number (number design), digits only. */
  number: string;
  quantity: number;
}

interface Props {
  product: ProductContext;
  sizeOption: string | null;
  rows: TeamRow[];
  /** Label of the design that gets personalized per row, e.g. "Upper Back · “NAME”". */
  personalizedLabel: string | null;
  /** Text designs that could carry the per-person name. */
  personalizeOptions: { id: string; label: string }[];
  personalizedId: string | null;
  onPersonalize: (id: string) => void;
  /** Label of the design that carries each person's jersey number, if any. */
  numberLabel: string | null;
  /** Functional update so rapid edits (fast typing, paste) never overwrite each other. */
  onChange: (update: (rows: TeamRow[]) => TeamRow[]) => void;
  rowError: (row: TeamRow) => string | null;
}

let seq = 0;
export const newTeamRow = (size: string, text = '', number = ''): TeamRow => ({
  id: `r${++seq}${Date.now().toString(36)}`,
  size,
  text,
  number,
  quantity: 1,
});

/** Next unused jersey number after the highest one so far ("" when numbers aren't used). */
export function nextJerseyNumber(rows: TeamRow[]): string {
  const used = rows
    .filter((r) => r.number !== '')
    .map((r) => Number(r.number))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 99);
  if (!rows.some((r) => r.number !== '')) return '';
  const next = (used.length ? Math.max(...used) : 0) + 1;
  return next > 99 ? '' : String(next);
}

/**
 * Team / bulk orders: one shared design, a different name (and size) per row.
 * Every row becomes its own cart line with its own Customization ID.
 */
export function TeamOrderPanel(p: Props) {
  const sizes = p.sizeOption
    ? (p.product.options.find((o) => o.name === p.sizeOption)?.values ?? [])
    : [];
  const update = (id: string, patch: Partial<TeamRow>) =>
    p.onChange((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const total = p.rows.reduce((s, r) => s + r.quantity, 0);
  return (
    <div class="emb-team" data-testid="team-panel">
      {p.personalizeOptions.length > 1 ? (
        <Choice
          label="Put each person’s name on"
          value={p.personalizedId ?? ''}
          variant="chips"
          testId="team-personalize"
          onChange={p.onPersonalize}
          options={p.personalizeOptions.map((o) => ({ value: o.id, label: o.label }))}
        />
      ) : null}
      {p.personalizedLabel ? (
        <p class="emb-field__hint">
          Each row gets its own name on <strong>{p.personalizedLabel}</strong>
          {p.numberLabel ? (
            <>
              {' '}
              and number on <strong>{p.numberLabel}</strong>
            </>
          ) : null}
          . Other designs stay the same on every shirt.
        </p>
      ) : (
        <Notice tone="warn">Add a text design to personalize each shirt with a name.</Notice>
      )}
      <div
        class={`emb-team__table${p.numberLabel ? ' has-number' : ''}`}
        role="table"
        aria-label="Team order"
      >
        <div class="emb-team__row emb-team__row--head" role="row">
          {sizes.length ? <span role="columnheader">Size</span> : null}
          <span role="columnheader">Name / text</span>
          {p.numberLabel ? <span role="columnheader">No.</span> : null}
          <span role="columnheader">Qty</span>
          <span role="columnheader" class="emb-sr-only">
            Remove
          </span>
        </div>
        {p.rows.map((row, i) => {
          const error =
            p.rowError(row) ??
            (p.personalizedLabel ? (validateText(row.text)[0]?.message ?? null) : null) ??
            (p.numberLabel && row.number !== '' && !/^\d{1,2}$/.test(row.number)
              ? 'Numbers go from 0 to 99.'
              : null);
          return (
            <div key={row.id} class="emb-team__entry" data-testid="team-row">
              <div class="emb-team__row" role="row">
                {sizes.length ? (
                  <select
                    aria-label={`Size for row ${i + 1}`}
                    value={row.size}
                    onChange={(e) =>
                      update(row.id, { size: (e.currentTarget as HTMLSelectElement).value })
                    }
                  >
                    {sizes.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                ) : null}
                <input
                  type="text"
                  aria-label={`Name for row ${i + 1}`}
                  placeholder="Name"
                  maxLength={LIMITS.maxCharsPerLine}
                  value={row.text}
                  disabled={!p.personalizedLabel}
                  aria-invalid={!!error && row.text !== ''}
                  data-testid="team-text"
                  onInput={(e) =>
                    update(row.id, { text: (e.currentTarget as HTMLInputElement).value })
                  }
                />
                {p.numberLabel ? (
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={2}
                    aria-label={`Number for row ${i + 1}`}
                    placeholder="#"
                    value={row.number}
                    data-testid="team-number"
                    onInput={(e) => {
                      const v = (e.currentTarget as HTMLInputElement).value.replace(/\D+/g, '');
                      (e.currentTarget as HTMLInputElement).value = v;
                      update(row.id, { number: v });
                    }}
                  />
                ) : null}
                <input
                  type="number"
                  min={1}
                  max={LIMITS.maxQuantity}
                  aria-label={`Quantity for row ${i + 1}`}
                  value={row.quantity}
                  onChange={(e) =>
                    update(row.id, {
                      quantity: Math.min(
                        LIMITS.maxQuantity,
                        Math.max(1, Number((e.currentTarget as HTMLInputElement).value) || 1),
                      ),
                    })
                  }
                />
                <button
                  type="button"
                  class="emb-icon-btn"
                  aria-label={`Remove row ${i + 1}`}
                  disabled={p.rows.length <= 1}
                  onClick={() => p.onChange((rows) => rows.filter((r) => r.id !== row.id))}
                >
                  <IconClose />
                </button>
              </div>
              {error && (row.text !== '' || row.number !== '') ? (
                <p class="emb-field__error">{error}</p>
              ) : null}
            </div>
          );
        })}
      </div>
      <div class="emb-section-head">
        <button
          type="button"
          class="emb-btn emb-btn--secondary emb-btn--sm"
          disabled={p.rows.length >= LIMITS.maxTeamRows}
          onClick={() =>
            p.onChange((rows) => [
              ...rows,
              newTeamRow(rows.at(-1)?.size ?? sizes[0] ?? '', '', nextJerseyNumber(rows)),
            ])
          }
          data-testid="team-add-row"
        >
          <IconPlus /> Add person
        </button>
        <span class="emb-muted">
          {p.rows.length} {p.rows.length === 1 ? 'person' : 'people'} · {total} item
          {total === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  );
}
