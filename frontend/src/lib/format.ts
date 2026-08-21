export const usd = (v: string | number | null | undefined, dp = 2): string => {
  const n = Number(v ?? 0);
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: dp, maximumFractionDigits: dp });
};

/** Compact money for KPI tiles: $2,431,850 — no cents. */
export const usdWhole = (v: string | number | null | undefined): string =>
  `$${Number(v ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

export const num = (v: number | string | null | undefined): string =>
  Number(v ?? 0).toLocaleString('en-US');

export const pct = (v: number | string | null | undefined, dp = 1): string => `${Number(v ?? 0).toFixed(dp)}%`;

export const shortDate = (d: string | Date): string =>
  new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

export const titleCase = (s: string): string =>
  s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/** "2 mins ago" */
export function ago(d: string | Date): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(d).getTime()) / 1000));
  if (s < 60) return `${s} sec${s === 1 ? '' : 's'} ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min${m === 1 ? '' : 's'} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const days = Math.floor(h / 24);
  return days < 30 ? `${days} day${days === 1 ? '' : 's'} ago` : shortDate(d);
}
