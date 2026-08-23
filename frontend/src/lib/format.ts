/**
 * Shown in place of a figure that could not be read.
 *
 * Deliberately not `$0.00`. A missing value and a broken one are different
 * things: the first genuinely is zero — a member with no balance yet — and the
 * second means something upstream is wrong. Rendering both as zero tells
 * somebody their money is gone; rendering the second as a dash tells them we
 * do not know, which is the truth.
 */
export const UNKNOWN = '—';

/**
 * A number, or nothing.
 *
 * `Number('abc')` is `NaN`, and `NaN.toLocaleString()` is the string "NaN" —
 * so an unparseable value used to render as the literal text `$NaN` on pages
 * reporting somebody's balance. Every formatter below goes through here.
 */
function finite(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export const usd = (v: string | number | null | undefined, dp = 2): string => {
  const n = finite(v);
  if (n === null) return UNKNOWN;
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: dp, maximumFractionDigits: dp });
};

/** Compact money for KPI tiles: $2,431,850 — no cents. */
export const usdWhole = (v: string | number | null | undefined): string => {
  const n = finite(v);
  return n === null ? UNKNOWN : `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
};

export const num = (v: number | string | null | undefined): string => {
  const n = finite(v);
  return n === null ? UNKNOWN : n.toLocaleString('en-US');
};

export const pct = (v: number | string | null | undefined, dp = 1): string => {
  const n = finite(v);
  return n === null ? UNKNOWN : `${n.toFixed(dp)}%`;
};

export const shortDate = (d: string | Date): string => {
  const at = new Date(d);
  // "Invalid Date" is what an unparseable timestamp renders as otherwise.
  if (Number.isNaN(at.getTime())) return UNKNOWN;
  return at.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const titleCase = (s: string): string =>
  s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/** "2 mins ago" */
export function ago(d: string | Date): string {
  const at = new Date(d).getTime();
  if (!Number.isFinite(at)) return UNKNOWN;
  // Clamped at one second: a device clock running ahead of the server is
  // routine, and "-3 secs ago" reads as the platform being broken.
  const s = Math.max(1, Math.floor((Date.now() - at) / 1000));
  if (s < 60) return `${s} sec${s === 1 ? '' : 's'} ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min${m === 1 ? '' : 's'} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const days = Math.floor(h / 24);
  return days < 30 ? `${days} day${days === 1 ? '' : 's'} ago` : shortDate(d);
}
