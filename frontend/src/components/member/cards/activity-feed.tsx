'use client';

import Link from 'next/link';
import { ArrowDownToLine, ArrowUpFromLine, Percent, Trophy, TrendingUp, Wallet } from 'lucide-react';
import { Card, CardHead, Skeleton } from '@/components/ui/primitives';
import { ago, usd, titleCase } from '@/lib/format';

export interface Entry {
  id: string; category: string; direction: string; amount: string;
  wallet: string; description: string | null; createdAt: string;
}

const ICON: Record<string, { Icon: typeof Wallet; cls: string }> = {
  DAILY_ROI:        { Icon: TrendingUp,     cls: 'bg-good-soft text-good' },
  DIRECT_BONUS:     { Icon: Percent,        cls: 'bg-gold-soft text-gold' },
  GENERATION_BONUS: { Icon: Percent,        cls: 'bg-gold-soft text-gold' },
  RANK_BONUS:       { Icon: Trophy,         cls: 'bg-warn-soft text-warn' },
  DEPOSIT:          { Icon: ArrowDownToLine,cls: 'bg-good-soft text-good' },
  WITHDRAWAL:       { Icon: ArrowUpFromLine,cls: 'bg-bad-soft text-bad' },
  INVESTMENT:       { Icon: Wallet,         cls: 'bg-gold-soft text-gold' },
};

export function ActivityFeed({ items, loading }: { items: Entry[]; loading?: boolean }) {
  return (
    <Card className="dash-card flex h-full flex-col">
      <CardHead title="Recent Activity"
        action={<Link href="/passbook" className="text-[12.5px] font-medium text-gold hover:underline">Passbook</Link>} />
      <ul className="flex-1 px-5 pb-4">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <li key={i} className="py-3"><Skeleton className="h-10" /></li>)
        ) : items.length === 0 ? (
          <li className="py-12 text-center text-[13px] text-ink-2">Nothing yet — your first payout will appear here.</li>
        ) : items.map((e) => {
          const { Icon, cls } = ICON[e.category] ?? { Icon: Wallet, cls: 'bg-canvas text-ink-2' };
          const credit = e.direction === 'CREDIT';
          return (
            <li key={e.id} className="flex items-center gap-3 border-b border-line-soft py-3 last:border-b-0">
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-[4px] ${cls}`}>
                <Icon size={16} strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium text-ink">{titleCase(e.category)}</p>
                <p className="truncate text-[11.5px] text-ink-2">{e.description ?? titleCase(e.wallet)}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className={`text-[13.5px] font-semibold tabular-nums ${credit ? 'text-good' : 'text-bad'}`}>
                  {credit ? '+' : '−'}{usd(e.amount)}
                </p>
                <p className="text-[11px] text-ink-3">{ago(e.createdAt)}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
