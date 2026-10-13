import { expect, type Page } from '@playwright/test';

export interface DebugState {
  loaded: boolean;
  theta: number;
  facing: string;
  decalVisible: boolean;
  decalTriangles: number;
  decalCenter: [number, number, number] | null;
  tint: { mix: number; color: string }[];
}

/** Reads the live Three.js scene state through the viewer's test hook. */
export async function viewerState(page: Page, host: string): Promise<DebugState> {
  return page.evaluate((sel) => {
    const el = document
      .querySelector(sel)!
      .shadowRoot!.querySelector('.emb-viewer__stage') as HTMLElement & {
      __embroideryViewer: { debugState(): unknown };
    };
    return el.__embroideryViewer.debugState();
  }, host) as Promise<DebugState>;
}

export async function waitForViewer(page: Page): Promise<void> {
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-status', 'ready', {
    timeout: 90_000,
  });
}

/** Collects uncaught errors + console errors for the whole test. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return errors;
}

export async function viewerAction(page: Page, host: string, action: string): Promise<void> {
  await page.evaluate(
    ([sel, a]) => {
      const el = document
        .querySelector(sel!)!
        .shadowRoot!.querySelector('.emb-viewer__stage') as HTMLElement & {
        __embroideryViewer: Record<string, (...args: unknown[]) => void>;
      };
      new Function('v', a!)(el.__embroideryViewer);
    },
    [host, action],
  );
}

export async function pngLogo(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 300;
    c.height = 200;
    const g = c.getContext('2d')!;
    g.fillStyle = '#c0392b';
    g.fillRect(20, 20, 260, 160);
    g.fillStyle = '#fff';
    g.font = 'bold 90px sans-serif';
    g.fillText('LOGO', 40, 130);
    return c.toDataURL('image/png').split(',')[1]!;
  });
  return Buffer.from(b64, 'base64');
}
