import { render } from 'preact';
import styles from './styles.css?inline';
import { Configurator, type ConfiguratorProps } from './components/Configurator';

export interface MountHandle {
  update(next: Partial<ConfiguratorProps>): void;
  unmount(): void;
}

/**
 * Mounts the configurator into `host`. By default it renders inside a shadow root so the
 * merchant theme's CSS and ours can't interfere with each other.
 */
export function mountConfigurator(
  host: HTMLElement,
  props: ConfiguratorProps,
  opts: { shadow?: boolean } = {},
): MountHandle {
  const root: HTMLElement | ShadowRoot =
    opts.shadow === false ? host : (host.shadowRoot ?? host.attachShadow({ mode: 'open' }));
  const style = document.createElement('style');
  style.textContent = styles;
  const container = document.createElement('div');
  container.className = 'emb-host';
  root.append(style, container);

  let current = props;
  let scheduled = false;
  let mounted = true;
  // Render in a microtask: callers often mount/update from another Preact tree's effects, and
  // Preact may flush those effects synchronously mid-render. A nested render() there would swap
  // the hooks' "current component" and corrupt state, so we always render after that task ends.
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      if (mounted) render(<Configurator {...current} />, container);
    });
  };
  schedule();
  return {
    update(next) {
      current = { ...current, ...next };
      schedule();
    },
    unmount() {
      mounted = false;
      render(null, container);
      container.remove();
      style.remove();
    },
  };
}
