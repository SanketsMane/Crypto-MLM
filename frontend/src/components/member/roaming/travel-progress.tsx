'use client';

import { clsx } from 'clsx';
import { Check, Lock, Plane } from 'lucide-react';
import { usd } from '@/lib/format';
import type { JourneyStop, TierView } from './types';

/**
 * The journey rail — every destination in tier order, with the one the member
 * is working toward highlighted. State is never carried by colour alone: each
 * stop also carries an icon and a visually-hidden label.
 */
export function TravelProgress({ stops, next }: { stops: JourneyStop[]; next: TierView | null }) {
  const done = stops.filter((s) => s.state === 'done').length;

  return (
    <section className="overflow-hidden rounded-[16px] border border-line bg-card shadow-card">
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pb-4 pt-5">
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold leading-tight tracking-[-0.01em] text-ink">
            Your Travel Progress
          </h2>
          <p className="mt-1 text-[12.5px] text-ink-2">You&rsquo;re closer than you think.</p>
        </div>
        <span className="rounded-full bg-gold-soft px-3 py-1 text-[11px] font-medium tabular-nums text-gold-on-soft">
          {done} of {stops.length} qualified
        </span>
      </header>

      {next && (
        <div className="px-5 pb-4">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11.5px] text-ink-2">
              Overall progress toward <span className="font-medium text-ink">{next.destination}</span>
            </span>
            <span className="text-[11.5px] font-semibold tabular-nums text-ink">
              {Math.floor(next.overallPct)}%
            </span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={Math.floor(next.overallPct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Overall progress toward ${next.destination}`}
            className="mt-1.5 h-2 overflow-hidden rounded-full bg-line-soft"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet via-gold to-gold-hi transition-[width] duration-700 ease-out"
              style={{ width: `${Math.max(2, next.overallPct)}%` }}
            />
          </div>
        </div>
      )}

      {/* the rail keeps its shape on every screen; below ~600px it scrolls
          inside the card rather than squeezing the stops together */}
      <div className="overflow-x-auto px-5 pb-5">
        <div className="min-w-[600px]">
          <div className="mb-2.5 flex items-center justify-between text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink-3">
            <span>Start</span>
            <span>Full journey</span>
          </div>

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
                    : stop.state === 'current' ? 'In progress — your next reward'
                    : 'Locked'}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
