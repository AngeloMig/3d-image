import { useEffect, useState } from 'preact/hooks';
import type { ModelAdapter, ProductContext } from '@embroidery/shared';
import { Configurator, type ConfiguratorProps, type GarmentCarry } from './Configurator';

/** One garment the customer can choose: its 3D model + calibration and its product. */
export interface GarmentOption {
  id: string;
  label: string;
  adapter: ModelAdapter;
  modelUrl: string;
  product: ProductContext;
  initialVariantId?: string | null;
}

export type GarmentConfiguratorProps = Omit<
  ConfiguratorProps,
  'adapter' | 'modelUrl' | 'product' | 'initialVariantId' | 'garments' | 'garmentId'
> & {
  garments: GarmentOption[];
  initialGarmentId?: string | null;
};

/** The variant of `product` that best matches the option values chosen on the previous garment. */
function matchVariant(product: ProductContext, wanted: Record<string, string>): string | null {
  const score = (options: string[]) =>
    product.options.reduce(
      (n, o, i) => n + (wanted[o.name]?.toLowerCase() === options[i]?.toLowerCase() ? 1 : 0),
      0,
    );
  const best = [...product.variants]
    .filter((v) => v.available)
    .sort((a, b) => score(b.options) - score(a.options))[0];
  return best?.id ?? null;
}

/**
 * Several garments (T-shirt, polo, long sleeve…) in one customizer. Switching garment loads its
 * own model + product and carries the designs over; positions the new cut can't take move.
 */
export function GarmentConfigurator(p: GarmentConfiguratorProps) {
  const { garments, initialGarmentId, ...rest } = p;
  const [garmentId, setGarmentId] = useState(
    garments.find((g) => g.id === initialGarmentId)?.id ?? garments[0]!.id,
  );
  const [carry, setCarry] = useState<GarmentCarry | null>(null);
  // Editing a cart line opens the garment it was made on.
  const editModel = p.edit?.config.product.modelId;
  useEffect(() => {
    const target = garments.find((x) => x.id === editModel || x.adapter.id === editModel);
    if (target && target.id !== garmentId) {
      setCarry(null);
      setGarmentId(target.id);
    }
  }, [p.edit]);
  const g = garments.find((x) => x.id === garmentId) ?? garments[0]!;
  return (
    <Configurator
      key={g.id}
      {...rest}
      adapter={g.adapter}
      modelUrl={g.modelUrl}
      product={g.product}
      initialVariantId={carry ? matchVariant(g.product, carry.options) : g.initialVariantId}
      garments={garments.map((x) => ({ id: x.id, label: x.label }))}
      garmentId={g.id}
      carry={carry}
      onGarmentChange={(id, next) => {
        setCarry(next);
        setGarmentId(id);
      }}
    />
  );
}
