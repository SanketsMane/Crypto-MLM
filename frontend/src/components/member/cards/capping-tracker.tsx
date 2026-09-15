'use client';

import { Card, CardHead } from '@/components/ui/primitives';
import { usd, pct } from '@/lib/format';

/**
 * The ceiling on everything a member can earn. Showing it plainly is the single
 * most useful thing on this page — it explains why a payout stops.
 */
export function CappingTracker({ capping }: {
  capping?: { limit: string; earned: string; remaining: string; isCapped: boolean; percent: number; ceiling: number; mode: string };
}) {
  const p = Math.min(100, capping?.percent ?? 0);
  /* A member with no package has zero headroom, but that is "not started",
     not "capped out" — the two states need different words and colour. */
  const noPackage = Number(capping?.limit ?? 0) <= 0;
  const capped = !noPackage && (capping?.isCapped ?? false);

  return (
    <Card className="dash-card flex h-full flex-col">
      <CardHead
        title="Earnings Cap"
        action={
          <span className="rounded-full bg-gold-soft px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-gold">
            {capping?.ceiling ?? 250}% ceiling
          </span>
        }
      />
      <div className="flex flex-1 flex-col px-5 pb-5">
        <div className="flex items-baseline justify-between">
          <p className="text-[26px] font-semibold tabular-nums tracking-[-0.03em] leading-none text-ink">{usd(capping?.earned)}</p>
          <p className="text-[13px] tabular-nums text-ink-2">of {usd(capping?.limit)}</p>
        </div>

        <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-[var(--dash-well)] ring-1 ring-inset ring-[var(--dash-border)]">
          <div className={`h-full rounded-full transition-[width] duration-700 ${capped ? 'bg-bad' : 'bg-gold'}`}
               style={{ width: noPackage ? '0%' : `${Math.max(1.5, p)}%` }} />
        </div>

        <div className="mt-2.5 flex items-center justify-between text-[12px]">
          <span className="tabular-nums text-ink-2">{pct(p)} used</span>
          <span className="tabular-nums text-ink-2">{usd(capping?.remaining)} remaining</span>
        </div>

        <p className={`mt-auto pt-4 rounded-[4px] px-3 py-2.5 text-[12px] leading-relaxed ${
          capped ? 'bg-bad-soft text-bad' : noPackage ? 'bg-gold/[0.08] text-ink-2' : 'bg-canvas text-ink-2'}`}>
          {capped
            ? 'You have reached your cap. Top up a package to start earning again.'
            : noPackage
              ? `Your cap is set when you buy your first package — you can earn up to ${capping?.ceiling ?? 250}% of whatever you invest.`
              : `On the ${capping?.mode === 'ACTIVE' ? 'active' : 'passive'} plan you can earn up to ${capping?.ceiling ?? 250}% of the capital you invest. Every payout counts toward it.`}
        </p>
      </div>
    </Card>
  );
}
