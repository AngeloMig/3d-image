import { useState } from 'preact/hooks';
import {
  TEMPLATE_CATEGORIES,
  cleanTemplateValue,
  findFont,
  getPreset,
  textLines,
  type DesignTemplate,
  type ModelAdapter,
  type TemplateCategory,
} from '@embroidery/shared';
import { cssFontFamily } from '../engine/fonts';
import type { EditorLayer } from '../state/editorState';

/** A template being edited live on the garment. */
export interface TemplateSession {
  id: string;
  values: Record<string, string>;
}

interface Props {
  adapter: ModelAdapter;
  templates: readonly DesignTemplate[];
  /** Layers a template would produce on this garment (positions, fonts, sizes as applied). */
  layersOf: (template: DesignTemplate, values?: Record<string, string>) => EditorLayer[];
  /** Garment colour for the mini previews. */
  shirtHex: string;
  threadHex: (threadColorId: string) => string;
  /** "+$15.00" embroidery price of a template on this garment, or null. */
  priceOf: (template: DesignTemplate) => string | null;
  session: TemplateSession | null;
  onPick: (template: DesignTemplate) => void;
  onValues: (values: Record<string, string>) => void;
  onUndo: () => void;
  onDone: () => void;
  /** Start expanded (e.g. while the customer hasn't designed anything yet). */
  defaultOpen?: boolean;
}

/* ------------------------------------------------------------------ mini garment preview */

const TEE_FRONT = 'M36 7Q50 16 64 7L80 11L99 30L88 40L78 33L78 96L22 96L22 33L12 40L1 30L20 11Z';
const TEE_BACK = 'M36 7Q50 11 64 7L80 11L99 30L88 40L78 33L78 96L22 96L22 33L12 40L1 30L20 11Z';
const LONG_FRONT =
  'M36 7Q50 16 64 7L80 11L91 30L97 92L86 93L79 42L78 96L22 96L21 42L14 93L3 92L9 30L20 11Z';
const LONG_BACK =
  'M36 7Q50 11 64 7L80 11L91 30L97 92L86 93L79 42L78 96L22 96L21 42L14 93L3 92L9 30L20 11Z';

function luminance(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

/**
 * The template's text drawn on a flat garment at its real positions and fonts — front, plus the
 * back when the template uses it. Approximate (no curvature), meant for choosing at a glance.
 */
function TemplateThumb(p: {
  adapter: ModelAdapter;
  layers: EditorLayer[];
  shirtHex: string;
  threadHex: (id: string) => string;
}) {
  const long = p.adapter.id === 'long-sleeve';
  const svgPerCm = 100 / (p.adapter.expectedSize.x * 100);
  const sides = (['front', 'back'] as const).filter(
    (side) =>
      side === 'front' ||
      p.layers.some((l) => getPreset(p.adapter, l.placement.positionId)?.surfaceId === 'back'),
  );
  const darkShirt = luminance(p.shirtHex) < 0.5;
  return (
    <span class={`emb-tthumb${sides.length > 1 ? ' is-pair' : ''}`} aria-hidden="true">
      {sides.map((side) => (
        <svg key={side} viewBox="0 0 100 100" class="emb-tthumb__svg">
          <path
            d={side === 'front' ? (long ? LONG_FRONT : TEE_FRONT) : long ? LONG_BACK : TEE_BACK}
            fill={p.shirtHex}
            stroke="rgba(0,0,0,.14)"
            stroke-width="0.8"
            stroke-linejoin="round"
          />
          {p.layers.map((l) => {
            const preset = getPreset(p.adapter, l.placement.positionId);
            if (!preset || preset.surfaceId !== side) return null;
            if (l.activeDesign === 'image' && l.image?.previewUrl) {
              const w = l.image.scale * preset.maxWidthCm * svgPerCm;
              const lx = side === 'back' ? 100 - preset.anchor.x * 100 : preset.anchor.x * 100;
              const ly = 96 - preset.anchor.y * 90;
              return (
                <image
                  key={l.id}
                  href={l.image.previewUrl}
                  x={lx - w / 2}
                  y={ly - w / 2}
                  width={w}
                  height={w}
                />
              );
            }
            if (l.activeDesign !== 'text') return null;
            const lines = textLines(l.text.text);
            const font = findFont(l.text.fontId);
            const longest = Math.max(1, ...lines.map((x) => [...x].length));
            let size = l.text.sizeCm * svgPerCm * 1.35;
            const maxW = preset.maxWidthCm * svgPerCm;
            const maxH = preset.maxHeightCm * svgPerCm * 1.25;
            size = Math.min(size, maxW / (longest * 0.62), maxH / (lines.length * 1.1));
            // Keep the preview legible even when the chosen thread blends into the garment.
            let fill = p.threadHex(l.text.threadColorId);
            if (Math.abs(luminance(fill) - luminance(p.shirtHex)) < 0.25)
              fill = darkShirt ? '#f4f1e8' : '#1d1d1f';
            // Seen from behind, the wearer's left/right swap sides.
            const cx = side === 'back' ? 100 - preset.anchor.x * 100 : preset.anchor.x * 100;
            const cy = 96 - preset.anchor.y * 90;
            const top = cy - ((lines.length - 1) * size * 1.1) / 2;
            return (
              <text
                key={l.id}
                x={cx}
                y={top}
                fill={fill}
                font-size={size}
                font-family={font ? cssFontFamily(font) : 'sans-serif'}
                font-weight={font?.weight ?? 700}
                text-anchor="middle"
                dominant-baseline="central"
                letter-spacing={`${l.text.letterSpacing}em`}
              >
                {lines.map((line, i) => (
                  <tspan key={i} x={cx} dy={i === 0 ? 0 : size * 1.1}>
                    {line}
                  </tspan>
                ))}
              </text>
            );
          })}
        </svg>
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ picker */

/**
 * "Templates": pick a ready-made layout and it goes straight onto the 3D garment; the fields
 * below update it live as the customer types. Undo restores the design they had before.
 */
export function TemplatePicker(p: Props) {
  const [open, setOpen] = useState(!!p.defaultOpen || !!p.session);
  const [category, setCategory] = useState<TemplateCategory | 'All'>('All');
  if (!p.templates.length) return null;
  const categories = TEMPLATE_CATEGORIES.filter((c) => p.templates.some((t) => t.tag === c));
  const shown = p.templates.filter((t) => category === 'All' || t.tag === category);
  const active = p.session ? p.templates.find((t) => t.id === p.session!.id) : undefined;

  return (
    <section class={`emb-templates${open ? ' is-open' : ''}`} data-testid="templates">
      <button
        type="button"
        class="emb-templates__toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        data-testid="templates-toggle"
      >
        <span>
          <strong>Templates</strong>
          <span class="emb-muted"> · ready-made designs, just add your details</span>
        </span>
        <span class="emb-templates__chevron" aria-hidden="true" />
      </button>

      {open ? (
        <div class="emb-templates__body">
          {categories.length > 1 ? (
            <div class="emb-templates__cats" role="group" aria-label="Template categories">
              {(['All', ...categories] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  class={`emb-tcat${category === c ? ' is-on' : ''}`}
                  aria-pressed={category === c}
                  onClick={() => setCategory(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          ) : null}

          <div class="emb-templates__grid" role="list">
            {shown.map((t) => {
              const on = t.id === p.session?.id;
              const price = p.priceOf(t);
              return (
                <button
                  key={t.id}
                  type="button"
                  role="listitem"
                  class={`emb-template${on ? ' is-on' : ''}`}
                  aria-pressed={on}
                  onClick={() => p.onPick(t)}
                  data-testid={`template-${t.id}`}
                  title={t.description}
                >
                  <TemplateThumb
                    adapter={p.adapter}
                    layers={p.layersOf(t, on ? p.session!.values : undefined)}
                    shirtHex={p.shirtHex}
                    threadHex={p.threadHex}
                  />
                  <span class="emb-template__tag">{t.tag}</span>
                  <span class="emb-template__text">
                    <strong>{t.label}</strong>
                    {price ? <span class="emb-template__meta">{price}</span> : null}
                  </span>
                </button>
              );
            })}
          </div>

          {active && p.session ? (
            <div class="emb-template-form" data-testid="template-form">
              <p class="emb-template-form__title">
                <strong>{active.label}</strong>
                <span class="emb-muted"> — changes show on the 3D shirt as you type</span>
              </p>
              <div class="emb-template-form__fields">
                {active.fields.map((f) => (
                  <label key={f.key} class="emb-template-form__field">
                    <span class="emb-field__label">{f.label}</span>
                    <input
                      type="text"
                      inputMode={f.kind === 'number' ? 'numeric' : 'text'}
                      value={p.session!.values[f.key] ?? ''}
                      placeholder={f.placeholder}
                      maxLength={f.maxLength}
                      data-testid={`template-field-${f.key}`}
                      onInput={(e) => {
                        const el = e.currentTarget as HTMLInputElement;
                        const v = cleanTemplateValue(f, el.value);
                        el.value = v;
                        p.onValues({ ...p.session!.values, [f.key]: v });
                      }}
                    />
                  </label>
                ))}
              </div>
              <div class="emb-template-form__actions">
                <button
                  type="button"
                  class="emb-link"
                  onClick={p.onUndo}
                  data-testid="template-undo"
                >
                  Undo template
                </button>
                <button
                  type="button"
                  class="emb-btn emb-btn--primary emb-btn--sm"
                  onClick={() => {
                    p.onDone();
                    setOpen(false);
                  }}
                  data-testid="template-apply"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <p class="emb-field__hint emb-templates__hint">
              Tap a template to try it on the shirt. You can undo it or edit every detail after.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
