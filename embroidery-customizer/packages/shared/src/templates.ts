import type { PlacementId, StitchStyle, TextAlignment } from './types';

/**
 * Ready-made designs. Customers pick one, fill in a few fields (name, year, team…) and get a
 * complete multi-position layout they can still edit like any other design.
 * Text uses {field} placeholders; every line must stay within the text limits once filled.
 */
export interface TemplateField {
  key: string;
  label: string;
  placeholder: string;
  defaultValue: string;
  maxLength: number;
  /** 'number' fields accept digits only (jersey numbers, years, ages). */
  kind?: 'text' | 'number';
  uppercase?: boolean;
}

export interface TemplateLayer {
  positionId: PlacementId;
  text: string;
  fontId: string;
  /** Letter height in cm; defaults to the position's default size. */
  sizeCm?: number;
  threadColorId?: string;
  stitchStyle?: StitchStyle;
  letterSpacing?: number;
  alignment?: TextAlignment;
  /** Marks the jersey number layer (personalized per row in team orders). */
  role?: 'name' | 'number';
}

export interface DesignTemplate {
  id: string;
  label: string;
  description: string;
  /** Short category tag shown on the card. */
  tag: string;
  fields: TemplateField[];
  layers: TemplateLayer[];
}

const NAME: TemplateField = {
  key: 'name',
  label: 'Name',
  placeholder: 'e.g. ALEX',
  defaultValue: 'ALEX',
  maxLength: 14,
  uppercase: true,
};

export const DESIGN_TEMPLATES: readonly DesignTemplate[] = [
  {
    id: 'team-jersey',
    label: 'Team jersey',
    tag: 'Teams',
    description: 'Team name on the chest, player name and number on the back.',
    fields: [
      {
        key: 'team',
        label: 'Team name',
        placeholder: 'e.g. RAPTORS',
        defaultValue: 'RAPTORS',
        maxLength: 16,
        uppercase: true,
      },
      NAME,
      {
        key: 'number',
        label: 'Number',
        placeholder: 'e.g. 10',
        defaultValue: '10',
        maxLength: 2,
        kind: 'number',
      },
    ],
    layers: [
      {
        positionId: 'center_chest',
        text: '{team}',
        fontId: 'varsity',
        sizeCm: 3.2,
        letterSpacing: 0.06,
      },
      {
        positionId: 'upper_back',
        text: '{name}',
        fontId: 'varsity',
        sizeCm: 5,
        letterSpacing: 0.08,
        role: 'name',
      },
      {
        positionId: 'center_back',
        text: '{number}',
        fontId: 'varsity',
        sizeCm: 18,
        letterSpacing: 0,
        role: 'number',
      },
    ],
  },
  {
    id: 'classic-name',
    label: 'Classic name',
    tag: 'Personal',
    description: 'Your name in script on the left chest. Simple and timeless.',
    fields: [{ ...NAME, placeholder: 'e.g. Alex', defaultValue: 'Alex', uppercase: false }],
    layers: [
      { positionId: 'left_chest', text: '{name}', fontId: 'script', sizeCm: 1.6, letterSpacing: 0 },
    ],
  },
  {
    id: 'established',
    label: 'Est. year',
    tag: 'Brand',
    description: 'A heritage-style crest: your name over the year it all began.',
    fields: [
      {
        key: 'brand',
        label: 'Name or brand',
        placeholder: 'e.g. SMITH & CO',
        defaultValue: 'SMITH & CO',
        maxLength: 16,
        uppercase: true,
      },
      {
        key: 'year',
        label: 'Year',
        placeholder: 'e.g. 2026',
        defaultValue: '2026',
        maxLength: 4,
        kind: 'number',
      },
    ],
    layers: [
      {
        positionId: 'center_chest',
        text: '{brand}\nEST. {year}',
        fontId: 'serif',
        sizeCm: 2.2,
        letterSpacing: 0.12,
      },
    ],
  },
  {
    id: 'monogram',
    label: 'Monogram',
    tag: 'Personal',
    description: 'Elegant initials on the left chest.',
    fields: [
      {
        key: 'initials',
        label: 'Initials',
        placeholder: 'e.g. AJM',
        defaultValue: 'AJM',
        maxLength: 3,
        uppercase: true,
      },
    ],
    layers: [
      {
        positionId: 'left_chest',
        text: '{initials}',
        fontId: 'elegant',
        sizeCm: 2.4,
        letterSpacing: 0.1,
      },
    ],
  },
  {
    id: 'company-staff',
    label: 'Company staff',
    tag: 'Business',
    description: 'Company name on the chest and the role across the upper back.',
    fields: [
      {
        key: 'company',
        label: 'Company',
        placeholder: 'e.g. NORTHWIND',
        defaultValue: 'NORTHWIND',
        maxLength: 16,
        uppercase: true,
      },
      {
        key: 'role',
        label: 'Role on the back',
        placeholder: 'e.g. STAFF',
        defaultValue: 'STAFF',
        maxLength: 16,
        uppercase: true,
      },
    ],
    layers: [
      {
        positionId: 'left_chest',
        text: '{company}',
        fontId: 'block',
        sizeCm: 1.2,
        letterSpacing: 0.06,
      },
      {
        positionId: 'upper_back',
        text: '{role}',
        fontId: 'block',
        sizeCm: 3.4,
        letterSpacing: 0.14,
      },
    ],
  },
  {
    id: 'celebration',
    label: 'Party crew',
    tag: 'Events',
    description:
      'Birthdays, bachelor parties, reunions: the event on the front, a name on the back.',
    fields: [
      {
        key: 'event',
        label: 'Event',
        placeholder: 'e.g. BIRTHDAY CREW',
        defaultValue: 'BIRTHDAY CREW',
        maxLength: 18,
        uppercase: true,
      },
      NAME,
    ],
    layers: [
      {
        positionId: 'center_chest',
        text: '{event}',
        fontId: 'tall',
        sizeCm: 3,
        letterSpacing: 0.08,
      },
      {
        positionId: 'upper_back',
        text: '{name}',
        fontId: 'tall',
        sizeCm: 3.2,
        letterSpacing: 0.1,
        role: 'name',
      },
    ],
  },
];

export const findTemplate = (id: string): DesignTemplate | undefined =>
  DESIGN_TEMPLATES.find((t) => t.id === id);

/** Normalizes one field value (digits only for number fields, upper-case where asked, length cap). */
export function cleanTemplateValue(field: TemplateField, raw: string): string {
  let v = raw.replace(/\s+/g, ' ').replace(/^\s+/, '');
  if (field.kind === 'number') v = v.replace(/\D+/g, '');
  if (field.uppercase) v = v.toUpperCase();
  return v.slice(0, field.maxLength);
}

/** Fills {placeholders}; unknown or empty fields fall back to the field's default value. */
export function fillTemplateText(
  text: string,
  template: DesignTemplate,
  values: Record<string, string>,
): string {
  return text.replace(/\{(\w+)\}/g, (_, key: string) => {
    const field = template.fields.find((f) => f.key === key);
    if (!field) return '';
    const v = cleanTemplateValue(field, values[key] ?? '').trim();
    return v || field.defaultValue;
  });
}
