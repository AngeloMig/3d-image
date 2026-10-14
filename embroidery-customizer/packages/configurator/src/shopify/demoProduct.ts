import type { PricingSettings, ProductContext, ProductVariant } from '@embroidery/shared';

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

/** DEMO pricing (USD cents). In Shopify these come from the "Embroidery fee" product's variants. */
export const DEMO_PRICING: PricingSettings = {
  fees: {
    text: { price: 500, variantId: 'demo-fee-text' },
    logo: { price: 800, variantId: 'demo-fee-logo' },
    size_medium: { price: 300, variantId: 'demo-fee-size-medium' },
    size_large: { price: 600, variantId: 'demo-fee-size-large' },
    style_puff: { price: 400, variantId: 'demo-fee-puff' },
    style_metallic: { price: 300, variantId: 'demo-fee-metallic' },
    style_patch: { price: 600, variantId: 'demo-fee-patch' },
    style_chenille: { price: 700, variantId: 'demo-fee-chenille' },
    font_premium: { price: 200, variantId: 'demo-fee-font' },
  },
  bulkTiers: [
    { minQuantity: 10, percentOff: 10 },
    { minQuantity: 25, percentOff: 15 },
    { minQuantity: 50, percentOff: 20 },
  ],
};
