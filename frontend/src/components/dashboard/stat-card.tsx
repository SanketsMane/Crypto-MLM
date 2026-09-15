'use client';

import { clsx } from 'clsx';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/primitives';

export interface StatCardProps {
  label: string;
  value: string;
  change: number | null;
  icon: LucideIcon;
  chip: string;
  /** For queues, a fall is the good direction. */
  invert?: boolean;
  loading?: boolean;
}

export function StatCard({ label, value, change, icon: Icon, chip, invert, loading }: StatCardProps) {
  const up = (change ?? 0) >= 0;
  const positive = invert ? !up : up;

  return (
    <article className="flex min-h-[118px] flex-col justify-between rounded-[5px] border border-line bg-card p-4 shadow-card transition-shadow duration-200 hover:shadow-raise">
      <div className="flex flex-col gap-2 min-[520px]:flex-row min-[520px]:items-start min-[520px]:gap-3">
        <span className={clsx('grid h-10 w-10 shrink-0 place-items-center rounded-[5px]', chip)}>
          <Icon size={19} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          {/* label wraps rather than truncating — the reference never elides a metric name */}
          <p className="flex min-h-[27px] items-start text-[10.5px] font-medium uppercase leading-[1.3] tracking-[0.04em] text-ink-2">
            {label}
          </p>
          {loading ? (
            <Skeleton className="mt-2 h-6 w-20" />
          ) : (
            <p className="mt-1 truncate text-[20px] font-semibold leading-none tracking-[-0.025em] text-ink tabular-nums min-[520px]:text-[24px]">
              {value}
            </p>
          )}
        </div>
      </div>

      {/* only rendered when there is a comparison to make */}
      {change !== null && !loading && (
        <div className="mt-2.5 flex items-center gap-1.5 text-[11.5px]">
          <span className={clsx('inline-flex items-center gap-0.5 font-semibold', positive ? 'text-good' : 'text-bad')}>
            {up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
            {Math.abs(change).toFixed(1)}%
          </span>
          <span className="text-ink-2">from last week</span>
        </div>
      )}
    </article>
  );
}
