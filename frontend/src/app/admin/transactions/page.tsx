'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { adminGet } from '@/lib/admin-api';
import { Card, CardHead, PageHeader, Table, Badge, toneFor, Select, controlCls } from '@/components/ui/primitives';
import { ExportButton } from '@/components/admin/export-button';
import { Pagination } from '@/components/ui/pagination';
import { usd, shortDate, titleCase, num } from '@/lib/format';

interface Row { id: string; userCode: string; wallet: string; direction: string; category: string; amount: string; balanceAfter: string; reference: string; status: string; createdAt: string }
const CATS = ['DEPOSIT','INVESTMENT','DAILY_ROI','DIRECT_BONUS','GENERATION_BONUS','RANK_BONUS','WITHDRAWAL','REFUND','ADJUSTMENT','TRANSFER_IN','TRANSFER_OUT'];

export default function TransactionsPage() {
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(50);
  const { data } = useQuery({
    queryKey: ['admin', 'transactions', category, q, page, size],
    queryFn: () => adminGet<{ total: number; rows: Row[] }>('/admin/transactions', {
      take: size, skip: page * size, category: category || undefined, q: q || undefined,
    }),
  });

  return (
    <>
      <PageHeader title="Transactions" subtitle="The append-only ledger — every movement of value, with the balance it produced." />
      <Card>
        <CardHead title={`${num(data?.total ?? 0)} entries`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Select label="Filter by transaction type" value={category} onChange={(v) => { setCategory(v); setPage(0); }} className="h-9 text-[12.5px]"
                      options={[{ value: '', label: 'All categories' }, ...CATS.map((c) => ({ value: c, label: titleCase(c) }))]} />
              <label className="relative flex items-center">
                <Search size={15} className="pointer-events-none absolute left-3 text-ink-3" />
                <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="User ID"
                       className={`${controlCls} h-9 w-44 pl-9 text-[12.5px]`} />
              </label>
              <ExportButton resource="transactions" filters={{ category: category || undefined, q: q || undefined }} />
            </div>
          } />
        <Table
          head={['Date', 'User', 'Category', 'Wallet', 'Amount', 'Balance after', 'Reference', 'Status']}
          empty="No ledger entries match."
          rows={(data?.rows ?? []).map((t) => [
            <span key="a" className="text-ink-2">{shortDate(t.createdAt)}</span>,
            <span key="b" className="font-medium">{t.userCode}</span>,
            titleCase(t.category),
            <span key="d" className="text-ink-2">{titleCase(t.wallet)}</span>,
            <span key="e" className={`font-medium tabular-nums ${t.direction === 'CREDIT' ? 'text-good' : 'text-bad'}`}>
              {t.direction === 'CREDIT' ? '+' : '−'}{usd(t.amount)}
            </span>,
            <span key="f" className="tabular-nums text-ink-2">{usd(t.balanceAfter)}</span>,
            <span key="g" className="text-[11.5px] text-ink-3">{t.reference.slice(0, 20)}…</span>,
            <Badge key="h" tone={toneFor(t.status)}>{t.status}</Badge>,
          ])}
        />
        <Pagination total={data?.total ?? 0} page={page} pageSize={size} onPage={setPage} onPageSize={setSize} />
      </Card>
    </>
  );
}
