import { useRef, useState } from 'preact/hooks';
import {
  FONTS,
  LIMITS,
  THREAD_COLORS,
  formatBytes,
  formatCm,
  normalizeText,
  validateText,
  type ImageDesign,
  type TextAlignment,
  type TextDesign,
} from '@embroidery/shared';
import { cssFontFamily } from '../engine/fonts';
import { Choice, Field, Notice, Slider } from './controls';
import {
  IconAlignCenter,
  IconAlignLeft,
  IconAlignRight,
  IconImage,
  IconText,
  IconUpload,
} from './icons';

interface Props {
  activeDesign: 'text' | 'image';
  text: TextDesign;
  image: ImageDesign | null;
  fontIds: string[];
  threadColorIds: string[];
  maxUploadBytes: number;
  lowContrast: boolean;
  fitted: boolean;
  onDesignType: (t: 'text' | 'image') => void;
  onText: (patch: Partial<Omit<TextDesign, 'type'>>) => void;
  onImageScale: (scale: number) => void;
  onUpload: (file: File) => Promise<string | null>;
  onRemoveImage: () => void;
}

export function DesignStep(p: Props) {
  return (
    <div class="emb-stack">
      <Choice
        label="Design type"
        hideLabel
        value={p.activeDesign}
        onChange={p.onDesignType}
        variant="segmented"
        testId="design-type"
        options={[
          {
            value: 'text',
            label: 'Text',
            content: (
              <span class="emb-choice__label">
                <IconText /> Text
              </span>
            ),
          },
          {
            value: 'image',
            label: 'Upload Logo/Image',
            content: (
              <span class="emb-choice__label">
                <IconImage /> Upload Logo/Image
              </span>
            ),
          },
        ]}
      />
      {p.activeDesign === 'text' ? <TextPanel {...p} /> : <ImagePanel {...p} />}
    </div>
  );
}

function TextPanel(p: Props) {
  const issues = validateText(p.text.text);
  const lines = normalizeText(p.text.text).split('\n');
  const fonts = FONTS.filter((f) => p.fontIds.includes(f.id));
  const threads = THREAD_COLORS.filter((c) => p.threadColorIds.includes(c.id));
  const multiLine = lines.length > 1;
  return (
    <>
      <Field
        label="Your text"
        error={issues[0]?.message ?? null}
        hint={`Up to ${LIMITS.maxLines} lines · ${LIMITS.maxCharsPerLine} characters per line. Press Enter for a second line.`}
      >
        <div class="emb-textarea">
          <textarea
            rows={2}
            value={p.text.text}
            aria-label="Embroidery text"
            aria-invalid={issues.length > 0}
            data-testid="text-input"
            spellcheck={false}
            autocomplete="off"
            onInput={(e) => {
              const raw = (e.currentTarget as HTMLTextAreaElement).value;
              // Hard stop at 3 lines so the validation message stays readable.
              p.onText({
                text: raw
                  .split('\n')
                  .slice(0, LIMITS.maxLines + 1)
                  .join('\n'),
              });
            }}
          />
          <span class="emb-textarea__count" aria-live="polite">
            {lines.map((l) => [...l.trim()].length).join(' / ')} / {LIMITS.maxCharsPerLine}
          </span>
        </div>
      </Field>

      <Choice
        label="Font"
        value={p.text.fontId}
        variant="cards"
        testId="font-choice"
        onChange={(fontId) => p.onText({ fontId })}
        options={fonts.map((f) => ({
          value: f.id,
          label: f.label,
          content: (
            <>
              <span
                class="emb-font-sample"
                style={{ fontFamily: cssFontFamily(f), fontWeight: f.weight }}
              >
                {f.sample}
              </span>
              <span class="emb-choice__label">{f.label}</span>
            </>
          ),
        }))}
      />

      <Choice
        label={`Thread colour: ${threads.find((t) => t.id === p.text.threadColorId)?.label ?? ''}`}
        value={p.text.threadColorId}
        variant="swatches"
        testId="thread-choice"
        onChange={(threadColorId) => p.onText({ threadColorId })}
        options={threads.map((t) => ({
          value: t.id,
          label: t.label,
          title: t.label,
          content: (
            <span class="emb-swatch emb-swatch--thread" style={{ background: t.hex }}>
              <span class="emb-sr-only">{t.label}</span>
            </span>
          ),
        }))}
      />
      {p.lowContrast ? (
        <Notice tone="warn" testId="contrast-warning">
          This thread colour is very close to the garment colour and may be hard to see.
        </Notice>
      ) : null}

      <div class="emb-grid-2">
        <Slider
          label="Letter height"
          value={p.text.sizeCm}
          min={LIMITS.minTextSizeCm}
          max={LIMITS.maxTextSizeCm}
          step={0.1}
          format={formatCm}
          testId="text-size"
          onInput={(sizeCm) => p.onText({ sizeCm })}
        />
        <Slider
          label="Letter spacing"
          value={p.text.letterSpacing}
          min={LIMITS.minLetterSpacing}
          max={LIMITS.maxLetterSpacing}
          step={0.01}
          format={(v) => (v === 0 ? 'Normal' : `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`)}
          onInput={(letterSpacing) => p.onText({ letterSpacing })}
        />
      </div>
      {p.fitted ? (
        <Notice tone="info" testId="fitted-notice">
          Scaled down to fit this position’s embroidery area. Choose a larger position or shorten
          the text for bigger letters.
        </Notice>
      ) : null}

      <Choice
        label={multiLine ? 'Alignment' : 'Alignment (for two lines)'}
        value={p.text.alignment}
        variant="segmented"
        onChange={(alignment: TextAlignment) => p.onText({ alignment })}
        options={[
          { value: 'left', label: 'Align left', content: <IconAlignLeft /> },
          { value: 'center', label: 'Align center', content: <IconAlignCenter /> },
          { value: 'right', label: 'Align right', content: <IconAlignRight /> },
        ]}
      />
    </>
  );
}

function ImagePanel(p: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const maxMb = (p.maxUploadBytes / 1024 / 1024).toFixed(0);

  const handle = async (file: File | undefined | null) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    const message = await p.onUpload(file);
    setBusy(false);
    setError(message);
    if (input.current) input.current.value = '';
  };

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        class="emb-sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="file-input"
        onChange={(e) => void handle((e.currentTarget as HTMLInputElement).files?.[0])}
      />
      {p.image ? (
        <div class="emb-artwork" data-testid="artwork-card">
          {p.image.previewUrl ? (
            <img src={p.image.previewUrl} alt="" class="emb-artwork__thumb" />
          ) : (
            <span class="emb-artwork__thumb" />
          )}
          <div class="emb-artwork__meta">
            <p class="emb-artwork__name" title={p.image.originalFilename}>
              {p.image.originalFilename}
            </p>
            <p class="emb-field__hint">
              {p.image.mimeType.replace('image/', '').toUpperCase()} ·{' '}
              {formatBytes(p.image.byteSize)} · {p.image.widthPx}×{p.image.heightPx}px
            </p>
            <div class="emb-row">
              <button
                type="button"
                class="emb-btn emb-btn--secondary emb-btn--sm"
                onClick={() => input.current?.click()}
                disabled={busy}
              >
                Replace
              </button>
              <button
                type="button"
                class="emb-btn emb-btn--ghost emb-btn--sm"
                onClick={p.onRemoveImage}
                disabled={busy}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          class={`emb-drop${dragOver ? ' is-over' : ''}`}
          data-testid="dropzone"
          disabled={busy}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void handle(e.dataTransfer?.files?.[0]);
          }}
        >
          <IconUpload />
          <strong>{busy ? 'Checking file…' : 'Upload your logo or image'}</strong>
          <span>PNG, JPEG or WebP · up to {maxMb} MB · transparent PNGs work best</span>
        </button>
      )}
      {error ? (
        <p class="emb-field__error" role="alert" data-testid="upload-error">
          {error}
        </p>
      ) : null}
      {p.image ? (
        <Slider
          label="Artwork size"
          value={p.image.scale}
          min={LIMITS.minImageScale}
          max={LIMITS.maxImageScale}
          step={0.01}
          format={(v) => `${Math.round(v * 100)}% of area`}
          testId="image-scale"
          onInput={p.onImageScale}
        />
      ) : null}
      <Notice tone="info">
        Uploaded artwork is a visual preview. Our team digitizes it into an embroidery stitch file
        before production and will contact you if anything can’t be stitched cleanly.
      </Notice>
    </>
  );
}
