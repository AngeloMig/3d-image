/**
 * Original sample logos for logo templates (drawn for this project — free to use, no
 * trademarks). Flat shapes with 1–3 thread colours, like logos that embroider well.
 * All are 200×200 SVGs with transparent backgrounds.
 */
export interface SampleLogo {
  id: string;
  label: string;
  svg: string;
}

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="512" height="512">${body}</svg>`;

export const SAMPLE_LOGOS: readonly SampleLogo[] = [
  {
    id: 'coffee',
    label: 'Coffee cup',
    svg: svg(
      `<circle cx="100" cy="100" r="92" fill="#3b2a20"/>
       <circle cx="100" cy="100" r="80" fill="none" stroke="#f3e6d3" stroke-width="4"/>
       <path d="M62 92h66v18a30 30 0 0 1-30 30h-6a30 30 0 0 1-30-30Z" fill="#f3e6d3"/>
       <path d="M128 98h8a12 12 0 0 1 0 24h-10" fill="none" stroke="#f3e6d3" stroke-width="8"/>
       <path d="M56 150h80" stroke="#f3e6d3" stroke-width="8" stroke-linecap="round"/>
       <path d="M80 80c-8-10 8-14 0-26M98 80c-8-10 8-14 0-26M116 80c-8-10 8-14 0-26" fill="none" stroke="#c98b4f" stroke-width="6" stroke-linecap="round"/>`,
    ),
  },
  {
    id: 'mountain',
    label: 'Mountain peak',
    svg: svg(
      `<circle cx="100" cy="100" r="92" fill="#1f3a5f"/>
       <circle cx="132" cy="70" r="16" fill="#f2a541"/>
       <path d="M28 146 82 70l24 32 16-20 50 64Z" fill="#f4f6f8"/>
       <path d="M82 70 66 92l10-4 6 8 8-10 6 4Z" fill="#1f3a5f"/>
       <path d="M28 146h144" stroke="#f4f6f8" stroke-width="6" stroke-linecap="round"/>`,
    ),
  },
  {
    id: 'crest',
    label: 'Team crest',
    svg: svg(
      `<path d="M100 10 172 34v54c0 50-32 84-72 102C60 172 28 138 28 88V34Z" fill="#b3232f"/>
       <path d="M100 24 160 44v44c0 42-26 71-60 86-34-15-60-44-60-86V44Z" fill="none" stroke="#fff" stroke-width="5"/>
       <path d="m54 92 46 32 46-32v18l-46 32-46-32Z" fill="#fff"/>
       <path d="m100 52 7 15 16 2-12 11 3 16-14-8-14 8 3-16-12-11 16-2Z" fill="#fff"/>`,
    ),
  },
  {
    id: 'bolt',
    label: 'Lightning bolt',
    svg: svg(
      `<circle cx="100" cy="100" r="92" fill="#111"/>
       <path d="M112 22 52 112h40l-12 66 66-96h-42Z" fill="#f5c400"/>`,
    ),
  },
  {
    id: 'paw',
    label: 'Paw print',
    svg: svg(
      `<circle cx="100" cy="100" r="88" fill="#fff" stroke="#e07a2e" stroke-width="10"/>
       <ellipse cx="100" cy="124" rx="34" ry="28" fill="#e07a2e"/>
       <ellipse cx="62" cy="88" rx="13" ry="17" fill="#e07a2e" transform="rotate(-20 62 88)"/>
       <ellipse cx="86" cy="66" rx="13" ry="18" fill="#e07a2e"/>
       <ellipse cx="114" cy="66" rx="13" ry="18" fill="#e07a2e"/>
       <ellipse cx="138" cy="88" rx="13" ry="17" fill="#e07a2e" transform="rotate(20 138 88)"/>`,
    ),
  },
  {
    id: 'star',
    label: 'All-star',
    svg: svg(
      `<circle cx="100" cy="100" r="92" fill="#16325c"/>
       <circle cx="100" cy="100" r="80" fill="none" stroke="#d9b44a" stroke-width="5"/>
       <path d="m100 34 18 40 44 4-33 29 10 43-39-23-39 23 10-43-33-29 44-4Z" fill="#d9b44a"/>`,
    ),
  },
  {
    id: 'anchor',
    label: 'Anchor',
    svg: svg(
      `<circle cx="100" cy="100" r="88" fill="#fff" stroke="#1d3557" stroke-width="10"/>
       <circle cx="100" cy="50" r="12" fill="none" stroke="#1d3557" stroke-width="8"/>
       <path d="M100 62v94M72 82h56" stroke="#1d3557" stroke-width="10" stroke-linecap="round"/>
       <path d="M52 112c4 28 26 44 48 44s44-16 48-44" fill="none" stroke="#1d3557" stroke-width="10" stroke-linecap="round"/>
       <path d="m42 120 10-14 12 12M158 120l-10-14-12 12" fill="none" stroke="#1d3557" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`,
    ),
  },
  {
    id: 'leaf',
    label: 'Leaf',
    svg: svg(
      `<circle cx="100" cy="100" r="88" fill="#fff" stroke="#2e8b57" stroke-width="10"/>
       <path d="M146 48c-66 0-100 38-98 98 60 2 98-32 98-98Z" fill="#2e8b57"/>
       <path d="M60 140c24-32 50-56 78-84M86 114h22M74 96l8 18M104 88h18M96 70l6 18" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/>`,
    ),
  },
  {
    id: 'basketball',
    label: 'Basketball',
    svg: svg(
      `<circle cx="100" cy="100" r="86" fill="#e8742c"/>
       <g fill="none" stroke="#1b1b1b" stroke-width="7">
         <circle cx="100" cy="100" r="86"/>
         <path d="M14 100h172M100 14v172"/>
         <path d="M40 38c26 18 34 46 34 62s-8 44-34 62M160 38c-26 18-34 46-34 62s8 44 34 62"/>
       </g>`,
    ),
  },
  {
    id: 'crown',
    label: 'Crown',
    svg: svg(
      `<path d="M30 70 64 104l36-60 36 60 34-34-14 92H44Z" fill="#d4a017"/>
       <path d="M44 162h112v16H44Z" fill="#b8860b"/>
       <circle cx="30" cy="66" r="10" fill="#d4a017"/>
       <circle cx="100" cy="40" r="10" fill="#d4a017"/>
       <circle cx="170" cy="66" r="10" fill="#d4a017"/>
       <circle cx="100" cy="124" r="10" fill="#b3232f"/>
       <circle cx="68" cy="134" r="7" fill="#1f5fa8"/>
       <circle cx="132" cy="134" r="7" fill="#1f5fa8"/>`,
    ),
  },
];

export const findSampleLogo = (id: string): SampleLogo | undefined =>
  SAMPLE_LOGOS.find((l) => l.id === id);

/** data: URL of a sample logo (usable as <img>/WebGL source without any network request). */
export const sampleLogoUrl = (logo: SampleLogo): string =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(logo.svg)}`;

/** True for preview URLs of built-in sample logos (they're rasterized to PNG before upload). */
export const isSampleLogoUrl = (url: string | null | undefined): boolean =>
  !!url && url.startsWith('data:image/svg+xml');
