'use client';

import Image from 'next/image';
import { clsx } from 'clsx';
import { ArrowRight, Check, Lock, MapPin, PartyPopper, Plane } from 'lucide-react';
import { usd } from '@/lib/format';
import { artFor } from './destinations';
import { RequirementProgress } from './requirement-progress';
import { trackMeta, type JourneyStop, type TierView } from './types';

/**
 * "Your route" — the rail of every destination, and directly beneath it the
 * one the member is actually working toward.
 *
 * These used to be two panels (a journey rail and a navy featured card) that
 * repeated the same percentage. Joining them puts the rail and the reason the
 * rail matters in one reading: where you are, and what closes the next gap.
 */
export function RoutePanel({
  stops, next, onView,
}: {
  stops: JourneyStop[];
  next: TierView | null;
  onView: (t: TierView) => void;
}) {
  const done = stops.filter((s) => s.state === 'done').length;

  return (
    <section
      aria-labelledby="route-heading"
      className="overflow-hidden rounded-[5px] border border-line bg-card shadow-card"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pb-4 pt-5">
        <div className="min-w-0">
          <h2 id="route-heading" className="text-[16px] font-semibold leading-tight tracking-[-0.015em] text-ink">
            Your route
          </h2>
          <p className="mt-1 text-[12.5px] text-ink-2">
            Every destination in tier order. A stop counts as reached once either route awards it.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-gold-soft px-3 py-1 text-[11px] font-medium tabular-nums text-gold-on-soft">
          {done} of {stops.length} qualified
        </span>
      </header>

      {/* the rail keeps its shape on every screen; below ~600px it scrolls
          inside the panel rather than squeezing the stops together */}
      <div className="fx-scrollbar-hide overflow-x-auto px-5 pb-6">
        <div className="min-w-[580px]">
          <ol className="relative flex items-start">
            {stops.map((stop, i) => (
              <li key={stop.destination} className="relative flex flex-1 flex-col items-center px-1 text-center">
                {i > 0 && (
                  <span
                    aria-hidden
                    className={clsx(
                      'absolute right-1/2 top-[15px] h-[2px] w-full rounded-full',
                      stops[i - 1].state === 'done'
                        ? 'bg-gradient-to-r from-gold-dark to-gold'
                        : 'bg-line',
                    )}
                  />
                )}

                <span className={clsx(
                  'relative z-10 grid h-8 w-8 place-items-center rounded-full border transition-colors',
                  stop.state === 'done' && 'border-gold/60 bg-gradient-to-br from-gold to-gold-hi text-gold-on',
                  stop.state === 'current' && 'fx-stop-pulse border-2 border-gold bg-card text-gold',
                  stop.state === 'locked' && 'border-line bg-canvas text-ink-3',
                )}>
                  {stop.state === 'done' ? <Check size={15} strokeWidth={2.8} aria-hidden />
                    : stop.state === 'current' ? <Plane size={14} strokeWidth={2.3} aria-hidden />
                    : <Lock size={12} strokeWidth={2.3} aria-hidden />}
                </span>

                <span className={clsx(
                  'mt-2 text-[12px] font-medium leading-tight',
                  stop.state === 'locked' ? 'text-ink-3' : 'text-ink',
                )}>
                  {stop.destination}
                </span>
                <span className="mt-0.5 text-[10.5px] tabular-nums text-ink-3">
                  from {usd(stop.fromSelf, 0)}
                </span>
                <span className="sr-only">
                  {stop.state === 'done' ? 'Qualified'
                    : stop.state === 'current' ? 'In progress — your next destination'
                    : 'Locked'}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {next ? <NextStop tier={next} onView={onView} /> : <AllReached />}
    </section>
  );
}

/* ── the destination the member is closest to ──────────────────────────── */

function NextStop({ tier, onView }: { tier: TierView; onView: (t: TierView) => void }) {
  const art = artFor(tier.destination);
  const meta = trackMeta(tier.track);
  const pct = Math.floor(tier.overallPct);
  const left = (actual: string, required: string) => Math.max(0, Number(required) - Number(actual));
  const selfLeft = left(tier.selfActual, tier.selfRequirement);
  const teamLeft = tier.needsTeam ? left(tier.teamActual, tier.teamRequirement) : 0;

  return (
    <div className="grid border-t border-line-soft bg-canvas-2 sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
      {/* ── artwork ──────────────────────────────────────────────────── */}
      <div className="relative isolate min-h-[132px] overflow-hidden bg-navy sm:min-h-full">
        {art ? (
          <Image
            src={art.image}
            alt={art.alt}
            fill
            sizes="(max-width: 640px) 100vw, 240px"
            className="object-cover"
          />
        ) : (
          <div aria-hidden className="absolute inset-0 bg-[linear-gradient(140deg,#12121A,#08080E)]" />
        )}
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.15),rgba(0,0,0,0.80))]"
        />
        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-navy/70 px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-brand-gold-hi backdrop-blur-sm">
          <Plane size={10} strokeWidth={2.4} aria-hidden />
          Next stop
        </span>
        <div className="absolute inset-x-3 bottom-3">
          <p className="truncate text-[19px] font-semibold leading-tight tracking-[-0.02em] text-white">
            {tier.destination}
          </p>
          {art && (
            <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-white/55">
              <MapPin size={11} aria-hidden className="shrink-0" /> {art.place}
            </p>
          )}
        </div>
      </div>

      {/* ── what still stands between them and it ────────────────────── */}
      <div className="flex flex-col gap-3.5 p-5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <span className="rounded-full bg-mute-soft px-2 py-[3px] text-[10px] font-medium uppercase tracking-[0.06em] text-mute-on">
            {meta.short} route
          </span>
          <span className="text-[12.5px] text-ink-2">
            You&rsquo;re <span className="font-semibold tabular-nums text-ink">{pct}%</span> of the way there.
          </span>
        </div>

        <div className="space-y-3">
          <RequirementProgress
            label="Self capital"
            actual={tier.selfActual}
            required={tier.selfRequirement}
            tone="gold"
          />
          {tier.needsTeam && (
            <RequirementProgress
              label="Team business"
              actual={tier.teamActual}
              required={tier.teamRequirement}
              tone="violet"
            />
          )}
        </div>

        <p className="text-[11.5px] leading-relaxed text-ink-3">
          {selfLeft === 0 && teamLeft === 0
            ? 'Both requirements are met — qualification is evaluated on the next run.'
            : [
                selfLeft > 0 ? `${usd(selfLeft, 0)} more self capital` : null,
                teamLeft > 0 ? `${usd(teamLeft, 0)} more team business` : null,
              ].filter(Boolean).join(' and ') + ' opens this destination.'}
        </p>

        <button
          type="button"
          onClick={() => onView(tier)}
          className="inline-flex w-fit items-center gap-1.5 rounded-[5px] bg-gold px-4 py-2.5 text-[12.5px] font-semibold text-gold-on shadow-[0_8px_22px_-10px_rgba(255,122,26,0.7)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/30"
        >
          View requirements
          <ArrowRight size={14} strokeWidth={2.5} aria-hidden />
        </button>
      </div>
    </div>
  );
}

function AllReached() {
  return (
    <div className="flex items-start gap-3.5 border-t border-line-soft bg-canvas-2 px-5 py-5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[5px] bg-gradient-to-br from-gold to-gold-hi text-gold-on">
        <PartyPopper size={18} strokeWidth={2.2} aria-hidden />
      </span>
      <div className="min-w-0">
        <h3 className="text-[14.5px] font-semibold tracking-[-0.01em] text-ink">Every destination qualified</h3>
        <p className="mt-1 max-w-[60ch] text-[12.5px] leading-relaxed text-ink-2">
          You have reached every offer currently open. Fulfilment is handled by the
          our team — your awards are listed below.
        </p>
      </div>
    </div>
  );
}
