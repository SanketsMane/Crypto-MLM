'use client';

import Image from 'next/image';
import { Sparkles } from 'lucide-react';

/**
 * Page hero. The artwork carries its subject — airplane, globe, connected
 * cities — on the RIGHT, so the copy sits left behind a navy scrim that runs
 * left→right. On narrow screens the scrim deepens and the art recedes: the
 * headline never loses contrast, the picture just becomes quieter.
 *
 * Navy in both themes, deliberately — this is brand artwork, not a surface.
 */
export function RoamingHero() {
  return (
    <section
      aria-labelledby="roaming-title"
      className="relative isolate overflow-hidden rounded-[22px] border border-gold/25 bg-navy shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_50px_-28px_rgba(4,16,31,0.8)]"
    >
      <Image
        src="/brand/roaming-travel-bg.webp"
        alt=""
        aria-hidden
        fill
        priority
        sizes="(max-width: 768px) 100vw, (max-width: 1280px) 100vw, 1520px"
        className="-z-10 object-cover object-[72%_12%]"
      />

      {/* readability scrim — the gradient the brief specifies, deepened below sm */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,#071426_0%,rgba(7,20,38,0.93)_36%,rgba(7,20,38,0.60)_70%,rgba(7,20,38,0.24)_100%)] sm:bg-[linear-gradient(90deg,#071426_0%,rgba(7,20,38,0.92)_38%,rgba(7,20,38,0.45)_75%,rgba(7,20,38,0.15)_100%)]"
      />
      {/* on mobile the art sits behind the copy, so add a vertical wash too */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-t from-navy via-navy/55 to-navy/15 sm:hidden"
      />
      {/* soft gold bloom, anchored where the trails leave the frame */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-24 -z-10 h-64 w-64 rounded-full bg-brand-gold/10 blur-3xl"
      />

      <div className="relative flex min-h-[196px] flex-col justify-center gap-2.5 px-5 py-7 sm:min-h-[220px] sm:px-8 sm:py-8">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[rgba(96,70,232,0.35)] bg-[rgba(96,70,232,0.14)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#A99AF5]">
          <Sparkles size={11} strokeWidth={2.4} aria-hidden />
          Exclusive travel rewards
        </span>

        <h1 id="roaming-title" className="text-[27px] font-semibold leading-[1.1] tracking-[-0.025em] text-white sm:text-[32px]">
          Roaming Club
        </h1>

        <p className="max-w-[34ch] text-[14px] font-medium leading-snug text-brand-gold-hi sm:text-[15px]">
          Turn your performance into unforgettable journeys.
        </p>

        <p className="max-w-[46ch] text-[12.5px] leading-relaxed text-white/60">
          Unlock exclusive travel rewards by growing your personal capital and team business.
        </p>
      </div>
    </section>
  );
}
