import { clsx } from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/primitives';

export type MetricAccent = 'violet' | 'good' | 'info' | 'warn';

/* Icon tint per metric. The ring is what keeps the chip from reading as a
   solid badge at this size. */
const ACCENT: Record<MetricAccent, string> = {
  violet: 'bg-violet-soft text-violet-on ring-violet/15',
  good:   'bg-good-soft text-good-on ring-good/15',
  info:   'bg-info-soft text-info-on ring-info/15',
  warn:   'bg-warn-soft text-warn-on ring-warn/15',
};

/**
 * One headline number.
 *
 * There is deliberately no sparkline or delta: the API returns no per-metric
 * history, and a trend line drawn from a single point would be decoration
 * claiming to be data.
 */
export function MetricCard({ label, value, icon: Icon, accent, loading }: {
  label: string;
  value: string;
  icon: LucideIcon;
  accent: MetricAccent;
  loading?: boolean;
}) {
  return (
    <article className="dash-card dash-lift p-5">
      <span className={clsx('grid h-11 w-11 place-items-center rounded-[5px] ring-1 ring-inset', ACCENT[accent])}>
        <Icon size={19} strokeWidth={2} />
      </span>
      <p className="mt-4 text-[10.5px] font-medium uppercase leading-[1.3] tracking-[0.1em] text-ink-3">
        {label}
      </p>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-24" />
      ) : (
        <p className="mt-1.5 truncate text-[26px] font-semibold leading-none tracking-[-0.03em] text-ink tabular-nums">
          {value}
        </p>
      )}
    </article>
  );
}
