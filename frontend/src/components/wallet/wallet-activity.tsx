import Link from 'next/link';
import { ArrowRight, WalletMinimal } from 'lucide-react';
import { Card, CardHead, Table, Badge, Skeleton } from '@/components/ui/primitives';
import { usd, shortDate, titleCase } from '@/lib/format';

export interface LedgerEntry {
  id: string; wallet: string; direction: string; category: string;
  amount: string; balanceAfter: string; description: string | null; createdAt: string;
}

/** §15: a designed empty state rather than an empty dark rectangle. */
function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-[var(--dash-well)] text-ink-4 ring-1 ring-inset ring-[var(--dash-border)]">
        <WalletMinimal size={22} strokeWidth={1.8} />
      </span>
      <div>
        <p className="text-[14px] font-semibold text-ink">No wallet activity yet.</p>
        <p className="mt-1 text-[12.5px] text-ink-2">Your transactions will appear here.</p>
      </div>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="space-y-3 px-5 pb-5">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="ml-auto h-3.5 w-20" />
        </div>
      ))}
    </div>
  );
}

export function WalletActivity({ entries, loading }: {
  entries: LedgerEntry[];
  loading?: boolean;
}) {
  return (
    <Card className="dash-card flex h-full flex-col overflow-hidden">
      <CardHead
        title="Recent movement"
        subtitle="Your latest wallet transactions."
        action={
          <Link
            href="/passbook"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-[10px] border border-violet/30 bg-violet-soft/50 px-3 py-1.5 text-[12.5px] font-medium text-violet-on transition-colors hover:border-violet/55 hover:bg-violet-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet/20"
          >
            Full passbook <ArrowRight size={14} strokeWidth={2.2} />
          </Link>
        }
      />

      {loading ? (
        <LoadingRows />
      ) : entries.length === 0 ? (
        <EmptyState />
      ) : (
        <Table
          head={['Date', 'Type', 'Wallet', 'Amount', 'Balance after']}
          rows={entries.map((e) => [
            <span key="a" className="text-ink-2">{shortDate(e.createdAt)}</span>,
            titleCase(e.category),
            <Badge key="c" tone="neutral">{e.wallet}</Badge>,
            <span
              key="d"
              className={`font-semibold tabular-nums ${e.direction === 'CREDIT' ? 'text-good' : 'text-bad'}`}
            >
              {e.direction === 'CREDIT' ? '+' : '−'}{usd(e.amount)}
            </span>,
            <span key="e" className="tabular-nums text-ink-2">{usd(e.balanceAfter)}</span>,
          ])}
        />
      )}
    </Card>
  );
}
