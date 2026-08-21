'use client';

import { Clock, Percent, Repeat2, ScrollText } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useWithdrawalTerms } from '@/features/config/use-config';

/**
 * Four things that are true about moving money here.
 *
 * §17 asked for "bank-level security", "instant processing" and "24/7 support"
 * but told us not to state them unless the product actually delivers them. It
 * does not: withdrawals queue for review on an SLA and support runs to a
 * response target, not around the clock. So each line below is either a live
 * setting from the same config the money paths read, or a mechanic of the
 * engine — nothing that would need a marketing team to stand behind it.
 *
 * Internal wallet-to-wallet moves genuinely do settle in one transaction, so
 * that one keeps the word "immediately".
 */
export function WalletFeatureStrip() {
  const terms = useWithdrawalTerms();

  const items: { icon: LucideIcon; title: string; note: string }[] = [
    { icon: Repeat2,    title: 'Transfers settle at once', note: 'Wallet to wallet is immediate' },
    { icon: Clock,      title: 'Withdrawals are reviewed', note: `Usually paid within ${terms.slaHours} hours` },
    { icon: Percent,    title: 'Fees shown upfront', note: `${terms.feePercent}% on withdrawal · none on transfers` },
    { icon: ScrollText, title: 'Every movement is logged', note: 'Open any entry in your passbook' },
  ];

  return (
    <section className="dash-card p-5 sm:p-6">
      <ul className="grid gap-x-5 gap-y-5 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((f, i) => (
          <li
            key={f.title}
            className={`flex min-w-0 items-start gap-3 ${
              i > 0 ? 'xl:border-l xl:border-[var(--dash-border)] xl:pl-5' : ''
            }`}
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-gold/10 text-[var(--color-gold)] ring-1 ring-inset ring-gold-line/25">
              <f.icon size={16} strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <p className="text-[12.5px] font-semibold leading-snug text-ink">{f.title}</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-ink-2">{f.note}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
