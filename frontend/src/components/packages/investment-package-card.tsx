'use client';

import { clsx } from 'clsx';
import { ArrowRight, Loader2 } from 'lucide-react';
import { usd } from '@/lib/format';

/**
 * One card, every plan.
 *
 * The tier decides the numbers, never the layout: identical structure,
 * identical typography and identical height across the grid, so a member
 * compares figures rather than re-reading a new design each time.
 *
 * Rebuilt to drop the artwork. Every card used to carry a 142px render of
 * gold coins stacked under a rising arrow, in two files so it could survive
 * both themes, with a blurred radial wash behind it and a per-tier accent
 * colour driving the wash. Three problems with that:
 *
 *   - It reserved the space it occupied. Every metric row carried
 *     `pr-[118px]` so the values would clear the coins, which is why the
 *     figures sat in the middle of the card instead of against its edge.
 *   - The per-tier accent said a $110 plan and a $52,200 plan were different
 *     KINDS of thing. They are the same product at ten sizes; the only
 *     difference that matters is the amount, and the amount is already the
 *     largest element on the card.
 *   - Stock coin clipart is the visual register of the thing this product
 *     most needs not to be mistaken for.
 *
 * What replaces it is the figure and the terms, at full width.
 */

export interface PackageCardData {
  id: string;
  name: string;
  /** Decimal string from the API — never parsed for display, only for maths. */
  amount: string;
  dailyReturnPercent: string;
  earnLimit: number;
  tradingDays: string;
  isPopular?: boolean;
}

export function InvestmentPackageCard({
  plan, affordable, fundAvailable, pending, disabled, onInvest,
}: {
  plan: PackageCardData;
  affordable: boolean;
  fundAvailable: number;
  pending?: boolean;
  disabled?: boolean;
  onInvest: () => void;
}) {
  const amount = Number(plan.amount);
  /* What the plan pays on a trading day, in money rather than in percent.
     "0.5%" is the rule; "$2.65 a trading day" is what a member is deciding
     about, and it was the one figure the card made them work out. */
  const perDay = (amount * Number(plan.dailyReturnPercent)) / 100;

  const metrics = [
    { label: 'Daily return', value: `${plan.dailyReturnPercent}%`, tone: 'good' as const },
    { label: 'Earn limit', value: usd(plan.earnLimit, 0) },
    { label: 'Trading days', value: plan.tradingDays },
  ];

  return (
    <article
      className={clsx(
        'group relative flex flex-col overflow-hidden rounded-[5px] border bg-card transition-colors duration-140',
        plan.isPopular ? 'border-gold' : 'border-line hover:border-line-strong',
      )}
    >
      {/* ── header rail ── */}
      <header className="flex h-[30px] shrink-0 items-center justify-between gap-2 border-b border-line px-3.5">
        <h3 className="truncate text-[10px] font-semibold uppercase tracking-[0.09em] text-ink-3">
          {plan.name}
        </h3>
        {plan.isPopular && (
          <span className="shrink-0 rounded-[3px] bg-gold px-1.5 py-[2px] text-[9px] font-bold uppercase leading-none tracking-[0.06em] text-gold-on">
            Popular
          </span>
        )}
      </header>

      <div className="flex flex-1 flex-col p-3.5">
        {/* ── price: the strongest element, one size for every tier ── */}
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="text-[30px] font-semibold leading-none tracking-[-0.03em] text-ink tabular-nums">
            {usd(plan.amount, 0)}
          </p>
          <span className="text-[10.5px] text-ink-3">one-off</span>
        </div>

        <p className="mt-1.5 text-[11.5px] text-ink-2 tabular-nums">
          {/* Cents only where they change the answer: at $110 a day is $0.55,
              and rounding that to "$1" overstates it by 82%. */}
          <span className="text-ink">
            {perDay >= 10 ? usd(perDay, 0) : usd(perDay)}
          </span>{' '}
          per trading day
        </p>

        {/* ── terms: full width now, so values sit against the card edge ── */}
        <dl className="mt-3 divide-y divide-line-soft border-y border-line-soft">
          {metrics.map(({ label, value, tone }) => (
            <div key={label} className="flex items-center justify-between gap-3 py-[7px]">
              <dt className="text-[11.5px] text-ink-3">{label}</dt>
              <dd className={clsx('text-[11.5px] font-semibold tabular-nums',
                tone === 'good' ? 'text-good' : 'text-ink')}>
                {value}
              </dd>
            </div>
          ))}
        </dl>

        {/* ── action ── */}
        <div className="mt-auto pt-3.5">
          <button
            onClick={onInvest}
            disabled={disabled || pending}
            className={clsx(
              'inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-[4px] text-[12.5px] font-semibold',
              'transition-colors duration-140 disabled:cursor-not-allowed disabled:opacity-55',
              'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/25',
              affordable
                ? 'bg-gold text-gold-on hover:bg-gold-hi'
                : 'border border-line-strong bg-transparent text-ink hover:border-gold hover:text-gold',
            )}
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : null}
            {affordable ? 'Invest now' : 'Top up to invest'}
            {!pending && <ArrowRight size={13} strokeWidth={2.4} />}
          </button>

          {/* Always shown, so the card answers "can I afford this?" without a
              click — and says how much short when the answer is no. */}
          <p className="mt-2 text-center text-[10.5px] text-ink-3">
            {affordable
              ? <>Fund wallet has <span className="tabular-nums text-ink-2">{usd(fundAvailable)}</span></>
              : <><span className="tabular-nums text-ink-2">{usd(amount - fundAvailable)}</span> short of this tier</>}
          </p>
        </div>
      </div>
    </article>
  );
}
