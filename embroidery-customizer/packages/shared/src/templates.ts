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
  /** Text with {field} placeholders ('' for logo layers). */
  text: string;
  /** A built-in sample logo id (see sampleLogos.ts) instead of text. */
  logo?: string;
  /** Logo width in cm (defaults to the position's default artwork width). */
  logoWidthCm?: number;
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

export const TEMPLATE_CATEGORIES = ['Logos', 'Teams', 'Personal', 'Business', 'Events'] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export interface DesignTemplate {
  id: string;
  label: string;
  description: string;
  /** Category, also shown on the card. */
  tag: TemplateCategory;
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
    tag: 'Business',
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
  {
    id: 'varsity-letter',
    label: 'Varsity letter',
    tag: 'Teams',
    description: 'One big chenille letter on the chest, college-jacket style.',
    fields: [
      {
        key: 'letter',
        label: 'Letter',
        placeholder: 'e.g. R',
        defaultValue: 'R',
        maxLength: 1,
        uppercase: true,
      },
    ],
    layers: [
      {
        positionId: 'center_chest',
        text: '{letter}',
        fontId: 'varsity',
        sizeCm: 12,
        letterSpacing: 0,
        stitchStyle: 'chenille',
      },
    ],
  },
  {
    id: 'graduation',
    label: 'Class of',
    tag: 'Events',
    description: 'Graduation year on the front, the graduate’s name across the back.',
    fields: [
      {
        key: 'year',
        label: 'Year',
        placeholder: 'e.g. 2026',
        defaultValue: '2026',
        maxLength: 4,
        kind: 'number',
      },
      NAME,
    ],
    layers: [
      {
        positionId: 'center_chest',
        text: 'CLASS OF\n{year}',
        fontId: 'varsity',
        sizeCm: 3.4,
        letterSpacing: 0.08,
      },
      {
        positionId: 'upper_back',
        text: '{name}',
        fontId: 'varsity',
        sizeCm: 4,
        letterSpacing: 0.1,
        role: 'name',
      },
    ],
  },
  {
    id: 'bride-squad',
    label: 'Bride squad',
    tag: 'Events',
    description: 'Script title on the chest, each person’s name on the back.',
    fields: [
      {
        key: 'title',
        label: 'Title',
        placeholder: 'e.g. Bride Squad',
        defaultValue: 'Bride Squad',
        maxLength: 16,
      },
      NAME,
    ],
    layers: [
      {
        positionId: 'center_chest',
        text: '{title}',
        fontId: 'script',
        sizeCm: 3.6,
        letterSpacing: 0,
        threadColorId: 'gold',
      },
      {
        positionId: 'upper_back',
        text: '{name}',
        fontId: 'tall',
        sizeCm: 4,
        letterSpacing: 0.12,
        role: 'name',
      },
    ],
  },
  {
    id: 'family-reunion',
    label: 'Family reunion',
    tag: 'Events',
    description: 'Family name and year in a matching design for everyone.',
    fields: [
      {
        key: 'family',
        label: 'Family name',
        placeholder: 'e.g. SMITH',
        defaultValue: 'SMITH',
        maxLength: 12,
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
        text: '{family} FAMILY\nREUNION {year}',
        fontId: 'slab',
        sizeCm: 2.2,
        letterSpacing: 0.06,
      },
    ],
  },
  {
    id: 'worlds-best',
    label: 'World’s best',
    tag: 'Personal',
    description: 'A gift classic: “World’s best Dad”, Mum, Coach…',
    fields: [
      {
        key: 'who',
        label: 'World’s best…',
        placeholder: 'e.g. DAD',
        defaultValue: 'DAD',
        maxLength: 8,
        uppercase: true,
      },
    ],
    layers: [
      {
        positionId: 'center_chest',
        text: 'WORLD’S BEST\n{who}',
        fontId: 'tall',
        sizeCm: 3.4,
        letterSpacing: 0.08,
      },
    ],
  },
  {
    id: 'pet-human',
    label: 'Pet parent',
    tag: 'Personal',
    description: 'Your pet’s name, small and sweet on the chest.',
    fields: [
      {
        key: 'pet',
        label: 'Pet’s name',
        placeholder: 'e.g. Max',
        defaultValue: 'Max',
        maxLength: 10,
      },
    ],
    layers: [
      {
        positionId: 'left_chest',
        text: '{pet}’s human',
        fontId: 'retro',
        sizeCm: 1.4,
        letterSpacing: 0,
      },
    ],
  },
  {
    id: 'logo-cafe',
    label: 'Café crew',
    tag: 'Logos',
    description: 'Coffee logo on the chest, your café’s name across the back.',
    fields: [
      {
        key: 'cafe',
        label: 'Café name',
        placeholder: 'e.g. BEAN THERE',
        defaultValue: 'BEAN THERE',
        maxLength: 16,
        uppercase: true,
      },
    ],
    layers: [
      { positionId: 'left_chest', text: '', logo: 'coffee', fontId: 'block' },
      { positionId: 'upper_back', text: '{cafe}', fontId: 'slab', sizeCm: 3.4, letterSpacing: 0.1 },
    ],
  },
  {
    id: 'logo-outdoor',
    label: 'Outdoor club',
    tag: 'Logos',
    description: 'Mountain badge up front, the club name on the back.',
    fields: [
      {
        key: 'club',
        label: 'Club name',
        placeholder: 'e.g. SUMMIT CLUB',
        defaultValue: 'SUMMIT CLUB',
        maxLength: 16,
        uppercase: true,
      },
    ],
    layers: [
      { positionId: 'center_chest', text: '', logo: 'mountain', fontId: 'block', logoWidthCm: 12 },
      {
        positionId: 'upper_back',
        text: '{club}',
        fontId: 'condensed',
        sizeCm: 3.6,
        letterSpacing: 0.12,
      },
    ],
  },
  {
    id: 'logo-crest',
    label: 'Team crest',
    tag: 'Logos',
    description: 'A crest on the heart, the team name big on the back.',
    fields: [
      {
        key: 'team',
        label: 'Team name',
        placeholder: 'e.g. LIONS FC',
        defaultValue: 'LIONS FC',
        maxLength: 14,
        uppercase: true,
      },
    ],
    layers: [
      { positionId: 'left_chest', text: '', logo: 'crest', fontId: 'block' },
      {
        positionId: 'center_back',
        text: '{team}',
        fontId: 'varsity',
        sizeCm: 5,
        letterSpacing: 0.06,
      },
    ],
  },
  {
    id: 'logo-bolt',
    label: 'Bolt squad',
    tag: 'Logos',
    description: 'A lightning bolt on the chest and each person’s name on the back.',
    fields: [NAME],
    layers: [
      { positionId: 'center_chest', text: '', logo: 'bolt', fontId: 'block', logoWidthCm: 10 },
      {
        positionId: 'upper_back',
        text: '{name}',
        fontId: 'tall',
        sizeCm: 4,
        letterSpacing: 0.12,
        role: 'name',
      },
    ],
  },
  {
    id: 'logo-paw',
    label: 'Pet crew',
    tag: 'Logos',
    description: 'A paw print on the chest and your pet’s crew on the back.',
    fields: [
      {
        key: 'pet',
        label: 'Pet’s name',
        placeholder: 'e.g. MAX',
        defaultValue: 'MAX',
        maxLength: 10,
        uppercase: true,
      },
    ],
    layers: [
      { positionId: 'left_chest', text: '', logo: 'paw', fontId: 'block' },
      {
        positionId: 'upper_back',
        text: 'TEAM {pet}',
        fontId: 'block',
        sizeCm: 3.2,
        letterSpacing: 0.12,
      },
    ],
  },
  {
    id: 'logo-allstar',
    label: 'All-star',
    tag: 'Logos',
    description: 'Star badge on the chest, name and number on the back.',
    fields: [
      NAME,
      {
        key: 'number',
        label: 'Number',
        placeholder: 'e.g. 23',
        defaultValue: '23',
        maxLength: 2,
        kind: 'number',
      },
    ],
    layers: [
      { positionId: 'left_chest', text: '', logo: 'star', fontId: 'block' },
      {
        positionId: 'upper_back',
        text: '{name}',
        fontId: 'varsity',
        sizeCm: 4,
        letterSpacing: 0.08,
        role: 'name',
      },
      {
        positionId: 'center_back',
        text: '{number}',
        fontId: 'varsity',
        sizeCm: 16,
        letterSpacing: 0,
        role: 'number',
      },
    ],
  },
  {
    id: 'logo-sailing',
    label: 'Sailing crew',
    tag: 'Logos',
    description: 'An anchor on the chest and your boat’s name on the back.',
    fields: [
      {
        key: 'boat',
        label: 'Boat or crew',
        placeholder: 'e.g. SEA BREEZE',
        defaultValue: 'SEA BREEZE',
        maxLength: 16,
        uppercase: true,
      },
    ],
    layers: [
      { positionId: 'left_chest', text: '', logo: 'anchor', fontId: 'block' },
      {
        positionId: 'upper_back',
        text: '{boat}',
        fontId: 'serif',
        sizeCm: 3.2,
        letterSpacing: 0.14,
      },
    ],
  },
  {
    id: 'logo-green',
    label: 'Green team',
    tag: 'Logos',
    description: 'A leaf badge for gardens, eco brands and volunteers.',
    fields: [
      {
        key: 'brand',
        label: 'Name',
        placeholder: 'e.g. GREEN TEAM',
        defaultValue: 'GREEN TEAM',
        maxLength: 16,
        uppercase: true,
      },
    ],
    layers: [
      { positionId: 'left_chest', text: '', logo: 'leaf', fontId: 'block' },
      {
        positionId: 'upper_back',
        text: '{brand}',
        fontId: 'block',
        sizeCm: 3.2,
        letterSpacing: 0.12,
      },
    ],
  },
  {
    id: 'logo-hoops',
    label: 'Hoops',
    tag: 'Logos',
    description: 'A basketball up front, name and number on the back.',
    fields: [
      NAME,
      {
        key: 'number',
        label: 'Number',
        placeholder: 'e.g. 7',
        defaultValue: '7',
        maxLength: 2,
        kind: 'number',
      },
    ],
    layers: [
      {
        positionId: 'center_chest',
        text: '',
        logo: 'basketball',
        fontId: 'block',
        logoWidthCm: 11,
      },
      {
        positionId: 'upper_back',
        text: '{name}',
        fontId: 'condensed',
        sizeCm: 4,
        letterSpacing: 0.1,
        role: 'name',
      },
      {
        positionId: 'center_back',
        text: '{number}',
        fontId: 'condensed',
        sizeCm: 16,
        letterSpacing: 0,
        role: 'number',
      },
    ],
  },
  {
    id: 'logo-crown',
    label: 'Birthday royalty',
    tag: 'Logos',
    description: 'A crown on the chest and the birthday star’s name on the back.',
    fields: [
      {
        key: 'name',
        label: 'Name',
        placeholder: 'e.g. QUEEN MIA',
        defaultValue: 'QUEEN MIA',
        maxLength: 14,
        uppercase: true,
      },
    ],
    layers: [
      { positionId: 'center_chest', text: '', logo: 'crown', fontId: 'block', logoWidthCm: 10 },
      {
        positionId: 'upper_back',
        text: '{name}',
        fontId: 'elegant',
        sizeCm: 3.6,
        letterSpacing: 0.08,
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
