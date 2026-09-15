'use client';

import Link from 'next/link';
import { clsx } from 'clsx';
import { AlertTriangle, ArrowRight, Clock, Inbox } from 'lucide-react';
import { Card, CardHead, Skeleton } from '@/components/ui/primitives';
import { num } from '@/lib/format';

export interface Queues {
  pendingDeposits: number;
  pendingWithdrawals: number;
  overdueWithdrawals: number;
  oldestPendingHours: number | null;
}

/**
 * Operational queue health.
 *
 * The API has served this since the console was built; nothing rendered it, so
 * a payout could sit past its SLA with no sign of it anywhere on the dashboard.
 * Overdue work is the one figure here that turns red.
 */
export function QueueHealth({ data, loading }: { data?: Queues; loading?: boolean }) {
  const overdue = data?.overdueWithdrawals ?? 0;
  const items = [
    { label: 'Deposits to confirm', value: data?.pendingDeposits ?? 0, href: '/admin/deposits', Icon: Inbox, alert: false },
    { label: 'Payouts to process', value: data?.pendingWithdrawals ?? 0, href: '/admin/payouts', Icon: Inbox, alert: false },
    { label: 'Past their SLA', value: overdue, href: '/admin/payouts', Icon: AlertTriangle, alert: overdue > 0 },
  ];

  return (
    <Card className="flex h-full flex-col">
      <CardHead
        title="Operations queue"
        action={
          data?.oldestPendingHours !== null && data?.oldestPendingHours !== undefined ? (
            <span className={clsx('inline-flex items-center gap-1.5 text-[11.5px] tabular-nums',
              data.oldestPendingHours >= 48 ? 'text-bad' : 'text-ink-2')}>
              <Clock size={12} />
              oldest {num(data.oldestPendingHours)}h
            </span>
          ) : undefined
        }
      />
      <div className="flex-1 px-5 pb-4">
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : (
          <ul className="space-y-2">
            {items.map(({ label, value, href, Icon, alert }) => (
              <li key={label}>
                <Link href={href}
                      className={clsx('group flex items-center gap-3 rounded-[5px] border px-3 py-2.5 transition',
                        alert ? 'border-bad/35 bg-bad-soft' : 'border-line bg-canvas/60 hover:border-line-strong')}>
                  <span className={clsx('grid h-8 w-8 shrink-0 place-items-center rounded-[4px]',
                    alert ? 'bg-bad/15 text-bad' : 'bg-violet-soft text-violet-on')}>
                    <Icon size={15} strokeWidth={2.1} />
                  </span>
                  <span className={clsx('flex-1 text-[12.5px]', alert ? 'font-medium text-bad-on' : 'text-ink-2')}>{label}</span>
                  <span className={clsx('text-[17px] font-semibold tabular-nums', alert ? 'text-bad' : 'text-ink')}>
                    {num(value)}
                  </span>
                  <ArrowRight size={14} className="shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
