'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { get } from '@/lib/api';
import { Card, CardHead, Table, Badge, toneFor, Select, Button } from '@/components/ui/primitives';
import { StatCard } from '@/components/dashboard/stat-card';
import { ArrowDownLeft, ArrowUpRight, Wallet } from 'lucide-react';
import { usd, shortDate, titleCase, num } from '@/lib/format';

interface Entry {
  id: string; wallet: string; direction: string; category: string;
  amount: string; balanceAfter: string; reference: string; description: string | null; createdAt: string;
}
interface Res { total: number; entries: Entry[] }

const CATEGORIES = ['DEPOSIT','INVESTMENT','DAILY_ROI','DIRECT_BONUS','GENERATION_BONUS','RANK_BONUS','WITHDRAWAL','REFUND','ADJUSTMENT','TRANSFER_IN','TRANSFER_OUT'];

export default function PassbookPage() {
  const [category, setCategory] = useState('');
  const [wallet, setWallet] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['member', 'ledger', category, wallet],
    queryFn: () => get<Res>('/wallet/ledger', { take: 200, category: category || undefined, wallet: wallet || undefined }),
  });

  const totals = useMemo(() => {
    const rows = data?.entries ?? [];
    const credit = rows.filter((r) => r.direction === 'CREDIT').reduce((a, r) => a + Number(r.amount), 0);
    const debit = rows.filter((r) => r.direction === 'DEBIT').reduce((a, r) => a + Number(r.amount), 0);
    return { credit, debit, net: credit - debit };
  }, [data]);

  /** Client-side export — the ledger is already loaded, no round trip needed. */
  const exportCsv = () => {
    const rows = data?.entries ?? [];
    const head = ['Date', 'Wallet', 'Category', 'Direction', 'Amount', 'Balance after', 'Reference', 'Description'];
    const body = rows.map((r) => [
      new Date(r.createdAt).toISOString(), r.wallet, r.category, r.direction,
      r.amount, r.balanceAfter, r.reference, (r.description ?? '').replace(/"/g, '""'),
    ]);
    const csv = [head, ...body].map((cols) => cols.map((c) => `"${c}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `fortunex-passbook-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Total Credited" value={usd(totals.credit)} change={null} icon={ArrowDownLeft}
                  chip="bg-good-soft text-good" loading={isLoading} />
        <StatCard label="Total Debited" value={usd(totals.debit)} change={null} icon={ArrowUpRight}
                  chip="bg-bad-soft text-bad" loading={isLoading} />
        <StatCard label="Net Movement" value={usd(totals.net)} change={null} icon={Wallet}
                  chip="bg-violet-soft text-violet" loading={isLoading} />
      </div>

      <Card className="mt-3.5">
        <CardHead
          title={`${num(data?.total ?? 0)} entries`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Select label="Filter by wallet" value={wallet} onChange={setWallet} className="h-9 text-[12.5px]"
                      options={[{ value: '', label: 'All wallets' }, ...['MAIN','FUND','DIGITAL'].map((w) => ({ value: w, label: titleCase(w) }))]} />
              <Select label="Filter by transaction type" value={category} onChange={setCategory} className="h-9 text-[12.5px]"
                      options={[{ value: '', label: 'All types' }, ...CATEGORIES.map((c) => ({ value: c, label: titleCase(c) }))]} />
              <Button size="sm" variant="outline" onClick={exportCsv} disabled={!data?.entries.length}>
                <Download size={14} /> CSV
              </Button>
            </div>
          }
        />
        <Table
          head={['Date', 'Type', 'Wallet', 'Amount', 'Balance after', 'Details']}
          empty="No transactions yet. Your first deposit or payout will appear here."
          rows={(data?.entries ?? []).map((e) => [
            <span key="a" className="text-ink-2">{shortDate(e.createdAt)}</span>,
            <span key="b" className="font-medium">{titleCase(e.category)}</span>,
            <Badge key="c" tone="neutral">{e.wallet}</Badge>,
            <span key="d" className={`font-semibold tabular-nums ${e.direction === 'CREDIT' ? 'text-good' : 'text-bad'}`}>
              {e.direction === 'CREDIT' ? '+' : '−'}{usd(e.amount)}
            </span>,
            <span key="e" className="tabular-nums text-ink-2">{usd(e.balanceAfter)}</span>,
            <span key="f" className="text-ink-2">{e.description ?? '—'}</span>,
          ])}
        />
      </Card>
    </>
  );
}
