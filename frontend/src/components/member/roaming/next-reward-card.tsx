'use client';

import Image from 'next/image';
import { ArrowRight, MapPin, PartyPopper, Plane } from 'lucide-react';
import { artFor } from './destinations';
import { RequirementProgress } from './requirement-progress';
import { trackMeta, type TierView } from './types';

/**
 * The featured card: the destination the member is closest to unlocking, with
 * the exact figures that still stand between them and it. Navy in both themes.
 */
export function NextRewardCard({ tier, onView }: { tier: TierView | null; onView: (t: TierView) => void }) {
  if (!tier) {
    return (
      <section className="relative isolate overflow-hidden rounded-[18px] border border-gold/40 bg-navy px-5 py-7 text-center sm:px-8">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_0%,rgba(212,175,55,0.16),transparent_60%)]" />
        <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-gold to-gold-hi text-navy">
          <PartyPopper size={20} strokeWidth={2.2} aria-hidden />
        </span>
        <h2 className="mt-3 text-[19px] font-semibold tracking-[-0.02em] text-white">Every destination qualified</h2>
        <p className="mx-auto mt-1.5 max-w-[46ch] text-[12.5px] leading-relaxed text-white/60">
          You have reached every Roaming Club tier currently open. Fulfilment is handled by the
          FortuneX team — your awards are listed below.
        </p>
      </section>
    );
  }

  const art = artFor(tier.destination);
  const meta = trackMeta(tier.track);
  const pct = Math.floor(tier.overallPct);

  return (
    <section
      aria-labelledby="next-reward-heading"
      className="relative isolate overflow-hidden rounded-[18px] border border-gold/35 bg-navy shadow-[0_20px_50px_-30px_rgba(4,16,31,0.9)]"
    >
      <div className="grid lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        {/* ── destination artwork ─────────────────────────────────────── */}
        <div className="relative min-h-[176px] overflow-hidden lg:min-h-[268px]">
          {art ? (
            <Image
              src={art.image}
              alt={art.alt}
              fill
              sizes="(max-width: 1024px) 100vw, 480px"
              className="object-cover"
            />
          ) : (
            <div aria-hidden className="absolute inset-0 bg-[linear-gradient(140deg,#12121A,#08080E)]" />
          )}

          {/* scrim: vertical while stacked, horizontal into the copy on wide */}
          <div aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0, 0, 0,0.10),rgba(0, 0, 0,0.92))] lg:bg-[linear-gradient(90deg,rgba(0, 0, 0,0.35)_0%,rgba(0, 0, 0,0.20)_45%,rgba(0, 0, 0,0.95)_100%)]" />

          <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-navy/70 px-3 py-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-brand-gold-hi backdrop-blur-sm">
            <Plane size={11} strokeWidth={2.4} aria-hidden />
            Your next reward
          </span>
        </div>

        {/* ── requirements ────────────────────────────────────────────── */}
        <div className="relative flex flex-col justify-center gap-4 p-5 sm:p-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="next-reward-heading" className="text-[24px] font-semibold leading-none tracking-[-0.025em] text-white sm:text-[27px]">
                {tier.destination}
              </h2>
              <span className="rounded-full bg-white/10 px-2.5 py-[3px] text-[10.5px] font-medium text-white/70 ring-1 ring-white/15">
                {meta.short}
              </span>
            </div>
            {art && (
              <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-white/50">
                <MapPin size={12} aria-hidden /> {art.place}
              </p>
            )}
            <p className="mt-2.5 text-[13px] text-white/70">
              You&rsquo;re <span className="font-semibold text-brand-gold-hi tabular-nums">{pct}%</span> there.
            </p>
          </div>

          <div className="space-y-3">
            <RequirementProgress
              label="Self capital"
              actual={tier.selfActual}
              required={tier.selfRequirement}
              tone="gold"
              variant="dark"
            />
            {tier.needsTeam && (
              <RequirementProgress
                label="Team business"
                actual={tier.teamActual}
                required={tier.teamRequirement}
                tone="violet"
                variant="dark"
              />
            )}
          </div>

          <button
            type="button"
            onClick={() => onView(tier)}
            className="inline-flex w-fit items-center gap-1.5 rounded-[10px] bg-[linear-gradient(135deg,#D4AF37_0%,#C49A2C_100%)] px-4 py-2.5 text-[12.5px] font-semibold text-navy shadow-[0_8px_22px_-8px_rgba(212,175,55,0.6)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/30"
          >
            View requirements
            <ArrowRight size={14} strokeWidth={2.5} aria-hidden />
          </button>
        </div>
      </div>
    </section>
  );
}
