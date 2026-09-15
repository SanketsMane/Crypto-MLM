'use client';

import { usd } from '@/lib/format';

/**
 * The live tape across the top of the terminal.
 *
 * New structure, not a restyle: the old dashboard opened with a "Good night,
 * Sanket" greeting and a subtitle. Pleasant, and it told the member nothing.
 * A member opens this product to answer one question — "did I earn today?" —
 * and this answers it in the first row, before any panel.
 *
 * Accrual status is stated explicitly rather than implied by a zero. The plan
 * pays Monday to Friday, so a $0 on a Sunday is correct and a $0 on a Tuesday
 * is a problem; a member cannot tell those apart from the figure alone.
 */

export interface TapeProps {
  today?: string;
  yesterday?: string;
  total?: string;
  nextPayoutDate?: string | null;
  tradingDays?: number[];
  loading?: boolean;
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex shrink-0 items-baseline gap-1.5">
      <span className="text-[9.5px] font-semibold uppercase tracking-[0.09em] text-ink-3">{label}</span>
      <span className="tabular-nums text-[12px] font-semibold text-ink">{children}</span>
    </div>
  );
}

export function TapeStrip({ today, yesterday, total, nextPayoutDate, tradingDays, loading }: TapeProps) {
  const t = Number(today ?? 0);

  /* ISO weekday, in the member's own timezone — the gate the payout job
     applies is the platform's, but for a status pill "is today a trading day"
     is what the member means by today. */
  const iso = ((new Date().getDay() + 6) % 7) + 1;
  const isTradingDay = (tradingDays ?? [1, 2, 3, 4, 5]).includes(iso);

  const status = !isTradingDay
    ? { dot: 'bg-ink-4', text: 'markets closed' }
    : t > 0
      ? { dot: 'bg-good', text: 'accrued today' }
      : { dot: 'bg-warn', text: 'awaiting today’s run' };

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line bg-canvas-2 px-3 py-2">
      <div className="flex shrink-0 items-center gap-1.5">
        <span className={`size-[6px] rounded-full ${status.dot}`} />
        <span className="text-[10.5px] text-ink-2">{status.text}</span>
      </div>

      <span className="h-3.5 w-px shrink-0 bg-line" />

      <Cell label="Today">
        {loading ? '—' : <span className={t > 0 ? 'text-good' : 'text-ink-3'}>{t > 0 ? `+${usd(t)}` : usd(0)}</span>}
      </Cell>
      <Cell label="Yesterday">{loading ? '—' : usd(yesterday)}</Cell>
      <Cell label="Lifetime">{loading ? '—' : usd(total)}</Cell>

      <div className="ml-auto flex shrink-0 items-baseline gap-1.5">
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.09em] text-ink-3">Next settlement</span>
        <span className="tabular-nums text-[12px] font-semibold text-ink">
          {nextPayoutDate
            ? new Date(nextPayoutDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
            : 'continuous'}
        </span>
      </div>
    </div>
  );
}
