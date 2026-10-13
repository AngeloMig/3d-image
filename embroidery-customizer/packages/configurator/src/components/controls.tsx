import type { ComponentChildren, JSX } from 'preact';
import { useId } from 'preact/hooks';

export function Field(props: {
  label: string;
  hint?: string;
  error?: string | null;
  children: ComponentChildren;
  id?: string;
}) {
  return (
    <div class={`emb-field${props.error ? ' emb-field--error' : ''}`}>
      <div class="emb-field__label" id={props.id}>
        {props.label}
      </div>
      {props.children}
      {props.error ? (
        <p class="emb-field__error" role="alert">
          {props.error}
        </p>
      ) : props.hint ? (
        <p class="emb-field__hint">{props.hint}</p>
      ) : null}
    </div>
  );
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onInput: (v: number) => void;
  hint?: string;
  disabled?: boolean;
  testId?: string;
}

export function Slider(p: SliderProps) {
  const id = useId();
  return (
    <div class="emb-slider">
      <div class="emb-slider__head">
        <label for={id}>{p.label}</label>
        <output for={id}>{p.format(p.value)}</output>
      </div>
      <input
        id={id}
        type="range"
        min={p.min}
        max={p.max}
        step={p.step}
        value={p.value}
        disabled={p.disabled}
        data-testid={p.testId}
        aria-valuetext={p.format(p.value)}
        style={
          { '--emb-fill': `${((p.value - p.min) / (p.max - p.min)) * 100}%` } as JSX.CSSProperties
        }
        onInput={(e) => p.onInput(Number((e.currentTarget as HTMLInputElement).value))}
      />
      {p.hint ? <p class="emb-field__hint">{p.hint}</p> : null}
    </div>
  );
}

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
  description?: string;
  content?: ComponentChildren;
  title?: string;
}

/** Radio group rendered as buttons; arrow keys move the selection (roving tabindex). */
export function Choice<T extends string>(p: {
  label: string;
  value: T;
  options: ChoiceOption<T>[];
  onChange: (v: T) => void;
  variant?: 'segmented' | 'cards' | 'swatches' | 'chips' | 'pills';
  hideLabel?: boolean;
  testId?: string;
}) {
  const labelId = useId();
  const enabled = p.options.filter((o) => !o.disabled);
  const onKeyDown = (e: KeyboardEvent) => {
    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
    const idx = enabled.findIndex((o) => o.value === p.value);
    const next = enabled[(idx + dir + enabled.length) % enabled.length];
    if (!next) return;
    p.onChange(next.value);
    const group = e.currentTarget as HTMLElement;
    requestAnimationFrame(() =>
      group.querySelector<HTMLElement>(`[data-value="${CSS.escape(next.value)}"]`)?.focus(),
    );
  };
  return (
    <div class="emb-choice-wrap">
      <div class={`emb-field__label${p.hideLabel ? ' emb-sr-only' : ''}`} id={labelId}>
        {p.label}
      </div>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        class={`emb-choice emb-choice--${p.variant ?? 'segmented'}`}
        onKeyDown={onKeyDown}
        data-testid={p.testId}
      >
        {p.options.map((o) => {
          const checked = o.value === p.value;
          return (
            <button
              type="button"
              role="radio"
              key={o.value}
              data-value={o.value}
              aria-checked={checked}
              aria-disabled={o.disabled || undefined}
              aria-label={o.content && !o.description ? o.label : undefined}
              title={o.title ?? (o.disabled ? o.description : undefined)}
              tabIndex={
                checked || (!enabled.some((x) => x.value === p.value) && o === enabled[0]) ? 0 : -1
              }
              class={`emb-choice__item${checked ? ' is-checked' : ''}${o.disabled ? ' is-disabled' : ''}`}
              onClick={() => !o.disabled && p.onChange(o.value)}
            >
              {o.content ?? <span class="emb-choice__label">{o.label}</span>}
              {o.description && p.variant === 'cards' ? (
                <span class="emb-choice__desc">{o.description}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Notice(p: {
  tone?: 'info' | 'warn' | 'error' | 'success';
  children: ComponentChildren;
  testId?: string;
}) {
  return (
    <div class={`emb-notice emb-notice--${p.tone ?? 'info'}`} data-testid={p.testId}>
      {p.children}
    </div>
  );
}
