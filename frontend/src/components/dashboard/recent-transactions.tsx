'use client';

import Link from 'next/link';
import { Card, CardHead, Table, Badge, toneFor, Button, Skeleton } from '@/components/ui/primitives';
import { shortDate, titleCase, usd } from '@/lib/format';

export interface TxnRow {
  id: string; userCode: string; category: string; direction: string;
  amount: string; wallet: string; status: string; createdAt: string;
}

export function RecentTransactions({ rows, loading }: { rows: TxnRow[]; loading?: boolean }) {
  return (
    <Card className="flex h-full flex-col">
      <CardHead
        title="Recent Transactions"
        action={<Link href="/admin/transactions"><Button variant="ghost" size="sm">View All</Button></Link>}
      />
      {loading ? (
        <div className="space-y-2 px-5 pb-5">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
        </div>
      ) : (
        <Table
          head={['User', 'Type', 'Amount', 'Status', 'Date']}
          empty="No transactions recorded yet."
          rows={rows.map((t) => [
            <span key="u" className="font-medium text-ink">{t.userCode}</span>,
            titleCase(t.category),
            <span key="a" className={`font-semibold tabular-nums ${t.direction === 'CREDIT' ? 'text-good' : 'text-bad'}`}>
              {t.direction === 'CREDIT' ? '+' : '−'}{usd(t.amount)}
            </span>,
            <Badge key="s" tone={toneFor(t.status)}>{t.status}</Badge>,
            <span key="d" className="text-ink-2">{shortDate(t.createdAt)}</span>,
          ])}
        />
      )}
    </Card>
  );
}
