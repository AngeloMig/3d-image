import { describe, expect, it } from 'vitest';
import { DESIGN_TEMPLATES, cleanTemplateValue, fillTemplateText, findTemplate } from './templates';
import { validateText } from './validation';
import { FONTS } from './catalog';
import { SAMPLE_LOGOS, findSampleLogo } from './sampleLogos';
import { TSHIRT_V1 } from './models';

describe('design templates', () => {
  it('only use real fonts and positions, and stay valid with default and maximum values', () => {
    for (const t of DESIGN_TEMPLATES) {
      for (const l of t.layers) {
        expect(
          FONTS.some((f) => f.id === l.fontId),
          `${t.id} font`,
        ).toBe(true);
        expect(
          TSHIRT_V1.placements.some((p) => p.id === l.positionId),
          `${t.id} position`,
        ).toBe(true);
        const longest = Object.fromEntries(
          t.fields.map((f) => [f.key, (f.kind === 'number' ? '9' : 'W').repeat(f.maxLength)]),
        );
        if (l.logo) {
          expect(findSampleLogo(l.logo), `${t.id} logo`).toBeDefined();
          continue;
        }
        for (const values of [{}, longest])
          expect(validateText(fillTemplateText(l.text, t, values)), `${t.id}`).toEqual([]);
      }
    }
  });

  it('cleans values per field and falls back to defaults when empty', () => {
    const jersey = findTemplate('team-jersey')!;
    const number = jersey.fields.find((f) => f.key === 'number')!;
    expect(cleanTemplateValue(number, '#7a3')).toBe('73');
    expect(cleanTemplateValue(jersey.fields[0]!, 'raptors fc')).toBe('RAPTORS FC');
    expect(fillTemplateText('{name} #{number}', jersey, { name: '', number: '7' })).toBe('ALEX #7');
  });

  it('ships 10 original sample logos, each used by a logo template', () => {
    expect(SAMPLE_LOGOS).toHaveLength(10);
    const used = new Set(DESIGN_TEMPLATES.flatMap((t) => t.layers.map((l) => l.logo)));
    for (const logo of SAMPLE_LOGOS) {
      expect(used.has(logo.id), logo.id).toBe(true);
      expect(logo.svg.startsWith('<svg')).toBe(true);
    }
  });
});
