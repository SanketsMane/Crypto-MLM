'use client';

import { clsx } from 'clsx';
import { Check, User, Users } from 'lucide-react';
import { RequirementProgress } from './requirement-progress';
import { trackMeta, type TierView } from './types';

/**
 * The member's live standing on the route currently in view.
 *
 * This replaces the old two-panel overview that sat above the grid and
 * described both routes at once whether or not you were looking at them. The
 * explanation now travels with the tab it explains, next to the destinations
 * it gates.
 */
export function TrackMeter({ track, tiers }: { track: string; tiers: TierView[] }) {
  const meta = trackMeta(track);
  const next = tiers.find((t) => !t.achieved) ?? null;
  const unlocked = tiers.filter((t) => t.achieved).length;
  const gold = meta.tone === 'gold';
  const Icon = gold ? User : Users;

  return (
    <div className={clsx(
      'relative overflow-hidden rounded-[5px] border bg-canvas-2 p-4',
      gold ? 'border-gold/25' : 'border-violet/25',
    )}>
      <div
        aria-hidden
        className={clsx(
          'pointer-events-none absolute -right-12 -top-14 h-36 w-36 rounded-full blur-2xl',
          gold ? 'bg-gold/10' : 'bg-violet/12',
        )}
      />

      <div className="relative flex flex-wrap items-start gap-3">
        <span className={clsx(
          'grid h-9 w-9 shrink-0 place-items-center rounded-[5px] ring-1',
          gold ? 'bg-gold/12 text-gold ring-gold/30' : 'bg-violet/12 text-violet ring-violet/30',
        )}>
          <Icon size={17} strokeWidth={2.1} aria-hidden />
        </span>

        <div className="min-w-0 flex-1">
          <h3 className="text-[13.5px] font-semibold leading-tight text-ink">{meta.title}</h3>
          <p className="mt-0.5 text-[12px] leading-snug text-ink-2">{meta.description}</p>
        </div>

        <span className="shrink-0 rounded-full bg-mute-soft px-2 py-[3px] text-[10.5px] font-medium tabular-nums text-mute-on">
          {unlocked}/{tiers.length} unlocked
        </span>
      </div>

      <div className="relative mt-4">
        {next ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <RequirementProgress
                label="Self capital"
                actual={next.selfActual}
                required={next.selfRequirement}
                tone="gold"
              />
              {next.needsTeam && (
                <RequirementProgress
                  label="Team business"
                  actual={next.teamActual}
                  required={next.teamRequirement}
                  tone="violet"
                />
              )}
            </div>
            <p className="mt-2.5 text-[11px] leading-snug text-ink-3">
              Measured against <span className="font-medium text-ink-2">{next.destination}</span>, the
              next destination on this route. {meta.blurb}
            </p>
          </>
        ) : (
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-good">
            <Check size={14} strokeWidth={2.6} aria-hidden />
            Every destination on this route is qualified
          </p>
        )}
      </div>
    </div>
  );
}
