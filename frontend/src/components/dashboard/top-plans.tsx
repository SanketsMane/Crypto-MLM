'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Card, CardHead, Select, Skeleton } from '@/components/ui/primitives';
import { usdWhole } from '@/lib/format';

export interface PlanRow { rank: number; name: string; total: string; count: number; percent: number }

export function TopPlans({ plans, range, onRange, loading }: {
  plans: PlanRow[]; range: string; onRange: (v: string) => void; loading?: boolean;
}) {
  return (
    <Card className="flex h-full flex-col">
      <CardHead
        title="Top Performing Plans"
        action={<Select value={range} onChange={onRange} className="h-9 min-w-0 shrink text-[12px]"
                        options={[{ value: 'month', label: 'This Month' }, { value: 'all', label: 'All Time' }]} />}
      />
      <div className="flex-1 space-y-4 px-5 pb-3">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9" />)
        ) : plans.length === 0 ? (
          <p className="py-12 text-center text-[13.5px] text-ink-2">No plans have been purchased yet.</p>
        ) : plans.map((p) => (
          <div key={p.rank}>
            <div className="flex items-center gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-violet-soft text-[11px] font-semibold tabular-nums text-violet">
                {p.rank}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">{p.name}</span>
              <span className="text-[13.5px] font-semibold tabular-nums text-ink">{usdWhole(p.total)}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line-soft" style={{ marginLeft: 36 }}>
              <div className="h-full rounded-full bg-violet transition-[width] duration-500"
                   style={{ width: `${Math.max(4, p.percent)}%` }} />
            </div>
          </div>
        ))}
      </div>
      <Link href="/admin/plans"
            className="mt-auto flex items-center justify-center gap-1.5 border-t border-line py-3 text-[13px] font-medium text-violet transition hover:bg-canvas">
        View All Plans <ArrowRight size={14} />
      </Link>
    </Card>
  );
}
