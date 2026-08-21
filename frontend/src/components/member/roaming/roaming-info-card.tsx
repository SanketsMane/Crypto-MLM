'use client';

import { Info } from 'lucide-react';

/** Closing note. Deliberately quiet — it explains, it does not sell. */
export function RoamingInfoCard() {
  return (
    <aside className="relative isolate overflow-hidden rounded-[14px] border border-gold/25 bg-card px-5 py-4 shadow-card">
      {/* decorative meridians, echoing the globe in the hero */}
      <svg
        aria-hidden
        viewBox="0 0 200 200"
        className="pointer-events-none absolute right-5 top-1/2 hidden h-[86px] w-[86px] -translate-y-1/2 text-gold opacity-[0.16] sm:block"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      >
        <circle cx="100" cy="100" r="72" />
        <circle cx="100" cy="100" r="52" />
        <ellipse cx="100" cy="100" rx="30" ry="72" />
        <ellipse cx="100" cy="100" rx="60" ry="72" />
        <path d="M28 100h144M40 66h120M40 134h120" />
      </svg>

      <div className="relative flex items-start gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-gold-soft text-gold-on-soft ring-1 ring-gold/30">
          <Info size={15} strokeWidth={2.2} aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-[13.5px] font-semibold text-ink">Important note</h2>
          <p className="mt-1 max-w-[74ch] text-[12.5px] leading-relaxed text-ink-2">
            Roaming Club rewards are outside your earnings cap and are based on performance across the
            two independent tracks. Awards are travel entitlements rather than cash, so nothing is
            posted to your wallet — fulfilment is arranged by the FortuneX team once a tier is reached.
          </p>
        </div>
      </div>
    </aside>
  );
}
