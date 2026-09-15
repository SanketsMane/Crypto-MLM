'use client';

import { usd, pct } from '@/lib/format';
import { Label, Figure } from './panel';

/**
 * Earnings headroom — the first thing on the member's screen.
 *
 * This is the structural change, not a restyle. The old dashboard put four
 * equal "Total Invested / Total Earned / Team Business / Active Packages"
 * tiles at the top and buried cap utilisation in a side card two thirds down.
 * But the ceiling is the hardest limit in the plan: once a member reaches
 * 250% of capital, every stream stops paying. "How much can I still earn"
 * outranks every other number on the page, so it leads it.
 *
 * It is also stated as HEADROOM rather than as a percentage used. A member
 * does not act on "60.2% consumed"; they act on "$12,392 left".
 *
 * The bar is segmented by which stream consumed the cap, which answers the
 * follow-up question in the same object instead of a second screen.
 */

const STREAMS = [
  { key: 'DAILY_ROI',       label: 'Daily trade', color: 'var(--color-chart-1)' },
  { key: 'DIRECT_BONUS',   label: 'Direct',      color: 'var(--color-chart-2)' },
  { key: 'GENERATION_BONUS', label: 'Generation', color: 'var(--color-chart-3)' },
  { key: 'RANK_BONUS',      label: 'Rank',        color: 'var(--color-chart-4)' },
  { key: 'ROAMING_CLUB',   label: 'Offers',      color: 'var(--color-chart-5)' },
] as const;

export interface CapProps {
  capping?: { limit: string; earned: string; remaining: string; isCapped: boolean; percent: number; ceiling: number };
  breakdown?: { category: string; total: string; count: number }[];
  /** Today's accrual, used to project when the ceiling is reached. */
  today?: string;
  loading?: boolean;
}

export function CapHeadroom({ capping, breakdown = [], today, loading }: CapProps) {
  const limit = Number(capping?.limit ?? 0);
  const earned = Number(capping?.earned ?? 0);
  const remaining = Number(capping?.remaining ?? 0);
  const perDay = Number(today ?? 0);

  /* Only offered when there is something to project FROM. A "0 days" or an
     infinity here would be worse than saying nothing. */
  const daysLeft = perDay > 0 && remaining > 0 ? Math.ceil(remaining / perDay) : null;

  /**
   * A ceiling of zero is not a ceiling that has been reached.
   *
   * The cap is derived from invested capital, so a member with no package has
   * `limit: 0`, `remaining: 0` and `isCapped: true`. Read literally that says
   * "you have earned everything you are ever going to", which is the exact
   * opposite of the truth for somebody who just signed up — and it was the
   * first sentence on their first screen.
   */
  const hasCeiling = limit > 0;
  const reached = hasCeiling && capping?.isCapped === true;

  const segments = STREAMS.map((s) => {
    const row = breakdown.find((b) => b.category === s.key);
    const total = Number(row?.total ?? 0);
    return { ...s, total, width: limit > 0 ? (total / limit) * 100 : 0 };
  }).filter((s) => s.total > 0);

  return (
    <section className="rounded-[5px] border border-line bg-card px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
        <div className="min-w-0">
          <Label>
            Earnings ceiling · {capping?.ceiling ?? 250}% {capping?.ceiling === 300 ? 'active' : 'passive'}
          </Label>

          <div className="mt-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <Figure
              size="xl"
              value={loading ? '—' : hasCeiling ? usd(remaining) : 'Not set'}
              tone={reached ? 'down' : hasCeiling ? 'plain' : 'muted'}
            />
            <span className="text-[12px] text-ink-2">
              {reached ? 'ceiling reached — nothing further accrues'
                : hasCeiling ? 'headroom left'
                : 'your ceiling is set when you buy your first package'}
            </span>
          </div>

          <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-3">
            {hasCeiling ? (
              <>
                <span className="tabular-nums text-ink-2">{usd(earned)}</span> earned of{' '}
                <span className="tabular-nums text-ink-2">{usd(limit)}</span>
                {daysLeft !== null && (
                  <>
                    {' · at today’s rate you reach it in '}
                    <span className="tabular-nums text-ink">{daysLeft}</span>
                    {' trading days'}
                  </>
                )}
              </>
            ) : (
              <>
                You can earn up to{' '}
                <span className="tabular-nums text-ink-2">{capping?.ceiling ?? 250}%</span>{' '}
                of whatever you invest, across every stream combined.
              </>
            )}
          </p>
        </div>

        {hasCeiling && (
          <div className="shrink-0 text-right">
            <Figure size="lg" value={loading ? '—' : pct(capping?.percent ?? 0)} tone="accent" />
            <Label className="mt-1">used</Label>
          </div>
        )}
      </div>

      {/* Segmented by stream. A 2px gap between fills instead of a border, so
          adjacent segments stay distinguishable without a third colour. */}
      <div className="mt-3 flex h-2 gap-[2px] overflow-hidden rounded-[2px] bg-card-2">
        {segments.map((s) => (
          <span key={s.key} style={{ width: `${s.width}%`, background: s.color }} />
        ))}
        <span className="flex-1" />
      </div>

      {segments.length > 0 && (
        <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
          {segments.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="size-[7px] shrink-0 rounded-[1px]" style={{ background: s.color }} />
              <span className="text-[10.5px] text-ink-2">{s.label}</span>
              <span className="tabular-nums text-[10.5px] text-ink">{usd(s.total)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
