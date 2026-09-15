'use client';

import Image from 'next/image';
import { clsx } from 'clsx';
import { ArrowRight, Check, Lock, MapPin } from 'lucide-react';
import { shortDate } from '@/lib/format';
import { artFor } from './destinations';
import { RequirementProgress } from './requirement-progress';
import { trackMeta, windowLabel, type TierView } from './types';

/**
 * A destination tier.
 *
 * Locked cards keep their artwork and their gold accents — they are the thing
 * to want, not the thing to ignore. State is never carried by colour alone:
 * the lock has an icon and a word, and the hairline across the foot of the
 * artwork repeats the same percentage the body spells out.
 */
export function DestinationCard({ tier, onView }: { tier: TierView; onView: (t: TierView) => void }) {
  const art = artFor(tier.destination);
  const meta = trackMeta(tier.track);
  const qualified = tier.achieved;
  const pct = Math.floor(tier.overallPct);

  return (
    <article className={clsx(
      'group relative flex h-full flex-col overflow-hidden rounded-[16px] border bg-card transition-all duration-200',
      'hover:-translate-y-[3px]',
      qualified
        ? 'border-gold/60 shadow-[0_0_0_1px_rgba(212,175,55,0.10),0_10px_30px_-18px_rgba(212,175,55,0.55)] hover:shadow-[0_0_0_1px_rgba(212,175,55,0.18),0_16px_38px_-18px_rgba(212,175,55,0.6)]'
        : 'border-line shadow-card hover:border-gold/45 hover:shadow-raise',
    )}>
      {/* ── artwork ──────────────────────────────────────────────────── */}
      <div className="relative aspect-[16/9] shrink-0 overflow-hidden bg-navy">
        {art ? (
          <Image
            src={art.image}
            alt={art.alt}
            fill
            loading="lazy"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className={clsx(
              'object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]',
              !qualified && 'saturate-[0.82]',
            )}
          />
        ) : (
          <div aria-hidden className="absolute inset-0 bg-[linear-gradient(140deg,#12121A,#08080E)]" />
        )}

        <div aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.05),rgba(0,0,0,0.92))]" />
        {!qualified && <div aria-hidden className="absolute inset-0 bg-navy/14" />}

        <span className={clsx(
          'absolute right-3 top-3 inline-flex items-center gap-1 rounded-full px-2.5 py-[3px] text-[10.5px] font-semibold uppercase tracking-[0.06em] backdrop-blur-sm',
          qualified
            ? 'bg-[rgba(18,183,106,0.18)] text-[#32D583] ring-1 ring-[rgba(18,183,106,0.4)]'
            : 'bg-white/10 text-[#C6CEDA] ring-1 ring-white/15',
        )}>
          {qualified ? <Check size={11} strokeWidth={3} aria-hidden /> : <Lock size={10} strokeWidth={2.6} aria-hidden />}
          {qualified ? 'Qualified' : 'Locked'}
        </span>

        <div className="absolute inset-x-4 bottom-3.5">
          <h3 className="truncate text-[20px] font-semibold leading-tight tracking-[-0.02em] text-white">
            {tier.destination}
          </h3>
          {art && (
            <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-white/55">
              <MapPin size={11} aria-hidden className="shrink-0" /> {art.place}
            </p>
          )}
        </div>

        {/* the same percentage the body states, drawn across the foot */}
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-white/12">
          <span
            className={clsx(
              'block h-full transition-[width] duration-700 ease-out',
              qualified ? 'bg-good' : 'bg-gradient-to-r from-gold-dark via-gold to-gold-hi',
            )}
            style={{ width: `${qualified ? 100 : Math.max(3, pct)}%` }}
          />
        </span>
      </div>

      {/* ── requirements ─────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col p-4">
        <div className="mb-3.5 flex flex-wrap items-center gap-1.5">
          <span className="w-fit rounded-full bg-mute-soft px-2 py-[3px] text-[10px] font-medium uppercase tracking-[0.06em] text-mute-on">
            {meta.short} route
          </span>
          {/* A closing date decides whether this is worth chasing at all, so it
              sits with the offer rather than in a footnote. */}
          {windowLabel(tier) && (
            <span className={clsx(
              'w-fit rounded-full px-2 py-[3px] text-[10px] font-medium uppercase tracking-[0.06em]',
              tier.expired ? 'bg-bad-soft text-bad' : 'bg-warn-soft text-warn',
            )}>
              {windowLabel(tier)}
            </span>
          )}
        </div>

        {/* What is actually won. The headline names the offer; this says what
            arrives — and two of the three are cash, not a trip. */}
        {tier.rewardLabel && (
          <p className="mb-3 text-[12.5px] font-medium leading-snug text-ink">
            {tier.rewardLabel}
          </p>
        )}

        <div className="space-y-3">
          {tier.needsSelf && (
            <RequirementProgress
              label="Self capital"
              actual={tier.selfActual}
              required={tier.selfRequirement}
              tone="gold"
              showActual={false}
            />
          )}
          {tier.needsTeam && (
            <RequirementProgress
              label="Team business"
              actual={tier.teamActual}
              required={tier.teamRequirement}
              tone="violet"
              showActual={false}
            />
          )}
        </div>

        <p className="mt-3.5 border-t border-line-soft pt-3 text-[11px] tabular-nums text-ink-3">
          {qualified
            ? tier.achievedAt
              ? `Qualified ${shortDate(tier.achievedAt)}${tier.status ? ` · ${tier.status.toLowerCase()}` : ''}`
              : 'Qualified'
            : `${pct}% of the way there`}
        </p>

        <div className="mt-auto pt-4">
          <button
            type="button"
            onClick={() => onView(tier)}
            className={clsx(
              'flex w-full items-center justify-center gap-1.5 rounded-[10px] border px-3 py-2.5 text-[12.5px] font-medium transition',
              'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/25',
              qualified
                ? 'border-gold/45 bg-gold-soft text-gold-on-soft hover:border-gold/70'
                : 'border-line bg-canvas-2 text-ink-2 hover:border-gold/45 hover:text-ink',
              'group-hover:border-gold/60',
            )}
          >
            {qualified ? 'View reward' : 'View requirements'}
            <ArrowRight size={14} strokeWidth={2.4} aria-hidden className="transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>
    </article>
  );
}
