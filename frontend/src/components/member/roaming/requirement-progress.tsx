'use client';

import { clsx } from 'clsx';
import { Check } from 'lucide-react';
import { usd } from '@/lib/format';

/**
 * One qualification requirement drawn as a labelled meter.
 *
 * `surface` sits on a themed card; `dark` sits on the fixed navy artwork
 * panels (hero, next-reward), which do not follow the light/dark tokens.
 */
export function RequirementProgress({
  label, actual, required, tone, variant = 'surface', showActual = true,
}: {
  label: string;
  actual: string | number;
  required: string | number;
  tone: 'gold' | 'violet';
  variant?: 'surface' | 'dark';
  showActual?: boolean;
}) {
  const need = Number(required ?? 0);
  const have = Number(actual ?? 0);
  const pct = need > 0 ? Math.min(100, (have / need) * 100) : 100;
  const met = have >= need;
  const dark = variant === 'dark';

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className={clsx('text-[11.5px] font-medium', dark ? 'text-white/60' : 'text-ink-2')}>
          {label}
        </span>
        <span className={clsx(
          'flex items-center gap-1 text-[11.5px] tabular-nums',
          met ? 'text-good' : dark ? 'text-white/75' : 'text-ink-2',
        )}>
          {met && <Check size={12} strokeWidth={2.6} aria-hidden />}
          {showActual && <>{usd(have, 0)} <span className={dark ? 'text-white/35' : 'text-ink-3'}>/</span> </>}
          <span className={clsx('font-medium', !showActual && (dark ? 'text-white' : 'text-ink'))}>
            {usd(need, 0)}
          </span>
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${usd(have, 0)} of ${usd(need, 0)}`}
        className={clsx(
          'mt-1.5 h-1.5 overflow-hidden rounded-full',
          dark ? 'bg-white/12' : 'bg-line-soft',
        )}
      >
        <div
          className={clsx(
            'h-full rounded-full transition-[width] duration-700 ease-out',
            met
              ? 'bg-gradient-to-r from-good to-good'
              : tone === 'gold'
                ? 'bg-gradient-to-r from-gold-dark via-gold to-gold-hi'
                : 'bg-gradient-to-r from-violet to-violet-hi',
          )}
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
    </div>
  );
}
