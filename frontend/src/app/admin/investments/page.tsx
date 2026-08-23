'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Layers, TrendingUp, Wallet } from 'lucide-react';
import { adminGet } from '@/lib/admin-api';
import { Card, CardHead, PageHeader, Table, Badge, toneFor, Select } from '@/components/ui/primitives';
import { ExportButton } from '@/components/admin/export-button';
import { Pagination } from '@/components/ui/pagination';
import { StatCard } from '@/components/dashboard/stat-card';
import { usd, shortDate, num } from '@/lib/format';

interface Row { id: string; userCode: string; plan: string; amount: string; capLimit: string; totalEarned: string; status: string; dailyRoiPercent: string; startedAt: string }
interface Res { total: number; volume: string; paidOut: string; liability: string; rows: Row[] }

export default function InvestmentsPage() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(50);
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'investments', status, page, size],
    queryFn: () => adminGet<Res>('/admin/investments', { take: size, skip: page * size, status: status || undefined }),
  });

  return (
    <>
      <PageHeader title="Investments" subtitle="Every package on the platform and how far it has run toward its cap." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Capital Invested" value={usd(data?.volume)} change={null} icon={TrendingUp} chip="bg-violet-soft text-violet" loading={isLoading} />
        <StatCard label="Paid Out To Date" value={usd(data?.paidOut)} change={null} icon={Wallet} chip="bg-good-soft text-good" loading={isLoading} />
        <StatCard label="Outstanding Liability" value={usd(data?.liability)} change={null} icon={Layers} chip="bg-warn-soft text-warn" loading={isLoading} />
      </div>

      <Card className="mt-3.5">
        <CardHead title={`${num(data?.total ?? 0)} packages`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Select label="Filter by investment status" value={status} onChange={(v) => { setStatus(v); setPage(0); }} className="h-9 text-[12.5px]"
                            options={[{ value: '', label: 'All' }, ...['ACTIVE','CAPPED','COMPLETED','CANCELLED'].map((s) => ({ value: s, label: s }))]} />
              <ExportButton resource="investments" filters={{ status: status || undefined }} />
            </div>
          } />
        <Table
          head={['Started', 'User', 'Plan', 'Amount', 'Daily', 'Cap limit', 'Earned', 'Progress', 'Status']}
          empty="No investments yet."
          rows={(data?.rows ?? []).map((i) => {
            const pct = Number(i.capLimit) > 0 ? Math.min(100, (Number(i.totalEarned) / Number(i.capLimit)) * 100) : 0;
            return [
              <span key="a" className="text-ink-2">{shortDate(i.startedAt)}</span>,
              <span key="b" className="font-medium">{i.userCode}</span>,
              i.plan,
              <span key="d" className="font-medium tabular-nums">{usd(i.amount)}</span>,
              <span key="e" className="tabular-nums text-ink-2">{i.dailyRoiPercent}%</span>,
              <span key="f" className="tabular-nums text-ink-2">{usd(i.capLimit)}</span>,
              <span key="g" className="tabular-nums text-good">{usd(i.totalEarned)}</span>,
              <span key="h" className="flex items-center gap-2">
                <span className="h-1.5 w-16 overflow-hidden rounded-full bg-line-soft">
                  <span className="block h-full rounded-full bg-violet" style={{ width: `${Math.max(2, pct)}%` }} />
                </span>
                <span className="text-[11.5px] tabular-nums text-ink-2">{pct.toFixed(0)}%</span>
              </span>,
              <Badge key="i" tone={toneFor(i.status)}>{i.status}</Badge>,
            ];
          })}
        />

        <Pagination total={data?.total ?? 0} page={page} pageSize={size} onPage={setPage} onPageSize={setSize} />
      </Card>
    </>
  );
}
