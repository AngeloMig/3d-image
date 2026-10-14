import { expect, test, type Page } from '@playwright/test';
import { trackErrors, viewerState, waitForViewer } from './helpers';

const HOST = '.demo-configurator';
let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = trackErrors(page);
  await page.goto('/');
  await waitForViewer(page);
});
test.afterEach(() => {
  expect(errors, 'no console errors or uncaught exceptions').toEqual([]);
});

async function addBackName(page: Page, text: string) {
  await page.getByTestId('step-2').click();
  await page.getByTestId('add-layer').click();
  await page.getByTestId('text-input').fill(text);
  await page.getByTestId('step-3').click();
  await page.getByTestId('position-choice').locator('[data-value="upper_back"]').click();
}

test('multiple designs: chest + back are both stitched, priced and carried into the cart', async ({
  page,
}) => {
  await addBackName(page, 'CAPTAIN');
  await expect(
    page.getByTestId('position-choice').locator('[data-value="left_chest"]'),
  ).toHaveAttribute('aria-disabled', 'true');
  await expect.poll(async () => (await viewerState(page, HOST)).decals?.length).toBe(2);
  const s = await viewerState(page, HOST);
  const zs = (s as unknown as { decals: { center: number[] }[] }).decals.map((d) => d.center[2]!);
  expect(zs.some((z) => z > 0) && zs.some((z) => z < 0)).toBe(true); // one front, one back

  await page.getByTestId('step-4').click();
  await expect(page.getByTestId('review-summary')).toContainText('CAPTAIN');
  await expect(page.getByTestId('price-summary')).toContainText('Text embroidery × 2');
  // $32 shirt + 2 × $5 text, plus a size fee when the back name is 10 cm+ wide
  await expect(page.getByTestId('price-total')).toHaveText(/^\$4[2-8]\.00$/);
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('cart-count')).toHaveText('1');
  await page.getByTestId('open-cart').click();
  const line = page.getByTestId('cart-line');
  await expect(line).toContainText('Design 2 – Placement');
  await expect(line).toContainText('Upper Back');
  await expect(page.getByTestId('fee-line').first()).toContainText(
    'Embroidery fee — Text embroidery × 2',
  );
});

test('team order: one design, a name and size per person, added as separate lines', async ({
  page,
}) => {
  await addBackName(page, 'NAME');
  await page.getByTestId('step-4').click();
  await page.getByTestId('order-mode').getByRole('radio', { name: 'Team / bulk order' }).click();
  await expect(
    page.getByTestId('team-personalize').getByRole('radio', { name: 'Upper Back' }),
  ).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('team-add-row').click();
  await page.getByTestId('team-add-row').click();
  const names = page.getByTestId('team-text');
  await names.nth(0).fill('ALEX');
  await names.nth(1).fill('SAM');
  await names.nth(2).fill('JORDAN');
  await page.getByTestId('team-row').nth(1).locator('select').selectOption('L');
  await expect(page.getByTestId('price-total')).toHaveText(/^\$1[2-4]\d\.00$/);
  await expect(page.getByTestId('add-to-cart')).toHaveText(/Add 3 to Cart/);
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('cart-count')).toHaveText('3');
  await page.getByTestId('open-cart').click();
  const lines = page.getByTestId('cart-line');
  await expect(lines).toHaveCount(3);
  await expect(lines.nth(1)).toContainText('L / White'); // default garment colour
  for (const [i, n] of ['ALEX', 'SAM', 'JORDAN'].entries()) {
    await expect(lines.nth(i)).toContainText(n);
    await expect(lines.nth(i)).toContainText(`(${i + 1} of 3)`);
  }
});

test('logo background removal keeps the logo and drops the white background', async ({ page }) => {
  await page.getByTestId('step-2').click();
  await page.getByTestId('design-type').getByRole('radio', { name: 'Upload Logo/Image' }).click();
  const jpeg = Buffer.from(
    await page.evaluate(async () => {
      const c = document.createElement('canvas');
      c.width = 240;
      c.height = 240;
      const g = c.getContext('2d')!;
      g.fillStyle = '#fff';
      g.fillRect(0, 0, 240, 240);
      g.fillStyle = '#1b4fd6';
      g.beginPath();
      g.arc(120, 120, 90, 0, Math.PI * 2);
      g.fill();
      return c.toDataURL('image/jpeg', 0.95).split(',')[1]!;
    }),
    'base64',
  );
  await page
    .getByTestId('file-input')
    .setInputFiles({ name: 'club.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await expect(page.getByTestId('artwork-card')).toContainText('JPEG');
  await page.getByTestId('remove-background').click();
  await expect(page.getByTestId('background-control')).toContainText('Background removed');
  await expect(page.getByTestId('artwork-card')).toContainText('PNG');
  await page.getByTestId('step-4').click();
  await expect(page.getByTestId('review-summary')).toContainText('(background removed)');
});

test('save & share: the link reopens the same design', async ({ page, context }) => {
  await addBackName(page, 'SHARED');
  await page.getByTestId('step-4').click();
  await page.getByTestId('share-button').click();
  const url = await page.getByTestId('share-url').inputValue();
  expect(url).toContain('embroidery_design=');
  const other = await context.newPage(); // same browser profile → demo IndexedDB is shared
  await other.goto(url);
  await waitForViewer(other);
  await expect(other.getByTestId('toast')).toContainText('Shared design loaded');
  await other.getByTestId('step-4').click();
  await expect(other.getByTestId('review-summary')).toContainText('SHARED');
  await expect(other.getByTestId('review-summary')).toContainText('Upper Back');
  await other.close();
});

test('live price on every step reacts to size, font, style and an added logo', async ({ page }) => {
  const total = () => page.getByTestId('price-bar-total').textContent();
  const money = async () => Number((await total())!.replace(/[^0-9.]/g, ''));
  await expect(page.getByTestId('price-bar')).toBeVisible(); // product step
  const start = await money();
  expect(start).toBe(37); // $32 + $5 text

  await page.getByTestId('step-3').click();
  await page.getByTestId('position-choice').locator('[data-value="center_chest"]').click();
  await page.getByTestId('step-2').click();
  await page.getByTestId('text-size').fill('3');
  await expect(page.getByTestId('text-size').locator('xpath=..')).toContainText('Large size');
  await expect.poll(money).toBe(start + 6);

  await page.getByTestId('font-choice').locator('[data-value="script"]').click();
  await expect.poll(money).toBe(start + 6 + 2);
  await page.getByTestId('style-choice').locator('[data-value="puff"]').click();
  await expect.poll(money).toBe(start + 6 + 2 + 4);

  await page.getByTestId('add-layer').click();
  await page.getByTestId('design-type').getByRole('radio', { name: 'Upload Logo/Image' }).click();
  const png = Buffer.from(
    await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = c.height = 200;
      const g = c.getContext('2d')!;
      g.fillStyle = '#c0392b';
      g.fillRect(20, 20, 160, 160);
      return c.toDataURL('image/png').split(',')[1]!;
    }),
    'base64',
  );
  await page
    .getByTestId('file-input')
    .setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png });
  await expect.poll(money).toBe(start + 6 + 2 + 4 + 8); // picture → logo fee immediately
  await page.getByTestId('style-choice').locator('[data-value="patch"]').click();
  await expect.poll(money).toBe(start + 6 + 2 + 4 + 8 + 6);
  await expect.poll(async () => (await viewerState(page, HOST)).decals?.length).toBe(2);
});

test('team jersey template: name + number per person, bulk saving from 10 shirts', async ({
  page,
}) => {
  await page.getByTestId('step-2').click();
  // Open by default while the design is still the default one.
  await page.getByTestId('template-team-jersey').click();
  await page.getByTestId('template-field-team').fill('hawks');
  await expect(page.getByTestId('template-field-team')).toHaveValue('HAWKS');
  await page.getByTestId('template-field-name').fill('Sam');
  await page.getByTestId('template-field-number').fill('7');
  await page.getByTestId('template-apply').click();
  // chest team name + back name + back number, all stitched on the garment
  await expect.poll(async () => (await viewerState(page, HOST)).decals?.length).toBe(3);

  await page.getByTestId('step-4').click();
  await expect(page.getByTestId('review-summary')).toContainText('HAWKS');
  await page.getByTestId('order-mode').getByRole('radio', { name: 'Team / bulk order' }).click();
  // the first row starts from the design on screen; new rows count up from its number
  await expect(page.getByTestId('team-text').nth(0)).toHaveValue('SAM');
  await expect(page.getByTestId('team-number').nth(0)).toHaveValue('7');
  await expect(page.getByTestId('summary-bulk-nudge')).toContainText('Order 10+ items');
  for (let i = 0; i < 9; i++) await page.getByTestId('team-add-row').click();
  await expect(page.getByTestId('team-number').nth(9)).toHaveValue('16');
  await expect(page.getByTestId('summary-bulk-saving')).toContainText('10% off garments');
  await expect(page.getByTestId('price-bar-total')).toBeVisible();

  const names = page.getByTestId('team-text');
  for (let i = 1; i < 10; i++) await names.nth(i).fill(`PLAYER${i}`);
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('cart-count')).toHaveText('10');
  await page.getByTestId('open-cart').click();
  const lines = page.getByTestId('cart-line');
  await expect(lines.nth(0)).toContainText('SAM #7');
  await expect(lines.nth(3)).toContainText('PLAYER3 #10');
});

test('garments: switching to the polo keeps the designs and moves Center Chest', async ({
  page,
}) => {
  await page.getByTestId('step-3').click();
  await page.getByTestId('position-choice').locator('[data-value="center_chest"]').click();
  await addBackName(page, 'COACH');
  await expect.poll(async () => (await viewerState(page, HOST)).decals?.length).toBe(2);

  await page.getByTestId('step-1').click();
  await page.getByTestId('garment-choice').locator('[data-value="polo"]').click();
  await waitForViewer(page);
  await expect(page.locator(HOST).locator('.emb-preview-summary strong')).toHaveText(
    'Embroidered Polo',
  );
  // Both designs are on the polo; the chest one moved off the button placket.
  await expect.poll(async () => (await viewerState(page, HOST)).decals?.length).toBe(2);
  await page.getByTestId('step-3').click();
  await expect(page.getByTestId('unavailable-positions')).toContainText(
    'Center Chest: the button placket',
  );
  await page.getByTestId('step-4').click();
  await expect(page.getByTestId('review-summary')).toContainText('Left Chest');
  await expect(page.getByTestId('review-summary')).toContainText('COACH');
  await page.getByTestId('add-to-cart').click();
  await page.getByTestId('open-cart').click();
  await expect(page.getByTestId('cart-line').first()).toContainText('Embroidered Polo');
});

test('templates: live on the shirt while typing, undo restores the previous design', async ({
  page,
}) => {
  await page.getByTestId('step-2').click();
  await page.getByTestId('text-input').fill('MINE');
  await page.getByTestId('template-family-reunion').click();
  await expect(page.getByTestId('layer-bar')).toContainText('SMITH FAMILY');
  await page.getByTestId('template-field-family').fill('lopez');
  await expect(page.getByTestId('template-field-family')).toHaveValue('LOPEZ');
  await expect(page.getByTestId('layer-bar')).toContainText('LOPEZ FAMILY');
  await expect.poll(async () => (await viewerState(page, HOST)).decals?.length).toBe(1);
  // Each card shows its embroidery price on this garment.
  await expect(page.getByTestId('template-varsity-letter')).toContainText('+$');

  await page.getByTestId('template-undo').click();
  await expect(page.getByTestId('layer-bar')).toContainText('MINE');
  await expect(page.getByTestId('layer-bar')).not.toContainText('LOPEZ');
});

test('add a logo from the review step, click it on the shirt, full-screen preview', async ({
  page,
}) => {
  await page.getByTestId('step-4').click();
  await page.getByTestId('add-logo-input').setInputFiles({
    name: 'badge.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      // 64×64 red PNG
      'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAQ0lEQVR42u3PMQ0AAAgDIN8/9K3hHFQgnZ1tCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwuLBQcxAAH1sGQ9AAAAAElFTkSuQmCC',
      'base64',
    ),
  });
  // Lands on the Design step with the new logo design selected.
  await expect(page.getByTestId('artwork-card')).toContainText('badge.png');
  await expect(page.getByTestId('layer-bar')).toContainText('Logo');
  await expect.poll(async () => (await viewerState(page, HOST)).decals?.length).toBe(2);

  // Review: one compact card per design, one Edit each.
  await page.getByTestId('step-4').click();
  await expect(page.getByTestId('review-summary').locator('.emb-rdesign')).toHaveCount(2);

  await page.getByTestId('fullscreen').click();
  await expect(page.getByTestId('viewer')).toHaveClass(/is-fullscreen/);
  // (Esc also exits in real browsers; headless Chromium doesn't route it to fullscreen.)
  await page.getByTestId('fullscreen').click();
  await expect(page.getByTestId('viewer')).not.toHaveClass(/is-fullscreen/);
});

