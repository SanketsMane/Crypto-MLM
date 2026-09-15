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
 * Bars, not an area.
 *
 * Accrual is a discrete quantity per trading day, and most days in a window
 * are either a payout or a zero. An area chart interpolates between them,
 * which draws a smooth ramp across days that paid nothing and turns a single
 * day's credit into a rising trend. On a member whose whole balance posted in
 * one session it read as a spike out of a flat line — a shape that says
 * something is accelerating, about data that says one thing happened once.
 * Bars say what actually occurred on each day and nothing about the days
 * between.
 *
 * The scale is labelled. Without it the tallest bar could be four dollars or
 * four hundred, and the only figure on the panel was the one the reader had
 * to guess.
 *
 * Drawn as inline SVG rather than a chart library: one series, and it keeps
 * the bundle budget intact. The labels are HTML rather than SVG text, because
 * the plot stretches with `preserveAspectRatio="none"` and stretched text
 * distorts.
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
  const peak = Math.max(...values, 0);

  /* The series endpoint returns a point per day, zero-filled — so "no data"
     arrives as thirty zeroes, not as an empty array. Plotting those drew a
     flat line pinned to the axis with a y-scale invented from nothing, which
     looks like a reading rather than an absence. */
  const hasData = peak > 0;

  /* A round ceiling above the peak, so the axis labels are numbers a person
     would say out loud rather than the peak itself to two decimals. */
  const ceiling = niceCeiling(peak);

  const W = 900, H = 190;
  /* One bar per day with a hairline between. At 90 days the gap would eat the
     bar, so it scales down with the count. */
  const n = series.length;
  const slot = n > 0 ? W / n : W;
  const gap = Math.min(3, slot * 0.22);
  const barW = Math.max(1, slot - gap);

  const todayISO = new Date().toISOString().slice(0, 10);

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
            {/* The plot and its scale share one positioned box: the gridlines
                are drawn in the stretched SVG, the numbers that name them are
                laid over it in HTML at the same percentages. */}
            <div className="relative min-h-[150px] flex-1 pr-[52px]">
              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full" role="img"
                   aria-label={`Daily accrual over the last ${range} days, peak ${usd(peak)}`}>
                {[0, 0.5, 1].map((f) => (
                  <line key={f} x1="0" y1={H * f} x2={W} y2={H * f}
                        stroke={f === 1 ? 'var(--color-line-strong)' : 'var(--color-chart-grid)'} strokeWidth="1"
                        vectorEffect="non-scaling-stroke" />
                ))}

                {series.map((p, i) => {
                  if (p.value <= 0) return null;
                  const h = (p.value / ceiling) * H;
                  const isToday = p.date.slice(0, 10) === todayISO;
                  return (
                    <rect
                      key={p.date}
                      x={i * slot + gap / 2}
                      y={H - h}
                      width={barW}
                      height={h}
                      /* Today reads differently because it is still running —
                         the figure can still go up before the session closes. */
                      fill={isToday ? 'var(--color-gold)' : 'var(--color-chart-1)'}
                    >
                      <title>{`${label(p.date)} — ${usd(p.value)}`}</title>
                    </rect>
                  );
                })}
              </svg>

              {/* Scale, right-aligned so it never sits over a bar. */}
              {[1, 0.5, 0].map((f) => (
                <span
                  key={f}
                  aria-hidden
                  className="absolute right-0 -translate-y-1/2 tabular-nums text-[9.5px] text-ink-3"
                  style={{ top: `${(1 - f) * 100}%` }}
                >
                  {f === 0 ? '0' : usd(ceiling * f, ceiling * f >= 10 ? 0 : 2)}
                </span>
              ))}
            </div>

            <div className="mt-1.5 flex justify-between pr-[52px]">
              <span className="tabular-nums text-[9.5px] text-ink-3">{series[0] && label(series[0].date)}</span>
              <span className="tabular-nums text-[9.5px] text-ink-3">{series.at(-1) && label(series.at(-1)!.date)}</span>
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

/**
 * The next "round" number at or above a peak — 1, 2 or 5 times a power of ten.
 *
 * Bars measured against the peak itself put the tallest bar flush against the
 * top of the plot and label the axis with something like "$2.65", which reads
 * as a data point rather than as a scale. Rounding up gives the peak somewhere
 * to sit and the axis a number worth printing.
 */
function niceCeiling(peak: number): number {
  if (peak <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(peak));
  const normalised = peak / magnitude;
  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
  return step * magnitude;
}
