'use client';

import Link from 'next/link';
import { ArrowDownToLine, ArrowRight, ArrowUpFromLine, Clock, Coins, Percent, ShieldCheck, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { usd } from '@/lib/format';
import { useWithdrawalTerms } from '@/features/config/use-config';

/**
 * The wallet: the number a member signs in to see, and the two actions they
 * came to do. Both destinations are unchanged — /deposit and /withdrawals.
 *
 * The surface (brand artwork, scrim, gold hairline) is `.balance-panel` in
 * globals.css. Navy in both themes, like the sidebar: it is a brand object.
 */
export function BalancePanel({ main, walletAddress, todayIncome }: {
  main?: string;
  walletAddress?: string | null;
  /** Real credits posted today. Used for the secondary metric — never invented. */
  todayIncome?: string;
}) {
  /* Already cached with a 5-minute stale time and read by several screens, so
     this adds no request of its own. Every figure in the strip below is the
     value the engine actually enforces, not copy. */
  const terms = useWithdrawalTerms();

  const earnedToday = Number(todayIncome ?? 0);

  /**
   * Deliberately not "▲ 0.00% vs last 7 days": there is no balance history in
   * the API, and a percentage invented from a single reading would be a
   * financial claim with nothing behind it. Today's credits are a real figure
   * the dashboard already holds, and the zero case says so plainly.
   */
  const metric = earnedToday > 0
    ? { text: `+${usd(todayIncome)} credited today`, good: true }
    : { text: 'No credits posted today', good: false };

  const facts: { icon: LucideIcon; label: string; note: string }[] = [
    ...(terms.kycRequired
      ? [{ icon: ShieldCheck, label: 'Verified payouts', note: 'KYC checked first' }]
      : [{ icon: ShieldCheck, label: 'Protected account', note: 'Two-factor available' }]),
    { icon: Clock, label: 'Reviewed first', note: `Usually within ${terms.slaHours}h` },
    { icon: Percent, label: 'Fee shown upfront', note: `${terms.feePercent}% on withdrawal` },
    { icon: Coins, label: 'Paid on-chain', note: terms.network },
  ];

  return (
    <section className="balance-panel relative isolate flex flex-1 flex-col overflow-hidden rounded-[5px] p-5 sm:p-7 xl:p-10">
      <div className="relative flex items-start gap-3.5 sm:gap-4">
        <span className="grid size-13 shrink-0 place-items-center rounded-[5px] border border-gold-line/35 bg-white/[0.06] text-[var(--color-gold-hi)] sm:size-14">
          <Wallet size={22} strokeWidth={1.9} />
        </span>
        <div className="min-w-0">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/65 sm:text-[12px]">
            Available balance
          </h2>
          <p className="mt-1.5 truncate text-[34px] font-semibold leading-none tracking-[-0.035em] text-white tabular-nums sm:text-[46px] lg:text-[56px]">
            {usd(main)}
          </p>
        </div>
      </div>

      <div className="relative mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] sm:mt-5">
        <span className="text-white/60">Ready to withdraw</span>
        <span aria-hidden className="text-white/20">·</span>
        <span className={`tabular-nums ${metric.good ? 'text-[#4ADE80]' : 'text-white/60'}`}>
          {metric.text}
        </span>
      </div>

      {walletAddress && (
        <p className="relative mt-1.5 text-[11.5px] tabular-nums text-white/50">
          Payout wallet {walletAddress.slice(0, 8)}…{walletAddress.slice(-6)}
        </p>
      )}

      <div className="relative mt-6 grid grid-cols-1 gap-4 sm:mt-7 sm:grid-cols-2 sm:gap-5">
        <Link href="/deposit" className="wallet-action wallet-action-gold h-14 text-[14.5px]">
          <span className="flex items-center gap-2">
            <ArrowDownToLine size={17} strokeWidth={2.3} /> Deposit
          </span>
          <ArrowRight size={17} strokeWidth={2.3} className="opacity-70" />
        </Link>
        <Link href="/withdrawals" className="wallet-action wallet-action-ghost h-14 text-[14.5px]">
          <span className="flex items-center gap-2">
            <ArrowUpFromLine size={17} strokeWidth={2.3} /> Withdraw
          </span>
          <ArrowRight size={17} strokeWidth={2.3} className="opacity-60" />
        </Link>
      </div>

      {/* Every line here is a live setting, so the card cannot drift from what
          the engine does when an operator changes the fee or the window. */}
      <ul className="wallet-facts relative mt-6 grid gap-x-4 gap-y-4 border-t border-white/10 pt-5 sm:mt-7">
        {facts.map((f) => (
          <li key={f.label} className="flex min-w-0 items-start gap-2.5">
            <f.icon size={15} strokeWidth={2} className="mt-px shrink-0 text-[var(--color-gold-hi)]/75" />
            <div className="min-w-0">
              <p className="truncate text-[12px] font-medium text-white/90">{f.label}</p>
              <p className="mt-0.5 truncate text-[11px] text-white/60">{f.note}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
