'use client';

import Image from 'next/image';
import { clsx } from 'clsx';
import { ArrowRight, Check, Lock, MapPin, Plane } from 'lucide-react';
import { shortDate } from '@/lib/format';
import { artFor } from './destinations';
import { RequirementProgress } from './requirement-progress';
import { trackMeta, type TierView } from './types';

/**
 * A destination tier. Locked cards keep their artwork and their gold accents —
 * they are the thing to want, not the thing to ignore. The lock is carried by
 * an icon and a word as well as by colour.
 */
export function DestinationCard({ tier, onView }: { tier: TierView; onView: (t: TierView) => void }) {
  const art = artFor(tier.destination);
  const meta = trackMeta(tier.track);
  const qualified = tier.achieved;

  return (
    <article className={clsx(
      'group relative flex h-full flex-col overflow-hidden rounded-[14px] border bg-card transition-all duration-200',
      'hover:-translate-y-[3px]',
      qualified
        ? 'border-gold/60 shadow-[0_0_0_1px_rgba(212,175,55,0.10),0_10px_30px_-18px_rgba(212,175,55,0.55)] hover:shadow-[0_0_0_1px_rgba(212,175,55,0.18),0_16px_38px_-18px_rgba(212,175,55,0.6)]'
        : 'border-line shadow-card hover:border-gold/45 hover:shadow-raise',
    )}>
      {/* ── artwork ──────────────────────────────────────────────────── */}
      <div className="relative aspect-[2/1] shrink-0 overflow-hidden bg-navy">
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
          <div aria-hidden className="absolute inset-0 bg-[linear-gradient(140deg,#0F223C,#071426)]" />
        )}

        <div aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,20,38,0.05),rgba(7,20,38,0.95))]" />
        {!qualified && <div aria-hidden className="absolute inset-0 bg-navy/14" />}

        <span className="absolute left-3 top-3 grid h-8 w-8 place-items-center rounded-[9px] border border-white/15 bg-navy/55 text-brand-gold-hi backdrop-blur-sm">
          <Plane size={14} strokeWidth={2.2} aria-hidden />
        </span>

        <span className={clsx(
          'absolute right-3 top-3 inline-flex items-center gap-1 rounded-full px-2.5 py-[3px] text-[10.5px] font-semibold uppercase tracking-[0.06em] backdrop-blur-sm',
          qualified
            ? 'bg-[rgba(18,183,106,0.18)] text-[#32D583] ring-1 ring-[rgba(18,183,106,0.4)]'
            : 'bg-white/10 text-[#C6CEDA] ring-1 ring-white/15',
        )}>
          {qualified ? <Check size={11} strokeWidth={3} aria-hidden /> : <Lock size={10} strokeWidth={2.6} aria-hidden />}
          {qualified ? 'Qualified' : 'Locked'}
        </span>

        <div className="absolute inset-x-3 bottom-2.5">
          <h3 className="truncate text-[20px] font-semibold leading-tight tracking-[-0.02em] text-white">
            {tier.destination}
          </h3>
          {art && (
            <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-white/55">
              <MapPin size={11} aria-hidden className="shrink-0" /> {art.place}
            </p>
          )}
        </div>
      </div>

      {/* ── requirements ─────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col p-4">
        <span className="mb-3 w-fit rounded-full bg-mute-soft px-2 py-[3px] text-[10px] font-medium uppercase tracking-[0.06em] text-mute-on">
          {meta.short} track
        </span>

        <div className="space-y-3">
          <RequirementProgress
            label="Self capital"
            actual={tier.selfActual}
            required={tier.selfRequirement}
            tone="gold"
            showActual={false}
          />
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

        <p className="mt-3 text-[11px] tabular-nums text-ink-3">
          {qualified
            ? tier.achievedAt
              ? `Qualified ${shortDate(tier.achievedAt)}${tier.status ? ` · ${tier.status.toLowerCase()}` : ''}`
              : 'Qualified'
            : `${Math.floor(tier.overallPct)}% of the way there`}
        </p>

        <div className="mt-auto pt-4">
        <button
          type="button"
          onClick={() => onView(tier)}
          className={clsx(
            'flex w-full items-center justify-center gap-1.5 rounded-[9px] border px-3 py-2.5 text-[12.5px] font-medium transition',
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
