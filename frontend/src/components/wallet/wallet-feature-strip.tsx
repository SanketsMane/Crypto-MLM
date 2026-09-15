'use client';

import { Clock, Percent, Repeat2, ScrollText } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useWithdrawalTerms } from '@/features/config/use-config';
import { Card, CardHead } from '@/components/ui/primitives';

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
 *
 * Laid out as a definition list under the transfer form rather than as a
 * four-across banner. These are the terms the form runs under, so they belong
 * beside it — and in a third-width column, four columns of icon-and-two-lines
 * became four columns of wrapped text.
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
    <Card>
      <CardHead title="Terms" />
      <ul className="divide-y divide-line-soft">
        {items.map((f) => (
          <li key={f.title} className="flex min-w-0 items-start gap-2.5 px-3.5 py-2.5">
            <f.icon size={14} strokeWidth={2} className="mt-px shrink-0 text-ink-3" />
            <div className="min-w-0">
              <p className="text-[11.5px] font-semibold leading-snug text-ink">{f.title}</p>
              <p className="mt-0.5 text-[10.5px] leading-relaxed text-ink-3">{f.note}</p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
