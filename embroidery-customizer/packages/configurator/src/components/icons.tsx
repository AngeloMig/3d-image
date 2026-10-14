import type { JSX } from 'preact';

const base = (children: JSX.Element | JSX.Element[], size = 18) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {children}
  </svg>
);

export const IconReset = () =>
  base([<path key="a" d="M3 12a9 9 0 1 0 3-6.7" />, <path key="b" d="M3 4v5h5" />]);
export const IconFront = () =>
  base([
    <path
      key="a"
      d="M8 3 4 5.5 2.5 10l3 1.2V21h13v-9.8l3-1.2L20 5.5 16 3c-.6 1.6-2.2 2.6-4 2.6S8.6 4.6 8 3Z"
    />,
  ]);
export const IconBack = () =>
  base([
    <path
      key="a"
      d="M8 3 4 5.5 2.5 10l3 1.2V21h13v-9.8l3-1.2L20 5.5 16 3c-.7 1-2.2 1.5-4 1.5S8.7 4 8 3Z"
    />,
    <path key="b" d="M9 9h6" />,
  ]);
export const IconPlus = () => base([<path key="a" d="M12 5v14M5 12h14" />]);
export const IconMinus = () => base([<path key="a" d="M5 12h14" />]);
export const IconRotate = () =>
  base([<path key="a" d="M21 12a9 9 0 1 1-2.6-6.4" />, <path key="b" d="M21 3v6h-6" />]);
export const IconUpload = () =>
  base(
    [
      <path key="a" d="M12 16V4" />,
      <path key="b" d="m7 9 5-5 5 5" />,
      <path key="c" d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />,
    ],
    22,
  );
export const IconCheck = () => base([<path key="a" d="m5 12.5 4.5 4.5L19 7.5" />]);
export const IconAlignLeft = () => base([<path key="a" d="M4 6h16M4 10h10M4 14h16M4 18h10" />]);
export const IconAlignCenter = () => base([<path key="a" d="M4 6h16M7 10h10M4 14h16M7 18h10" />]);
export const IconAlignRight = () => base([<path key="a" d="M4 6h16M10 10h10M4 14h16M10 18h10" />]);
export const IconText = () => base([<path key="a" d="M5 6V4h14v2M12 4v16M9 20h6" />]);
export const IconImage = () =>
  base([
    <rect key="a" x="3" y="4" width="18" height="16" rx="2" />,
    <circle key="b" cx="9" cy="10" r="1.8" />,
    <path key="c" d="m21 16-5-5-8 9" />,
  ]);
export const IconBag = () =>
  base([<path key="a" d="M6 8h12l-1 12H7L6 8Z" />, <path key="b" d="M9 8V6a3 3 0 0 1 6 0v2" />]);
export const IconClose = () => base([<path key="a" d="M6 6l12 12M18 6 6 18" />]);
export const IconMove = () =>
  base([
    <path key="a" d="M12 3v18M3 12h18" />,
    <path key="b" d="m9 6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" />,
  ]);

/** Tiny garment pictogram with a dot marking where a placement sits. */
export function PlacementGlyph(p: { x: number; y: number; back?: boolean }) {
  return (
    <svg
      width="44"
      height="40"
      viewBox="0 0 44 40"
      aria-hidden="true"
      focusable="false"
      class="emb-glyph"
    >
      <path
        d="M15 3 7 7 2 15l6 3v19h28V18l6-3-5-8-8-4c-1 3-3.5 4.5-7 4.5S16 6 15 3Z"
        fill="currentColor"
        opacity="0.12"
        stroke="currentColor"
        stroke-width="1.2"
        stroke-linejoin="round"
      />
      {p.back ? (
        <path
          d="M17 5.5c1.5 1 3 1.4 5 1.4s3.5-.4 5-1.4"
          stroke="currentColor"
          stroke-width="1"
          fill="none"
        />
      ) : null}
      <circle cx={8 + p.x * 28} cy={37 - p.y * 34} r="3" class="emb-glyph__dot" />
    </svg>
  );
}
export const IconExpand = () =>
  base([<path key="a" d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />]);
export const IconCollapse = () =>
  base([<path key="a" d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />]);
