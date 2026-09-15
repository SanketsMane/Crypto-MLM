'use client';

import Image from 'next/image';
import { Plane } from 'lucide-react';
import type { Standing } from './types';

/**
 * Page hero, drawn as a boarding pass: the programme above the perforation,
 * the member's live standing below it. Folding the three headline figures into
 * the hero is the point — the old page opened with artwork and then repeated
 * "your progress" across three separate panels underneath.
 *
 * The artwork carries its subject on the RIGHT, so the copy sits left behind a
 * scrim that runs left→right. On narrow screens the scrim deepens and the art
 * recedes: the headline never loses contrast, the picture just goes quiet.
 *
 * Navy in both themes, deliberately — this is brand artwork, not a surface.
 */
export function FlyersHero({ standing }: { standing: Standing | null }) {
  return (
    <section
      aria-labelledby="flyers-title"
      className="relative isolate overflow-hidden rounded-[5px] border border-gold/25 bg-navy shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_50px_-28px_rgba(4,16,31,0.8)]"
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

      {/* readability scrim, deepened below sm where the art sits under the copy */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,#08080E_0%,rgba(0,0,0,0.93)_36%,rgba(0,0,0,0.60)_70%,rgba(0,0,0,0.24)_100%)] sm:bg-[linear-gradient(90deg,#08080E_0%,rgba(0,0,0,0.92)_38%,rgba(0,0,0,0.45)_75%,rgba(0,0,0,0.15)_100%)]"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-t from-navy via-navy/55 to-navy/15 sm:hidden"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-24 -z-10 h-64 w-64 rounded-full bg-brand-gold/10 blur-3xl"
      />

      {/* ── the stub ─────────────────────────────────────────────────── */}
      <div className="relative px-5 pb-6 pt-6 sm:px-8 sm:pb-7 sm:pt-8">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-gold/35 bg-gold/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-gold-hi">
          <Plane size={11} strokeWidth={2.4} aria-hidden />
          Member travel programme
        </span>

        <h1
          id="flyers-title"
          className="mt-2.5 text-[27px] font-semibold leading-[1.05] tracking-[-0.03em] text-white sm:text-[34px]"
        >
          Affiliate offers
        </h1>

        <p className="mt-1.5 max-w-[36ch] text-[14px] font-medium leading-snug text-brand-gold-hi sm:text-[15px]">
          Turn your performance into departures.
        </p>

        <p className="mt-1.5 max-w-[48ch] text-[12.5px] leading-relaxed text-white/55">
          Destinations are earned on your own capital, on your team business, or on both. Awards sit
          outside your earnings cap.
        </p>
      </div>

      {/* ── perforation ──────────────────────────────────────────────── */}
      <div aria-hidden className="relative h-0">
        <span className="absolute -left-[9px] top-1/2 h-[18px] w-[18px] -translate-y-1/2 rounded-full bg-canvas" />
        <span className="absolute -right-[9px] top-1/2 h-[18px] w-[18px] -translate-y-1/2 rounded-full bg-canvas" />
        <div className="mx-6 border-t border-dashed border-white/25 sm:mx-9" />
      </div>

      {/* ── the counterfoil: live standing ───────────────────────────── */}
      <dl className="relative grid grid-cols-1 divide-y divide-white/10 bg-black/25 backdrop-blur-[2px] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Figure label="Destinations qualified">
          {standing ? (
            <span className="tabular-nums">
              {standing.qualified}
              <span className="text-[15px] font-normal text-white/45"> of {standing.total}</span>
            </span>
          ) : <Placeholder w="w-16" />}
        </Figure>

        <Figure label="Next destination">
          {standing ? (
            <span className="truncate">{standing.next?.destination ?? 'All reached'}</span>
          ) : <Placeholder w="w-24" />}
        </Figure>

        <Figure label={standing?.next ? `Progress to ${standing.next.destination}` : 'Programme progress'}>
          {standing ? (
            <>
              <span className="tabular-nums">{standing.pct}%</span>
              <span
                role="progressbar"
                aria-valuenow={standing.pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={
                  standing.next
                    ? `Progress toward ${standing.next.destination}`
                    : 'Programme progress'
                }
                className="mt-2 block h-1.5 w-full max-w-[180px] overflow-hidden rounded-full bg-white/15"
              >
                <span
                  className="block h-full rounded-full bg-[linear-gradient(90deg,#E2670A,#FF7A1A,#FF9647)] transition-[width] duration-700 ease-out"
                  style={{ width: `${Math.max(3, standing.pct)}%` }}
                />
              </span>
            </>
          ) : <Placeholder w="w-12" />}
        </Figure>
      </dl>
    </section>
  );
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 px-5 py-3.5 sm:px-6 sm:py-4">
      <dt className="truncate text-[9.5px] font-semibold uppercase tracking-[0.14em] text-white/45">
        {label}
      </dt>
      <dd className="mt-1 truncate text-[19px] font-semibold leading-none tracking-[-0.02em] text-white">
        {children}
      </dd>
    </div>
  );
}

/** the counterfoil keeps its height while the figures load, so nothing jumps */
const Placeholder = ({ w }: { w: string }) => (
  <span aria-hidden className={`block h-[15px] ${w} animate-pulse rounded bg-white/15`} />
);
