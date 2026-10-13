import {
  LIMITS,
  formatDimensions,
  getSurface,
  type ModelAdapter,
  type Placement,
  type PlacementId,
  type ResolvedPlacement,
} from '@embroidery/shared';
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
}

const cm = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)} cm`;

export function PlacementStep(p: Props) {
  const preset = p.adapter.placements.find((x) => x.id === p.placement.positionId);
  const options = p.adapter.placements.map((x) => {
    const surface = getSurface(p.adapter, x.surfaceId);
    const enabled = x.available && !!surface?.available && p.allowed.includes(x.id);
    const reason =
      !x.available || !surface?.available
        ? 'Not available on this model'
        : 'Not offered for this product';
    return {
      value: x.id,
      label: x.label,
      disabled: !enabled,
      description: enabled ? `Up to ${formatDimensions(x.maxWidthCm, x.maxHeightCm)}` : reason,
      title: enabled ? undefined : (x.unavailableReason ?? reason),
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
      <Choice
        label="Position"
        value={p.placement.positionId}
        variant="cards"
        testId="position-choice"
        onChange={p.onPosition}
        options={options}
      />

      {preset ? (
        <div class="emb-stack emb-stack--tight">
          <div class="emb-section-head">
            <p class="emb-field__label">Fine-tune</p>
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
          <p class="emb-field__hint">
            Tip: you can also drag the design directly on the 3D garment.
          </p>
          {p.resolved ? (
            <p class="emb-dims" data-testid="dimensions">
              Embroidery size:{' '}
              <strong>{formatDimensions(p.resolved.widthCm, p.resolved.heightCm)}</strong>
              <span> · max {formatDimensions(preset.maxWidthCm, preset.maxHeightCm)}</span>
            </p>
          ) : null}
          {p.resolved?.fitted ? (
            <Notice tone="info">
              Your design was scaled down to fit the {preset.label.toLowerCase()} area.
            </Notice>
          ) : null}
          {p.resolved?.adjusted ? (
            <Notice tone="warn" testId="adjusted-notice">
              Position adjusted to keep the design inside the stitchable area.
            </Notice>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
