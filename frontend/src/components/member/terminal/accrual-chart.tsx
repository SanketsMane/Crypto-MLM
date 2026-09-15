'use client';

import { usd } from '@/lib/format';
import { Panel } from './panel';

/**
 * Daily accrual, as the page's centre of gravity.
 *
 * Structural, not cosmetic: the old dashboard gave the series a 7/30/90 select
 * and a small plot sharing a card with four stream totals, so the chart was a
 * sidebar to its own panel. Here the plot IS the panel — it takes the height,
 * the stream totals move to a footer rail under it, and the range control sits
 * in the header where it belongs.
 *
 * Drawn as inline SVG rather than a chart library: one series, no axes worth
 * the weight, and it keeps the bundle budget intact.
 */

export interface Point { date: string; value: number }

export function AccrualChart({
  series, range, onRange, streams = [], loading,
}: {
  series: Point[];
  range: string;
  onRange: (r: string) => void;
  streams?: { label: string; total: string; color: string }[];
  loading?: boolean;
}) {
  const RANGES = ['7', '30', '90'] as const;

  const values = series.map((p) => p.value);
  const max = Math.max(1, ...values);

  /* The series endpoint returns a point per day, zero-filled — so "no data"
     arrives as thirty zeroes, not as an empty array. Plotting those drew a
     flat line pinned to the axis with a y-scale invented from nothing, which
     looks like a reading rather than an absence. */
  const hasData = values.some((v) => v > 0);
  const W = 900, H = 190;

  const pts = series.map((p, i) => {
    const x = series.length > 1 ? (i / (series.length - 1)) * W : W / 2;
    const y = H - (p.value / max) * (H - 14);
    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  const line = pts.length ? `M${pts.join(' L')}` : '';
  const area = pts.length ? `${line} L${W} ${H} L0 ${H} Z` : '';
  const last = series.at(-1);
  const lastX = W, lastY = last ? H - (last.value / max) * (H - 14) : H;

  const label = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

  return (
    <Panel
      title="Daily accrual"
      className="min-h-[300px]"
      bodyClassName="flex flex-col p-0"
      action={
        <div className="flex gap-px rounded-[3px] bg-card-2 p-px">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onRange(r)}
              aria-pressed={range === r}
              className={`tabular-nums rounded-[2px] px-2 py-[3px] text-[10px] transition-colors ${
                range === r ? 'bg-line text-ink' : 'text-ink-3 hover:text-ink-2'
              }`}
            >
              {r}D
            </button>
          ))}
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col px-3 pb-2 pt-3">
        {loading ? (
          <div className="flex-1 animate-pulse rounded-[3px] bg-line-soft" />
        ) : !hasData ? (
          /* Honest empty state: says why it is empty and what fills it, rather
             than showing an axis with nothing on it. */
          <div className="flex flex-1 flex-col items-center justify-center gap-1 py-8 text-center">
            <p className="text-[12px] text-ink-2">No accrual in this window yet</p>
            <p className="text-[11px] text-ink-3">The daily bonus starts the session after your first package activates.</p>
          </div>
        ) : (
          <>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="min-h-[150px] w-full flex-1" role="img"
                 aria-label={`Daily accrual over the last ${range} days`}>
              <defs>
                <linearGradient id="accrual-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[0.25, 0.5, 0.75].map((f) => (
                <line key={f} x1="0" y1={H * f} x2={W} y2={H * f} stroke="var(--color-chart-grid)" strokeWidth="1" />
              ))}
              <line x1="0" y1={H} x2={W} y2={H} stroke="var(--color-line)" strokeWidth="1" />
              <path d={area} fill="url(#accrual-fill)" />
              <path d={line} fill="none" stroke="var(--color-chart-1)" strokeWidth="2"
                    strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              {last && <circle cx={lastX} cy={lastY} r="3.5" fill="var(--color-chart-1)" stroke="var(--color-card)" strokeWidth="2" />}
            </svg>

            <div className="mt-1.5 flex justify-between">
              <span className="tabular-nums text-[9.5px] text-ink-3">{series[0] && label(series[0].date)}</span>
              <span className="tabular-nums text-[9.5px] text-ink-3">{last && label(last.date)}</span>
            </div>
          </>
        )}
      </div>

      {/* The stream totals used to compete with the plot inside one card.
          As a footer rail they read as a breakdown OF it. */}
      {streams.length > 0 && (
        <div className="grid shrink-0 grid-cols-2 border-t border-line sm:grid-cols-4">
          {streams.map((s, i) => (
            <div key={s.label} className={`px-3 py-2 ${i > 0 ? 'border-line sm:border-l' : ''} ${i >= 2 ? 'border-t sm:border-t-0' : ''} ${i === 1 ? 'border-l' : ''}`}>
              <span className="flex items-center gap-1.5">
                <span className="size-[6px] shrink-0 rounded-[1px]" style={{ background: s.color }} />
                <span className="truncate text-[9.5px] font-semibold uppercase tracking-[0.09em] text-ink-3">{s.label}</span>
              </span>
              <span className="mt-1 block tabular-nums text-[13px] font-semibold text-ink">{usd(s.total)}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
