'use client';

import { ArrowRight } from 'lucide-react';
import { GoldCta } from './gold-cta';
import { useGreeting } from '@/lib/greeting';

/**
 * The dashboard draws its own heading rather than using `PageHeader`: it runs
 * a larger type scale and picks the member's name out in gold. `PageHeader` is
 * shared by 26 screens, so that treatment does not belong in it.
 *
 * The greeting follows the member's local time — see `useGreeting`.
 */
export function WelcomeHeader({ firstName }: { firstName?: string }) {
  const greeting = useGreeting();

  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 sm:mb-6">
      <div className="min-w-0">
        <h1 suppressHydrationWarning
            className="text-[24px] font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-[28px]">
          {greeting},{' '}
          <span className="text-[var(--color-gold-on-soft)]">{firstName ?? 'there'}</span>
        </h1>
        <p className="mt-1.5 text-[13.5px] text-ink-2">
          Your earnings, packages and network at a glance.
        </p>
      </div>
      <GoldCta href="/packages">
        Invest now
        <ArrowRight size={15} strokeWidth={2.4} />
      </GoldCta>
    </div>
  );
}
