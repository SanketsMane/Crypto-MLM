'use client';

import { ArrowDownToLine, ArrowUpRight, Percent, TrendingUp, UserPlus } from 'lucide-react';
import { Card, CardHead, Button, Skeleton } from '@/components/ui/primitives';
import { ago, usd } from '@/lib/format';

export interface ActivityItem {
  type: string; title: string; subtitle: string; amount: string | null; at: string;
}

const ICON = {
  user:       { Icon: UserPlus,       cls: 'bg-violet-soft text-violet' },
  investment: { Icon: TrendingUp,     cls: 'bg-good-soft text-good' },
  payout:     { Icon: ArrowUpRight,   cls: 'bg-warn-soft text-warn' },
  withdrawal: { Icon: ArrowDownToLine,cls: 'bg-violet-soft text-violet' },
  commission: { Icon: Percent,        cls: 'bg-good-soft text-good' },
} as const;

export function PlatformActivity({ items, loading }: { items: ActivityItem[]; loading?: boolean }) {
  return (
    <Card className="flex h-full flex-col">
      <CardHead title="Platform Activity" action={<Button variant="ghost" size="sm">View All</Button>} />
      <ul className="flex-1 px-5 pb-4">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <li key={i} className="py-3"><Skeleton className="h-10" /></li>)
        ) : items.length === 0 ? (
          <li className="py-12 text-center text-[13.5px] text-ink-2">No activity yet.</li>
        ) : items.map((a, i) => {
          const { Icon, cls } = ICON[a.type as keyof typeof ICON] ?? ICON.user;
          return (
            <li key={i} className="flex items-start gap-3 border-b border-line-soft py-3 last:border-b-0">
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${cls}`}>
                <Icon size={16} strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium text-ink">{a.title}</p>
                <p className="truncate text-[12px] text-ink-2">{a.subtitle}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="whitespace-nowrap text-[11.5px] text-ink-3">{ago(a.at)}</p>
                {a.amount && <p className="mt-0.5 text-[13px] font-semibold tabular-nums text-good">{usd(a.amount)}</p>}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
