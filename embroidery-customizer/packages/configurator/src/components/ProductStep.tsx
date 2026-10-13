import {
  formatMoney,
  resolveGarmentColor,
  type ProductContext,
  type ProductSelection,
} from '@embroidery/shared';
import { Choice, Notice } from './controls';

export const isColorOption = (name: string) => /colou?r|shade/i.test(name);

interface Props {
  product: ProductContext;
  selection: ProductSelection;
  colorOverrides: Record<string, string | null>;
  originalColorHex: string | null;
  onOption: (name: string, value: string) => void;
}

export function ProductStep(p: Props) {
  const variant = p.product.variants.find((v) => v.id === p.selection.variantId);
  const optionIndex = (name: string) => p.product.options.findIndex((o) => o.name === name);
  /** Selectable when any in-stock variant carries the value (selection snaps to the closest variant). */
  const isAvailable = (name: string, value: string) => {
    const idx = optionIndex(name);
    return p.product.variants.some((v) => v.available && v.options[idx] === value);
  };

  return (
    <div class="emb-stack">
      <div class="emb-product">
        <div>
          <p class="emb-product__title">{p.product.title}</p>
          <p class="emb-product__variant">{variant?.title ?? ''}</p>
        </div>
        {variant ? (
          <p class="emb-product__price" data-testid="price">
            {formatMoney(variant.price, p.product.currency, p.product.locale)}
          </p>
        ) : null}
      </div>
      {p.product.isDemo ? (
        <Notice tone="info" testId="demo-variants-notice">
          <strong>Demo variants.</strong> Sizes and colours here are sample data. Once the app is
          connected to Shopify, they come from your real product.
        </Notice>
      ) : null}

      {p.product.options.map((option) => {
        if (option.values.length <= 1 && /^title$/i.test(option.name)) return null;
        const current = p.selection.options[option.name] ?? option.values[0] ?? '';
        if (isColorOption(option.name)) {
          return (
            <Choice
              key={option.name}
              label={`${option.name}: ${current}`}
              value={current}
              variant="swatches"
              testId={`option-${option.name.toLowerCase()}`}
              onChange={(v) => p.onOption(option.name, v)}
              options={option.values.map((value) => {
                const hex = resolveGarmentColor(value, p.colorOverrides);
                const swatch = hex ?? p.originalColorHex ?? '#c9c6bf';
                const available = isAvailable(option.name, value);
                return {
                  value,
                  label: value,
                  disabled: !available,
                  title: available ? value : `${value} — sold out`,
                  content: (
                    <span class="emb-swatch" style={{ background: swatch }}>
                      <span class="emb-sr-only">{value}</span>
                    </span>
                  ),
                };
              })}
            />
          );
        }
        return (
          <Choice
            key={option.name}
            label={option.name}
            value={current}
            variant="chips"
            testId={`option-${option.name.toLowerCase()}`}
            onChange={(v) => p.onOption(option.name, v)}
            options={option.values.map((value) => ({
              value,
              label: value,
              disabled: !isAvailable(option.name, value),
              description: 'Sold out',
            }))}
          />
        );
      })}
    </div>
  );
}
