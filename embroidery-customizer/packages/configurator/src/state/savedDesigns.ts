/**
 * "My saved designs" — a small per-browser list of configuration refs. The designs themselves
 * live in persistence (app proxy in Shopify, IndexedDB in the demo); this only remembers refs.
 */
export interface SavedDesign {
  ref: string;
  title: string;
  summary: string;
  savedAt: string;
}

const KEY = 'embroidery-saved-designs-v1';
const MAX = 12;
export const SHARE_PARAM = 'embroidery_design';

function storage(): Storage | null {
  try {
    const s = globalThis.localStorage;
    s.getItem(KEY);
    return s;
  } catch {
    return null;
  }
}

export function listSavedDesigns(): SavedDesign[] {
  try {
    const raw = storage()?.getItem(KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list)
      ? (list as SavedDesign[]).filter((d) => typeof d?.ref === 'string')
      : [];
  } catch {
    return [];
  }
}

export function rememberDesign(design: SavedDesign): SavedDesign[] {
  const list = [design, ...listSavedDesigns().filter((d) => d.ref !== design.ref)].slice(0, MAX);
  try {
    storage()?.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage full / blocked */
  }
  return list;
}

export function forgetDesign(ref: string): SavedDesign[] {
  const list = listSavedDesigns().filter((d) => d.ref !== ref);
  try {
    storage()?.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
  return list;
}

/** Current page URL with the share parameter (keeps the product/variant the customer is on). */
export function shareUrl(ref: string, base: string = globalThis.location?.href ?? ''): string {
  const url = new URL(base);
  url.searchParams.set(SHARE_PARAM, ref);
  url.hash = '';
  return url.toString();
}

export function sharedRefFromUrl(href: string = globalThis.location?.href ?? ''): string | null {
  try {
    const ref = new URL(href).searchParams.get(SHARE_PARAM);
    return ref && /^[\w:-]{4,80}$/.test(ref) ? ref : null;
  } catch {
    return null;
  }
}
