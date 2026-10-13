import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Liquid } from 'liquidjs';

const snippet = readFileSync(
  new URL('../../packing-slip/embroidery-details.liquid', import.meta.url),
  'utf8',
);
const engine = new Liquid();
const render = (lineItem: unknown) =>
  engine.parseAndRender(`{% for line_item in line_items_in_shipment %}${snippet}{% endfor %}`, {
    line_items_in_shipment: [lineItem],
  });

const props = {
  'Embroidery Type': 'Text',
  'Embroidery Text': 'JANE / <b>DOE</b>',
  Font: 'Classic Serif',
  'Thread Color': 'Gold',
  Placement: 'Left Chest',
  'Embroidery Size': '8.0 × 3.0 cm',
  'Customization ID': '1b2c',
  '_Embroidery Config Ref': 'cfg_secret',
  'Gift Note': 'Happy birthday',
};

describe('packing slip snippet', () => {
  it('renders embroidery properties (hash form) and escapes values', async () => {
    const html = await render({ title: 'Tee', properties: props });
    expect(html).toContain('Left Chest');
    expect(html).toContain('8.0 × 3.0 cm');
    expect(html).toContain('JANE / &lt;b&gt;DOE&lt;/b&gt;');
    expect(html).toContain('1b2c');
    expect(html).not.toContain('cfg_secret'); // hidden refs stay off the slip
    expect(html).not.toContain('Happy birthday'); // unrelated properties untouched
  });

  it('supports the name/value array form too', async () => {
    const html = await render({
      title: 'Tee',
      properties: Object.entries(props).map(([name, value]) => ({ name, value })),
    });
    expect(html).toContain('Classic Serif');
  });

  it('renders nothing for non-embroidered items', async () => {
    expect((await render({ title: 'Socks', properties: {} })).trim()).toBe('');
  });
});
