'use client';

import { clsx } from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { Check } from 'lucide-react';
import { usd } from '@/lib/format';

/**
 * One of the two independent qualification routes, shown as a metered panel.
 * `current` / `target` are the member's real figures for that route; when every
 * destination on the route is already awarded there is no target left to draw.
 */
export function QualificationTrack({
  title, description, icon: Icon, tone, current, target, unlocked, total, footnote, nextDestination,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  tone: 'gold' | 'violet';
  current: number;
  target: number | null;
  unlocked: number;
  total: number;
  footnote?: string;
  nextDestination?: string;
}) {
  const pct = target && target > 0 ? Math.min(100, (current / target) * 100) : 100;
  const complete = target === null;

  return (
    <div className={clsx(
      'relative overflow-hidden rounded-[13px] border bg-canvas-2 p-4 transition-colors',
      tone === 'gold' ? 'border-gold/25 hover:border-gold/45' : 'border-violet/25 hover:border-violet/45',
    )}>
      <div
        aria-hidden
        className={clsx(
          'pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full blur-2xl',
          tone === 'gold' ? 'bg-gold/10' : 'bg-violet/12',
        )}
      />

      <div className="relative flex items-start gap-3">
        <span className={clsx(
          'grid h-9 w-9 shrink-0 place-items-center rounded-[10px] ring-1',
          tone === 'gold' ? 'bg-gold/12 text-gold ring-gold/30' : 'bg-violet/12 text-violet ring-violet/30',
        )}>
          <Icon size={17} strokeWidth={2.1} aria-hidden />
        </span>

        <div className="min-w-0 flex-1">
          <h4 className="text-[13.5px] font-semibold leading-tight text-ink">{title}</h4>
          <p className="mt-0.5 text-[12px] leading-snug text-ink-2">{description}</p>
        </div>

        <span className="shrink-0 rounded-full bg-mute-soft px-2 py-[3px] text-[10.5px] font-medium tabular-nums text-mute-on">
          {unlocked}/{total}
        </span>
      </div>

      <div className="relative mt-4">
        {complete ? (
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-good">
            <Check size={14} strokeWidth={2.6} aria-hidden />
            Every destination qualified
          </p>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[17px] font-semibold tabular-nums tracking-[-0.01em] text-ink">
                {usd(current, 0)}
                <span className="ml-1 text-[12.5px] font-normal text-ink-3">/ {usd(target ?? 0, 0)}</span>
              </span>
              {nextDestination && (
                <span className="truncate text-[11px] text-ink-3">next: {nextDestination}</span>
              )}
            </div>

            <div
              role="progressbar"
              aria-valuenow={Math.round(pct)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${title}: ${usd(current, 0)} of ${usd(target ?? 0, 0)}`}
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-line-soft"
            >
              <div
                className={clsx(
                  'h-full rounded-full transition-[width] duration-700 ease-out',
                  tone === 'gold'
                    ? 'bg-gradient-to-r from-gold-dark via-gold to-gold-hi'
                    : 'bg-gradient-to-r from-violet to-violet-hi',
                )}
                style={{ width: `${Math.max(2, pct)}%` }}
              />
            </div>
          </>
        )}

        {footnote && <p className="mt-2 text-[11px] leading-snug text-ink-3">{footnote}</p>}
      </div>
    </div>
  );
}
