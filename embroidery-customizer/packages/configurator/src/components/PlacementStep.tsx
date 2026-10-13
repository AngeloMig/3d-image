import {
  LIMITS,
  formatDimensions,
  getSurface,
  type ModelAdapter,
  type Placement,
  type PlacementId,
  type ResolvedPlacement,
} from '@embroidery/shared';
import type { ComponentChildren } from 'preact';
import { Choice, Notice, Slider } from './controls';
import { PlacementGlyph } from './icons';

interface Props {
  adapter: ModelAdapter;
  placement: Placement;
  allowed: PlacementId[];
  resolved: ResolvedPlacement | null;
  onPosition: (id: PlacementId) => void;
  onPatch: (
    patch: Partial<Pick<Placement, 'offsetXCm' | 'offsetYCm' | 'rotationDeg' | 'scale'>>,
  ) => void;
  /** Positions unavailable because another design uses them (or an overlapping spot) → reason. */
  usedBy?: Partial<Record<PlacementId, string>>;
  header?: ComponentChildren;
  sizeHint?: string | null;
}

const cm = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)} cm`;

export function PlacementStep(p: Props) {
  const preset = p.adapter.placements.find((x) => x.id === p.placement.positionId);
  // Positions this garment can't take at all (e.g. uncalibrated sleeves) collapse into one note.
  const offered = p.adapter.placements.filter(
    (x) =>
      x.available && !!getSurface(p.adapter, x.surfaceId)?.available && p.allowed.includes(x.id),
  );
  const unavailable = p.adapter.placements.filter((x) => !offered.includes(x));
  const options = offered.map((x) => {
    const takenBy = p.usedBy?.[x.id];
    return {
      value: x.id,
      label: x.label,
      disabled: !!takenBy,
      title: takenBy ?? `Up to ${formatDimensions(x.maxWidthCm, x.maxHeightCm)}`,
      content: (
        <>
          <PlacementGlyph x={x.anchor.x} y={x.anchor.y} back={x.surfaceId === 'back'} />
          <span class="emb-choice__label">{x.label}</span>
        </>
      ),
    };
  });

  return (
    <div class="emb-stack">
      {p.header}
      <Choice
        label="Position"
        value={p.placement.positionId}
        variant="pills"
        testId="position-choice"
        onChange={p.onPosition}
        options={options}
      />
      {unavailable.length ? (
        <p class="emb-field__hint emb-placement-note" data-testid="unavailable-positions">
          {unavailable.map((x) => x.label).join(' and ')}: coming soon for this garment.
        </p>
      ) : null}
      {preset && p.resolved ? (
        <p class="emb-dims" data-testid="dimensions">
          Embroidery size{' '}
          <strong>{formatDimensions(p.resolved.widthCm, p.resolved.heightCm)}</strong>
          <span> · max {formatDimensions(preset.maxWidthCm, preset.maxHeightCm)}</span>
          {p.resolved.fitted ? <span> · scaled to fit</span> : null}
        </p>
      ) : null}

      {preset ? (
        <details class="emb-finetune">
          <summary>
            <span>Fine-tune position, size &amp; rotation</span>
          </summary>
          <div class="emb-stack emb-stack--tight">
            <div class="emb-section-head">
              <p class="emb-field__hint">Or drag the design on the 3D garment.</p>
              <button
                type="button"
                class="emb-btn emb-btn--ghost emb-btn--sm"
                onClick={() => p.onPatch({ offsetXCm: 0, offsetYCm: 0, rotationDeg: 0, scale: 1 })}
              >
                Re-center
              </button>
            </div>
            <div class="emb-grid-2">
              <Slider
                label="Left / right"
                value={p.placement.offsetXCm}
                min={-preset.maxOffsetCm.x}
                max={preset.maxOffsetCm.x}
                step={0.1}
                format={cm}
                testId="offset-x"
                onInput={(offsetXCm) => p.onPatch({ offsetXCm })}
              />
              <Slider
                label="Up / down"
                value={p.placement.offsetYCm}
                min={-preset.maxOffsetCm.y}
                max={preset.maxOffsetCm.y}
                step={0.1}
                format={cm}
                testId="offset-y"
                onInput={(offsetYCm) => p.onPatch({ offsetYCm })}
              />
              <Slider
                label="Scale"
                value={p.placement.scale}
                min={LIMITS.minPlacementScale}
                max={LIMITS.maxPlacementScale}
                step={0.01}
                format={(v) => `${Math.round(v * 100)}%`}
                testId="placement-scale"
                hint={p.sizeHint ?? undefined}
                onInput={(scale) => p.onPatch({ scale })}
              />
              <Slider
                label="Rotation"
                value={p.placement.rotationDeg}
                min={-LIMITS.maxRotationDeg}
                max={LIMITS.maxRotationDeg}
                step={1}
                format={(v) => `${v}°`}
                testId="rotation"
                onInput={(rotationDeg) => p.onPatch({ rotationDeg })}
              />
            </div>
            {p.resolved?.adjusted ? (
              <Notice tone="warn" testId="adjusted-notice">
                Position adjusted to keep the design inside the stitchable area.
              </Notice>
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}
