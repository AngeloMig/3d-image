import { useState } from 'preact/hooks';
import {
  cleanTemplateValue,
  type DesignTemplate,
  type ModelAdapter,
  getPreset,
} from '@embroidery/shared';

interface Props {
  adapter: ModelAdapter;
  templates: readonly DesignTemplate[];
  /** Replaces the current designs with the template, filled with these values. */
  onApply: (template: DesignTemplate, values: Record<string, string>) => void;
  /** Opens the panel (e.g. when the customer hasn't changed the default design yet). */
  defaultOpen?: boolean;
}

const initialValues = (t: DesignTemplate) =>
  Object.fromEntries(t.fields.map((f) => [f.key, f.defaultValue]));

/** "Start from a template": pick a ready-made layout, fill in a few fields, apply. */
export function TemplatePicker(p: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const selected = p.templates.find((t) => t.id === selectedId) ?? null;

  const choose = (t: DesignTemplate) => {
    setSelectedId(t.id === selectedId ? null : t.id);
    setValues(initialValues(t));
  };

  if (!p.templates.length) return null;
  return (
    <details class="emb-finetune emb-templates" open={p.defaultOpen} data-testid="templates">
      <summary>
        <span>Start from a template</span>
      </summary>
      <div class="emb-stack emb-stack--tight">
        <div class="emb-templates__grid" role="list">
          {p.templates.map((t) => (
            <button
              key={t.id}
              type="button"
              role="listitem"
              class={`emb-template${t.id === selectedId ? ' is-on' : ''}`}
              aria-pressed={t.id === selectedId}
              onClick={() => choose(t)}
              data-testid={`template-${t.id}`}
            >
              <span class="emb-template__tag">{t.tag}</span>
              <strong>{t.label}</strong>
              <span class="emb-template__where">
                {t.layers.map((l) => getPreset(p.adapter, l.positionId)?.label).join(' · ')}
              </span>
            </button>
          ))}
        </div>
        {selected ? (
          <form
            class="emb-template-form"
            onSubmit={(e) => {
              e.preventDefault();
              p.onApply(selected, values);
              setSelectedId(null);
            }}
          >
            <p class="emb-field__hint">{selected.description}</p>
            <div class="emb-grid-2">
              {selected.fields.map((f) => (
                <label key={f.key} class="emb-template-form__field">
                  <span class="emb-field__label">{f.label}</span>
                  <input
                    type="text"
                    inputMode={f.kind === 'number' ? 'numeric' : 'text'}
                    value={values[f.key] ?? ''}
                    placeholder={f.placeholder}
                    maxLength={f.maxLength}
                    data-testid={`template-field-${f.key}`}
                    onInput={(e) => {
                      const v = cleanTemplateValue(f, (e.currentTarget as HTMLInputElement).value);
                      (e.currentTarget as HTMLInputElement).value = v;
                      setValues((old) => ({ ...old, [f.key]: v }));
                    }}
                  />
                </label>
              ))}
            </div>
            <div class="emb-section-head">
              <span class="emb-muted">
                Replaces your current designs. You can edit everything after.
              </span>
              <button
                type="submit"
                class="emb-btn emb-btn--primary emb-btn--sm"
                data-testid="template-apply"
              >
                Use template
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </details>
  );
}
