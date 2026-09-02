'use client';

import { Info } from 'lucide-react';

/** Closing note. Deliberately quiet — it explains, it does not sell. */
export function FlyersNote() {
  return (
    <aside className="relative isolate overflow-hidden rounded-[14px] border border-gold/25 bg-card px-5 py-4 shadow-card">
      {/* decorative flight arc, echoing the rail above */}
      <svg
        aria-hidden
        viewBox="0 0 200 120"
        className="pointer-events-none absolute right-4 top-1/2 hidden h-[92px] w-[150px] -translate-y-1/2 text-gold opacity-[0.16] sm:block"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
      >
        <path d="M8 104C46 26 138 12 192 20" strokeDasharray="5 6" />
        <path d="M8 104C52 60 130 44 192 52" />
        <circle cx="8" cy="104" r="4" fill="currentColor" stroke="none" />
        <circle cx="100" cy="55" r="3" />
        <circle cx="192" cy="20" r="4" fill="currentColor" stroke="none" />
      </svg>

      <div className="relative flex items-start gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-gold-soft text-gold-on-soft ring-1 ring-gold/30">
          <Info size={15} strokeWidth={2.2} aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-[13.5px] font-semibold text-ink">Important note</h2>
          <p className="mt-1 max-w-[70ch] text-[12.5px] leading-relaxed text-ink-2">
            Flyers Club rewards are outside your earnings cap and are based on performance across the
            two independent routes. Awards are travel entitlements rather than cash, so nothing is
            posted to your wallet — fulfilment is arranged by the FortuneX team once a tier is reached.
          </p>
        </div>
      </div>
    </aside>
  );
}
