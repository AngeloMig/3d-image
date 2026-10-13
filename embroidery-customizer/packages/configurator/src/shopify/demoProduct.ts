import type { ProductContext, ProductVariant } from '@embroidery/shared';

const sizes = ['S', 'M', 'L', 'XL'];
const colors = ['Royal', 'White', 'Black', 'Beige', 'Navy'];

/** DEMO DATA ONLY — replaced by the real Shopify product JSON in the theme app block. */
export const DEMO_PRODUCT: ProductContext = {
  id: 'demo-product-tee',
  title: 'Classic Embroidered Tee',
  options: [
    { name: 'Size', values: sizes },
    { name: 'Color', values: colors },
  ],
  variants: sizes.flatMap((size, si) =>
    colors.map((color, ci): ProductVariant => ({
      id: `demo-variant-${si * colors.length + ci + 1}`,
      title: `${size} / ${color}`,
      options: [size, color],
      // One sold-out combination to demonstrate availability handling.
      available: !(size === 'XL' && color === 'Beige'),
      price: 3200,
    })),
  ),
  currency: 'USD',
  locale: 'en-US',
  isDemo: true,
};
