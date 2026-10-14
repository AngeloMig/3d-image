import { expect, test } from '@playwright/test';
import { pngLogo, trackErrors, viewerState, waitForViewer } from './helpers';

const HOST = '[data-embroidery-root]';
// Customized rows only (fee rows have no Customization ID).
const ITEM_ROWS = 'tr.cart-item:has-text("Customization ID")';

test.beforeEach(async ({ page, request }) => {
  await request.post('/__mock/reset');
  await page.goto('/shopify-sim.html');
  await waitForViewer(page);
});

test('Shopify path: lazy loader mounts, adds real variant with properties, edits the exact cart line', async ({
  page,
}) => {
  const errors = trackErrors(page);
  await expect(page.locator(HOST)).toHaveAttribute('data-embroidery-state', 'ready');
  await expect(page.locator('.emb-badge')).toHaveCount(0); // not demo mode

  // theme variant picker → configurator follows
  await page.locator('select[name="id"]').selectOption('4113');
  await expect(page.getByTestId('option-size').getByRole('radio', { name: 'M' })).toHaveAttribute(
    'aria-checked',
    'true',
  );

  const add = page.waitForRequest((r) => r.url().endsWith('/cart/add.js'));
  await page.getByTestId('step-4').click();
  await page.getByTestId('add-to-cart').click();
  const body = (await add).postDataJSON() as {
    items: { id: number; properties: Record<string, string> }[];
  };
  expect(body.items[0]!.id).toBe(4113);
  expect(body.items[0]!.properties).toMatchObject({
    'Embroidery Type': 'Text',
    'Embroidery Text': 'YOUR NAME',
    Placement: 'Left Chest',
    'Thread Color': 'Red', // default thread colour
  });
  expect(body.items[0]!.properties['_Embroidery Config Ref']).toMatch(/^cfg_/);
  // a 3D mockup (front view) is stored for the order email, linked by an absolute URL
  const mockupUrl = body.items[0]!.properties['_Embroidery Mockup']!;
  expect(mockupUrl).toMatch(/^https?:\/\/[^/]+\/apps\/embroidery\/preview\/pv_[a-f0-9]+\.jpg$/);
  const mockup = await page.request.get(new URL(mockupUrl).pathname);
  expect(mockup.ok()).toBe(true);
  expect((await mockup.body()).subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff])); // JPEG
  // the text embroidery fee rides along as its own line, priced by Shopify (variant 9001)
  expect(body.items[1]).toMatchObject({
    id: 9001,
    quantity: 1,
    properties: { '_Embroidery Fee Kind': 'text' },
  });
  // Shopify's item_count includes the embroidery fee line (1 shirt + 1 text fee).
  await expect(page.locator('[data-cart-count]')).toHaveText('2');

  // second, different configuration → distinct line
  await page.getByTestId('step-2').click();
  await page.getByTestId('text-input').fill('TEAM');
  await page.getByTestId('step-4').click();
  await page.getByTestId('add-to-cart').click();
  await expect(page.locator(ITEM_ROWS)).toHaveCount(2);

  // unrelated property on line 1 must survive the edit
  await page.evaluate(async () => {
    const cart = await (await fetch('/cart.js')).json();
    const first = cart.items[0];
    await fetch('/cart/change.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: first.key,
        quantity: first.quantity,
        properties: { ...first.properties, 'Gift Note': 'Keep me' },
      }),
    });
  });
  await page.reload();
  await waitForViewer(page);

  // cart-edit hook injects buttons next to the visible Customization ID
  const editButtons = page.locator('.embroidery-edit-button');
  await expect(editButtons).toHaveCount(2);
  await editButtons.first().click();
  const dialog = page.locator('embroidery-cart-editor');
  await expect(dialog.getByTestId('editing-banner')).toBeVisible();
  await dialog.getByTestId('step-2').click();
  await expect(dialog.getByTestId('text-input')).toHaveValue('YOUR NAME');
  await dialog.getByTestId('text-input').fill('UPDATED');
  await dialog.getByTestId('step-4').click();
  const change = page.waitForRequest((r) => r.url().endsWith('/cart/change.js'));
  const reloaded = page.waitForEvent('load'); // the editor reloads the page to refresh theme cart markup
  await dialog.getByTestId('add-to-cart').click();
  const changeBody = (await change).postDataJSON() as { properties: Record<string, string> };
  expect(changeBody.properties['Gift Note']).toBe('Keep me');
  expect(changeBody.properties['Embroidery Text']).toBe('UPDATED');

  await reloaded;
  await expect(page.locator(ITEM_ROWS)).toHaveCount(2);
  await expect(page.locator(ITEM_ROWS).nth(0)).toContainText('UPDATED');
  await expect(page.locator(ITEM_ROWS).nth(0)).toContainText('Keep me');
  await expect(page.locator(ITEM_ROWS).nth(1)).toContainText('TEAM');
  expect(errors.filter((e) => !e.includes('favicon'))).toEqual([]);
});

test('Shopify path: logo is uploaded through the app proxy before add to cart', async ({
  page,
}) => {
  await page.getByTestId('step-2').click();
  await page.getByTestId('design-type').getByRole('radio', { name: 'Upload Logo/Image' }).click();
  await page
    .getByTestId('file-input')
    .setInputFiles({ name: 'brand.png', mimeType: 'image/png', buffer: await pngLogo(page) });
  await expect.poll(async () => (await viewerState(page, HOST)).decalVisible).toBe(true);
  const upload = page.waitForResponse(
    (r) => r.url().endsWith('/apps/embroidery/artwork') && r.request().method() === 'POST',
  );
  await page.getByTestId('step-4').click();
  await page.getByTestId('add-to-cart').click();
  expect((await upload).status()).toBe(201);
  await expect(page.locator(ITEM_ROWS)).toContainText('brand.png');
  const cart = await page.evaluate(async () => (await fetch('/cart.js')).json());
  const props = cart.items[0].properties as Record<string, string>;
  expect(props['_Embroidery Artwork Ref']).toMatch(/^art_/);
  expect(JSON.stringify(props)).not.toMatch(/base64|data:image/);
});
