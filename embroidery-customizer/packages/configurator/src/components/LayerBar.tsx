import { LIMITS, getPreset, textLines, type ModelAdapter } from '@embroidery/shared';
import { layerDesign, type EditorLayer } from '../state/editorState';
import { IconClose, IconPlus } from './icons';

interface Props {
  adapter: ModelAdapter;
  layers: EditorLayer[];
  activeLayerId: string;
  canAdd: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}

export function layerTitle(adapter: ModelAdapter, layer: EditorLayer): string {
  const design = layerDesign(layer);
  const where = getPreset(adapter, layer.placement.positionId)?.label ?? '';
  const what = design.type === 'text' ? `“${textLines(design.text)[0] ?? ''}”` : 'Logo';
  return `${where} · ${what}`;
}

/** The designs on this garment (up to LIMITS.maxDesigns, one per position). */
export function LayerBar(p: Props) {
  return (
    <div class="emb-layers" data-testid="layer-bar">
      <div class="emb-field__label" id="emb-layers-label">
        Designs on this item{' '}
        <span class="emb-muted">
          ({p.layers.length} of {LIMITS.maxDesigns})
        </span>
      </div>
      <div class="emb-layers__list" role="tablist" aria-labelledby="emb-layers-label">
        {p.layers.map((layer, i) => {
          const active = layer.id === p.activeLayerId;
          return (
            <div class={`emb-layer${active ? ' is-active' : ''}`} key={layer.id}>
              <button
                type="button"
                role="tab"
                aria-selected={active}
                class="emb-layer__select"
                data-testid={`layer-${i + 1}`}
                onClick={() => p.onSelect(layer.id)}
              >
                <span class="emb-layer__num">{i + 1}</span>
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
        {p.canAdd ? (
          <button type="button" class="emb-layer-add" onClick={p.onAdd} data-testid="add-layer">
            <IconPlus /> Add another design
          </button>
        ) : null}
      </div>
    </div>
  );
}
