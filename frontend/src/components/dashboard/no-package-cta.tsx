import { ArrowRight, Box } from 'lucide-react';
import { GoldCta } from './gold-cta';

/**
 * Onboarding, not an alert.
 *
 * A member with no package is at the start of the journey, not in an error
 * state — hence a warm gold wash rather than the amber warning tint, and a
 * next step rather than a dismissal.
 */
export function NoPackageCta() {
  return (
    <section className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-[5px] border border-gold-line/25 bg-[linear-gradient(135deg,rgba(226,103,10,0.09)_0%,rgba(226,103,10,0.035)_100%)] p-5">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[5px] bg-gold/15 text-[var(--color-gold-on-soft)] ring-1 ring-inset ring-gold-line/25">
          <Box size={18} strokeWidth={2.1} />
        </span>
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-ink">You have no active package</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">
            Daily returns and team commissions only start once a package is active.
          </p>
        </div>
      </div>
      <GoldCta href="/packages" size="sm" className="ml-13 min-[420px]:ml-0">
        Choose a plan
        <ArrowRight size={14} strokeWidth={2.4} />
      </GoldCta>
    </section>
  );
}
