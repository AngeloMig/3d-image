import type { ProductContext, ProductOption, ProductVariant } from '@embroidery/shared';

/** Shape of `{{ product | json }}` and `/products/{handle}.js` (fields we use). */
export interface ShopifyProductJson {
  id: number | string;
  title: string;
  options?: Array<string | { name: string; values?: string[] }>;
  variants: Array<{
    id: number | string;
    title: string;
    options?: string[];
    option1?: string | null;
    option2?: string | null;
    option3?: string | null;
    available: boolean;
    price: number | string;
  }>;
}

/** Normalize Shopify product JSON (Liquid or Ajax API) into the configurator's ProductContext. */
export function fromShopifyProduct(
  json: ShopifyProductJson,
  currency: string,
  locale: string,
): ProductContext {
  const variants: ProductVariant[] = json.variants.map((v) => ({
    id: String(v.id),
    title: v.title,
    options: (v.options ?? [v.option1, v.option2, v.option3]).filter(
      (o): o is string => typeof o === 'string',
    ),
    available: !!v.available,
    // Liquid JSON and the Ajax API both use integer minor units; tolerate "32.00" strings too.
    price: typeof v.price === 'number' ? v.price : Math.round(parseFloat(v.price) * 100),
  }));
  const rawOptions = json.options ?? [];
  const options: ProductOption[] = rawOptions.map((o, i) => {
    const name = typeof o === 'string' ? o : o.name;
    const listed = typeof o === 'string' ? undefined : o.values;
    const values = listed ?? [
      ...new Set(variants.map((v) => v.options[i]).filter((x): x is string => !!x)),
    ];
    return { name, values };
  });
  return {
    id: String(json.id),
    title: json.title,
    options: options.length ? options : [{ name: 'Title', values: ['Default Title'] }],
    variants,
    currency,
    locale,
    isDemo: false,
  };
}
