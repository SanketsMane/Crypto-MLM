'use client';

import Image from 'next/image';
import { clsx } from 'clsx';
import { ArrowRight, CalendarDays, Gauge, Loader2, TrendingUp } from 'lucide-react';
import { usd } from '@/lib/format';

/**
 * One card, every plan.
 *
 * The tier decides the numbers, never the layout: identical structure, identical
 * typography and identical height across the grid, so a member compares figures
 * rather than re-reading a new design each time. The only thing that varies is a
 * faint accent behind the artwork — the card itself stays FortuneX navy.
 */

export type PlanAccent = 'gold' | 'violet' | 'blue' | 'green' | 'magenta';

export interface PackageCardData {
  id: string;
  name: string;
  /** Decimal string from the API — never parsed for display, only for maths. */
  amount: string;
  dailyReturnPercent: string;
  earnLimit: number;
  tradingDays: string;
  isPopular?: boolean;
  accent?: PlanAccent;
}

/** A soft wash behind the artwork. Subtle enough that the grid still reads as one family. */
const ACCENT_GLOW: Record<PlanAccent, string> = {
  gold: 'rgba(212,175,55,0.20)',
  violet: 'rgba(139,109,246,0.18)',
  blue: 'rgba(59,130,246,0.17)',
  green: 'rgba(22,179,100,0.16)',
  magenta: 'rgba(214,64,159,0.15)',
};

/**
 * Deterministic accent per position in the ladder, so a plan always looks the
 * same and the sequence never reshuffles between renders.
 */
export function accentForIndex(i: number): PlanAccent {
  return (['gold', 'violet', 'blue', 'green', 'magenta', 'gold', 'blue', 'violet', 'gold', 'blue'] as const)[i % 10];
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
  const accent = ACCENT_GLOW[plan.accent ?? 'gold'];

  const metrics = [
    { Icon: TrendingUp, label: 'Daily return', value: `${plan.dailyReturnPercent}%`, good: true },
    { Icon: Gauge, label: 'Earn limit', value: usd(plan.earnLimit, 0) },
    { Icon: CalendarDays, label: 'Trading days', value: plan.tradingDays },
  ];

  return (
    <article
      className={clsx(
        'plan-card group relative isolate flex min-h-[300px] flex-col overflow-hidden rounded-2xl border p-5',
        'transition-[transform,box-shadow,border-color] duration-[180ms] ease-out',
        'hover:-translate-y-[3px]',
        plan.isPopular && 'ring-1 ring-gold/35',
      )}
    >
      {/* ── artwork ───────────────────────────────────────────────────────
          Anchored to the corner the layout deliberately leaves empty, and
          held clear of the CTA. `pointer-events-none` so it never eats a
          click meant for the button underneath it. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-1 bottom-[92px] -z-10 h-[128px] w-[128px] select-none
                   transition-transform duration-[180ms] ease-out group-hover:-translate-y-[3px]
                   sm:h-[142px] sm:w-[142px]"
      >
        {/* Depth behind the artwork on navy. Deliberately dark-only: the same
            blurred wash over a white card reads as a smudge, not as light. */}
        <span
          className="absolute inset-0 -z-10 hidden rounded-full blur-2xl dark:block"
          style={{ background: `radial-gradient(circle at 62% 60%, ${accent}, transparent 68%)` }}
        />
        {/* Two treatments of one framing: the dark file keeps the ambient glow
            that reads as atmosphere on navy; the light file drops it and deepens
            the gold so the coins hold their form against white. */}
        <Image src="/brand/plan-growth-v2.png" alt="" fill sizes="160px"
               className="object-contain object-[100%_100%] opacity-[0.85] dark:block hidden" />
        <Image src="/brand/plan-growth-light-v2.png" alt="" fill sizes="160px"
               className="object-contain object-[100%_100%] opacity-100 dark:hidden block" />
      </span>

      {/* ── header ── */}
      <header className="flex min-h-[22px] items-start justify-between gap-3">
        <h3 className="text-[12px] font-semibold uppercase leading-tight tracking-[0.08em] text-gold">
          {plan.name}
        </h3>
        {plan.isPopular && (
          <span className="shrink-0 rounded-md bg-[linear-gradient(135deg,#D4AF37_0%,#C49A2C_100%)] px-2 py-[3px] text-[10px] font-bold uppercase leading-none tracking-[0.06em] text-navy">
            Popular
          </span>
        )}
      </header>

      {/* ── price: the strongest element on the card, one size for every tier ── */}
      <p className="mt-2.5 text-[34px] font-bold leading-none tracking-[-0.03em] text-ink tabular-nums">
        {usd(plan.amount, 0)}
      </p>

      {/* ── metrics: fixed two-column rows so values align across the grid ── */}
      <dl className="mt-5 space-y-[9px] pr-[118px] sm:pr-[132px]">
        {metrics.map(({ Icon, label, value, good }) => (
          <div key={label} className="flex items-center gap-2.5">
            <Icon size={15} strokeWidth={1.9} className="shrink-0 text-gold/75" />
            <dt className="text-[12.5px] text-ink-2">{label}</dt>
            <dd className={clsx('ml-auto text-[13px] font-semibold tabular-nums',
              good ? 'text-good' : 'text-ink')}>
              {value}
            </dd>
          </div>
        ))}
      </dl>

      {/* ── action ── */}
      <div className="relative mt-auto pt-6">
        <button
          onClick={onInvest}
          disabled={disabled || pending}
          className={clsx(
            'inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px] text-[14px] font-semibold',
            'transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-55',
            'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/30',
            affordable
              ? 'bg-[linear-gradient(135deg,#D4AF37_0%,#E5C158_100%)] text-navy shadow-[0_6px_18px_-8px_rgba(212,175,55,0.7)] group-hover:brightness-[1.06]'
              : 'border border-gold/40 bg-transparent text-gold hover:bg-gold/10',
          )}
        >
          {pending ? <Loader2 size={15} className="animate-spin" /> : null}
          {affordable ? 'Invest now' : 'Top up to invest'}
          {!pending && <ArrowRight size={15} strokeWidth={2.4} />}
        </button>

        {/* Always shown, so the card answers "can I afford this?" without a click. */}
        <p className="mt-2 text-center text-[12px] text-ink-3">
          Fund wallet has <span className="tabular-nums">{usd(fundAvailable)}</span>
        </p>
      </div>
    </article>
  );
}
