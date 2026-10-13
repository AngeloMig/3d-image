import { useEffect, useRef, useState } from 'preact/hooks';
import type { ModelAdapter } from '@embroidery/shared';
import {
  GarmentViewer,
  type Facing,
  type GarmentInfo,
  type ViewerCallbacks,
} from '../engine/garmentViewer';
import { IconBack, IconFront, IconMinus, IconPlus, IconReset } from './icons';

export type ViewerStatus =
  | { state: 'loading'; progress: number }
  | { state: 'ready' }
  | { state: 'error'; message: string }
  | { state: 'unsupported'; message: string };

interface ViewerProps {
  adapter: ModelAdapter;
  modelUrl: string;
  onViewer: (viewer: GarmentViewer | null, info: GarmentInfo | null) => void;
  onDesignDrag: NonNullable<ViewerCallbacks['onDesignDrag']>;
  onFacingChange?: (facing: Facing) => void;
  designSurface: 'front' | 'back' | null;
  dragHint: boolean;
  modelLabel: string;
}

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export function Viewer(p: ViewerProps) {
  const stage = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<GarmentViewer | null>(null);
  const [status, setStatus] = useState<ViewerStatus>({ state: 'loading', progress: 0 });
  const [facing, setFacing] = useState<Facing>('front');
  const [attempt, setAttempt] = useState(0);
  // Keep latest callbacks without re-creating the WebGL renderer.
  const callbacks = useRef(p);
  callbacks.current = p;

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    if (!webglAvailable()) {
      setStatus({
        state: 'unsupported',
        message: 'Your browser can’t show the 3D preview (WebGL is unavailable).',
      });
      return;
    }
    let viewer: GarmentViewer;
    try {
      viewer = new GarmentViewer(el, p.adapter, {
        onProgress: (r) => setStatus({ state: 'loading', progress: r }),
        onFacingChange: (f) => {
          setFacing(f);
          callbacks.current.onFacingChange?.(f);
        },
        onDesignDrag: (dx, dy, phase) => callbacks.current.onDesignDrag(dx, dy, phase),
        onContextLost: () =>
          setStatus({
            state: 'error',
            message: 'The 3D preview was interrupted by the graphics driver.',
          }),
      });
    } catch (error) {
      console.error('[embroidery] WebGL init failed', error);
      setStatus({ state: 'unsupported', message: 'Your browser can’t show the 3D preview.' });
      return;
    }
    viewerRef.current = viewer;
    // Test hook: lets browser smoke tests inspect the live 3D scene (no-op for shoppers).
    (el as HTMLElement & { __embroideryViewer?: GarmentViewer }).__embroideryViewer = viewer;
    setStatus({ state: 'loading', progress: 0 });
    let cancelled = false;
    viewer
      .load(p.modelUrl)
      .then((info) => {
        if (cancelled) return;
        setStatus({ state: 'ready' });
        callbacks.current.onViewer(viewer, info);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error('[embroidery] Model failed to load', error);
        setStatus({
          state: 'error',
          message: 'We couldn’t load the 3D garment. Check your connection and retry.',
        });
      });
    return () => {
      cancelled = true;
      callbacks.current.onViewer(null, null);
      viewerRef.current = null;
      viewer.dispose();
    };
  }, [p.adapter, p.modelUrl, attempt]);

  const v = () => viewerRef.current;
  const ready = status.state === 'ready';

  const onKeyDown = (e: KeyboardEvent) => {
    const viewer = v();
    if (!viewer || !ready) return;
    const map: Record<string, () => void> = {
      ArrowLeft: () => viewer.rotateBy(-0.26),
      ArrowRight: () => viewer.rotateBy(0.26),
      ArrowUp: () => viewer.rotateBy(0, -0.12),
      ArrowDown: () => viewer.rotateBy(0, 0.12),
      '+': () => viewer.zoomBy(0.85),
      '=': () => viewer.zoomBy(0.85),
      '-': () => viewer.zoomBy(1.18),
      f: () => viewer.setView('front'),
      b: () => viewer.setView('back'),
      '0': () => viewer.setView('home'),
    };
    const action = map[e.key];
    if (action) {
      e.preventDefault();
      action();
    }
  };

  const showBackHint = ready && p.designSurface && facing !== p.designSurface;

  return (
    <div class="emb-viewer" data-testid="viewer" data-status={status.state}>
      <div
        ref={stage}
        class="emb-viewer__stage"
        tabIndex={0}
        role="img"
        aria-roledescription="3D preview"
        aria-label={`${p.modelLabel} with your embroidery. Use arrow keys to rotate, plus and minus to zoom, F for front, B for back, 0 to reset.`}
        onKeyDown={onKeyDown}
      />
      <div class="emb-viewer__floor" aria-hidden="true" />

      {status.state === 'loading' ? (
        <div class="emb-viewer__overlay" role="status">
          <span class="emb-spinner" aria-hidden="true" />
          <span>
            Loading 3D garment
            {status.progress > 0 ? ` · ${Math.round(status.progress * 100)}%` : '…'}
          </span>
        </div>
      ) : null}
      {status.state === 'error' || status.state === 'unsupported' ? (
        <div class="emb-viewer__overlay emb-viewer__overlay--error" role="alert">
          <strong>3D preview unavailable</strong>
          <span>{status.message}</span>
          {status.state === 'error' ? (
            <button
              type="button"
              class="emb-btn emb-btn--secondary emb-btn--sm"
              onClick={() => setAttempt((a) => a + 1)}
            >
              Retry
            </button>
          ) : (
            <span>You can still design your embroidery — the summary shows exact sizes.</span>
          )}
        </div>
      ) : null}

      <div class="emb-viewer__toolbar" role="toolbar" aria-label="3D view controls">
        <button
          type="button"
          class="emb-tool"
          onClick={() => v()?.setView('front')}
          disabled={!ready}
          aria-pressed={facing === 'front'}
        >
          <IconFront />
          <span>Front</span>
        </button>
        <button
          type="button"
          class="emb-tool"
          onClick={() => v()?.setView('back')}
          disabled={!ready}
          aria-pressed={facing === 'back'}
        >
          <IconBack />
          <span>Back</span>
        </button>
        <span class="emb-viewer__sep" aria-hidden="true" />
        <button
          type="button"
          class="emb-tool emb-tool--icon"
          onClick={() => v()?.zoomBy(0.82)}
          disabled={!ready}
          aria-label="Zoom in"
        >
          <IconPlus />
        </button>
        <button
          type="button"
          class="emb-tool emb-tool--icon"
          onClick={() => v()?.zoomBy(1.2)}
          disabled={!ready}
          aria-label="Zoom out"
        >
          <IconMinus />
        </button>
        <button
          type="button"
          class="emb-tool emb-tool--icon"
          onClick={() => v()?.setView('home')}
          disabled={!ready}
          aria-label="Reset view"
        >
          <IconReset />
        </button>
      </div>

      {ready ? (
        <p class="emb-viewer__hint" aria-hidden="true">
          {p.dragHint
            ? 'Drag the design to move it · drag the shirt to rotate'
            : 'Drag to rotate · scroll or pinch to zoom'}
        </p>
      ) : null}
      {showBackHint ? (
        <button
          type="button"
          class="emb-viewer__jump"
          onClick={() => v()?.setView(p.designSurface!)}
        >
          Your design is on the {p.designSurface} — show it
        </button>
      ) : null}
    </div>
  );
}
