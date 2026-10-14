import { useRef } from 'preact/hooks';
import { getPreset, textLines, type ModelAdapter } from '@embroidery/shared';
import { layerDesign, type EditorLayer } from '../state/editorState';
import { IconClose, IconImage, IconPlus, IconText } from './icons';

interface Props {
  adapter: ModelAdapter;
  layers: EditorLayer[];
  activeLayerId: string;
  maxDesigns: number;
  canAdd: boolean;
  onSelect: (id: string) => void;
  onAddText: () => void;
  onAddLogo: (file: File) => void;
  onRemove: (id: string) => void;
  /** Only the add buttons (e.g. under the review summary). */
  actionsOnly?: boolean;
}

export function layerTitle(adapter: ModelAdapter, layer: EditorLayer): string {
  const design = layerDesign(layer);
  const where = getPreset(adapter, layer.placement.positionId)?.label ?? '';
  const what = design.type === 'text' ? `“${textLines(design.text)[0] ?? ''}”` : 'Logo';
  return `${where} · ${what}`;
}

/**
 * The designs on this garment (one per position) plus "Add text" / "Add logo". Adding a logo
 * opens the file picker straight away and creates the new design with the artwork on it.
 */
export function LayerBar(p: Props) {
  const file = useRef<HTMLInputElement>(null);
  const actions = p.canAdd ? (
    <div class="emb-layers__add" role="group" aria-label="Add a design">
      <button type="button" class="emb-layer-add" onClick={p.onAddText} data-testid="add-layer">
        <IconPlus /> Text
      </button>
      <button
        type="button"
        class="emb-layer-add"
        onClick={() => file.current?.click()}
        data-testid="add-logo"
      >
        <IconPlus /> Logo
      </button>
      <input
        ref={file}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        class="emb-sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="add-logo-input"
        onChange={(e) => {
          const f = (e.currentTarget as HTMLInputElement).files?.[0];
          (e.currentTarget as HTMLInputElement).value = '';
          if (f) p.onAddLogo(f);
        }}
      />
    </div>
  ) : null;

  if (p.actionsOnly)
    return actions ? (
      <div class="emb-layers emb-layers--actions">
        <span class="emb-field__label">Add another design</span>
        {actions}
      </div>
    ) : null;

  return (
    <div class="emb-layers" data-testid="layer-bar">
      <div class="emb-layers__head">
        <span class="emb-field__label" id="emb-layers-label">
          Designs
        </span>
        <span class="emb-muted">
          {p.layers.length} of {p.maxDesigns}
        </span>
      </div>
      <div class="emb-layers__list" role="tablist" aria-labelledby="emb-layers-label">
        {p.layers.map((layer, i) => {
          const active = layer.id === p.activeLayerId;
          const design = layerDesign(layer);
          return (
            <div class={`emb-layer${active ? ' is-active' : ''}`} key={layer.id}>
              <button
                type="button"
                role="tab"
                aria-selected={active}
                class="emb-layer__select"
                data-testid={`layer-${i + 1}`}
                onClick={() => p.onSelect(layer.id)}
                title={layerTitle(p.adapter, layer)}
              >
                <span class="emb-layer__icon" aria-hidden="true">
                  {design.type === 'image' && design.previewUrl ? (
                    <img src={design.previewUrl} alt="" />
                  ) : design.type === 'image' ? (
                    <IconImage />
                  ) : (
                    <IconText />
                  )}
                </span>
                <span class="emb-layer__title">{layerTitle(p.adapter, layer)}</span>
              </button>
              {p.layers.length > 1 ? (
                <button
                  type="button"
                  class="emb-layer__remove"
                  aria-label={`Remove design ${i + 1}`}
                  data-testid={`remove-layer-${i + 1}`}
                  onClick={() => p.onRemove(layer.id)}
                >
                  <IconClose />
                </button>
              ) : null}
            </div>
          );
        })}
        {actions}
      </div>
    </div>
  );
}
