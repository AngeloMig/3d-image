import { expect, test } from '@playwright/test';
import { pngLogo, trackErrors, viewerAction, viewerState, waitForViewer } from './helpers';

const HOST = '.demo-configurator';

// Each test runs in a fresh browser context (empty localStorage / IndexedDB).
let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = trackErrors(page);
  await page.goto('/');
  await waitForViewer(page);
});
test.afterEach(() => {
  expect(errors, 'no console errors or uncaught exceptions').toEqual([]);
});

test('shows the real rotatable 3D shirt with YOUR NAME on the left chest @mobile', async ({
  page,
}) => {
  await expect.poll(async () => (await viewerState(page, HOST)).decalVisible).toBe(true);
  const s = await viewerState(page, HOST);
  expect(s.loaded).toBe(true);
  expect(s.decalTriangles).toBeGreaterThan(10);
  // left chest = wearer's left = +X, upper torso, front (+Z)
  expect(s.decalCenter![0]).toBeGreaterThan(0.04);
  expect(s.decalCenter![1]).toBeGreaterThan(0.08);
  expect(s.decalCenter![2]).toBeGreaterThan(0);
  // rotating the camera does not move the embroidery (it lives on the surface)
  await viewerAction(page, HOST, 'v.rotateBy(1.2)');
  const after = await viewerState(page, HOST);
  expect(after.theta).not.toBeCloseTo(s.theta, 2);
  expect(after.decalCenter).toEqual(s.decalCenter);
});

test('text edits, thread colour and garment colour update the live preview', async ({ page }) => {
  await page.getByTestId('option-color').getByRole('radio', { name: 'Black' }).click();
  expect((await viewerState(page, HOST)).tint[0]).toEqual({ mix: 1, color: '232325' });

  await page.getByTestId('continue').click();
  const before = await viewerState(page, HOST);
  await page.getByTestId('text-input').fill('JO');
  await expect
    .poll(async () => (await viewerState(page, HOST)).decalTriangles)
    .not.toBe(before.decalTriangles);
  await page.getByTestId('thread-choice').getByRole('radio', { name: 'Gold' }).click();
  await page.getByTestId('text-input').fill('HELLO 😀');
  await expect(page.getByRole('alert').first()).toContainText("can't be embroidered");
  await page.getByTestId('continue').click();
  await expect(page.getByTestId('step-error')).toBeVisible();
});

test('every enabled position moves the design to a distinct place, back included', async ({
  page,
}) => {
  await page.getByTestId('step-3').click();
  const centers: Record<string, number[]> = {};
  for (const id of ['left_chest', 'center_chest', 'right_chest', 'upper_back', 'center_back']) {
    await page.getByTestId('position-choice').locator(`[data-value="${id}"]`).click();
    await expect
      .poll(async () => JSON.stringify((await viewerState(page, HOST)).decalCenter))
      .not.toBe(JSON.stringify(centers[Object.keys(centers).at(-1) ?? ''] ?? null));
    centers[id] = (await viewerState(page, HOST)).decalCenter!;
  }
  expect(centers.left_chest![0]).toBeGreaterThan(centers.center_chest![0]! + 0.04);
  expect(centers.right_chest![0]).toBeLessThan(centers.center_chest![0]! - 0.04);
  expect(centers.upper_back![2]).toBeLessThan(0);
  expect(centers.center_back![2]).toBeLessThan(0);
  expect(centers.upper_back![1]).toBeGreaterThan(centers.center_back![1]!);
  await expect.poll(async () => (await viewerState(page, HOST)).facing).toBe('back');
  await expect(
    page.getByTestId('position-choice').locator('[data-value="left_sleeve"]'),
  ).toHaveAttribute('aria-disabled', 'true');
});

test('image upload: valid artwork lands on the shirt, invalid files are rejected', async ({
  page,
}) => {
  await page.getByTestId('step-2').click();
  await page.getByTestId('design-type').getByRole('radio', { name: 'Upload Logo/Image' }).click();
  const input = page.getByTestId('file-input');
  await input.setInputFiles({
    name: 'notes.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not an image'),
  });
  await expect(page.getByTestId('upload-error')).toContainText('Unsupported file');
  await input.setInputFiles({
    name: 'huge.png',
    mimeType: 'image/png',
    buffer: Buffer.alloc(6 * 1024 * 1024),
  });
  await expect(page.getByTestId('upload-error')).toContainText('limit is 5 MB');
  await input.setInputFiles({
    name: 'logo.png',
    mimeType: 'image/png',
    buffer: await pngLogo(page),
  });
  await expect(page.getByTestId('artwork-card')).toContainText('logo.png');
  await expect.poll(async () => (await viewerState(page, HOST)).decalVisible).toBe(true);
});

test('demo cart keeps configurations distinct and edits only the target line', async ({ page }) => {
  await page.getByTestId('step-4').click();
  await expect(page.getByTestId('caveat')).toHaveText(
    'Visual preview only; actual stitch appearance may vary.',
  );
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('cart-count')).toHaveText('1');

  await page.getByTestId('step-2').click();
  await page.getByTestId('text-input').fill('SECOND');
  await page.getByTestId('step-4').click();
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('cart-count')).toHaveText('2');

  await page.getByTestId('open-cart').click();
  await expect(page.getByTestId('cart-line')).toHaveCount(2);
  await page.getByTestId('edit-line').first().click();
  await expect(page.getByTestId('editing-banner')).toBeVisible();
  await page.getByTestId('step-2').click();
  await expect(page.getByTestId('text-input')).toHaveValue('YOUR NAME');
  await page.getByTestId('text-input').fill('EDITED');
  await page.getByTestId('step-4').click();
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('cart-drawer')).toBeVisible();
  const lines = page.getByTestId('cart-line');
  await expect(lines).toHaveCount(2);
  await expect(lines.nth(0)).toContainText('EDITED');
  await expect(lines.nth(1)).toContainText('SECOND');
});

test('works on a phone without horizontal scrolling @mobile', async ({ page }) => {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByTestId('continue').click();
  await page.getByTestId('text-input').fill('PHONE');
  await page.getByTestId('continue').click();
  await page.getByTestId('position-choice').locator('[data-value="center_chest"]').click();
  await page.getByTestId('continue').click();
  await expect(page.getByTestId('add-to-cart')).toBeInViewport();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
  ).toBeLessThanOrEqual(0);
});

test('keyboard: radio groups respond to arrow keys and steps are reachable', async ({ page }) => {
  const size = page.getByTestId('option-size').getByRole('radio', { name: 'S' });
  await size.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('option-size').getByRole('radio', { name: 'M' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.getByTestId('step-2').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('text-input')).toBeVisible();
});
