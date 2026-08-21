'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminGet } from '@/lib/admin-api';
import { Card, CardHead, PageHeader, Table, Badge, toneFor, Select } from '@/components/ui/primitives';
import { ExportButton } from '@/components/admin/export-button';
import { Pagination } from '@/components/ui/pagination';
import { StatCard } from '@/components/dashboard/stat-card';
import { Percent, TrendingUp, Users } from 'lucide-react';
import { usd, shortDate, num } from '@/lib/format';

interface Row { id: string; earner: string; from: string; kind: string; level: number; percent: string; baseAmount: string; amount: string; paidAmount: string; status: string; createdAt: string }
interface Res { total: number; totalPaid: string; totalIntended: string; rows: Row[] }

export default function CommissionsPage() {
  const [kind, setKind] = useState('');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(50);
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'commissions', kind, page, size],
    queryFn: () => adminGet<Res>('/admin/commissions', { take: size, skip: page * size, kind: kind || undefined }),
  });
  const lost = Number(data?.totalIntended ?? 0) - Number(data?.totalPaid ?? 0);

  return (
    <>
      <PageHeader title="Commissions" subtitle="Direct sponsor and generation bonuses, and what the earnings cap withheld." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Commissions Paid" value={usd(data?.totalPaid)} change={null} icon={Percent} chip="bg-good-soft text-good" loading={isLoading} />
        <StatCard label="Before Capping" value={usd(data?.totalIntended)} change={null} icon={TrendingUp} chip="bg-violet-soft text-violet" loading={isLoading} />
        <StatCard label="Withheld By Cap" value={usd(lost)} change={null} icon={Users} chip="bg-warn-soft text-warn" loading={isLoading} />
      </div>

      <Card className="mt-3.5">
        <CardHead title={`${num(data?.total ?? 0)} commission records`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Select value={kind} onChange={(v) => { setKind(v); setPage(0); }} className="h-9 text-[12.5px]"
                            options={[{ value: '', label: 'All streams' }, { value: 'DIRECT', label: 'Direct sponsor' }, { value: 'GENERATION', label: 'Generation' }]} />
              <ExportButton resource="commissions" filters={{ kind: kind || undefined }} />
            </div>
          } />
        <Table
          head={['Date', 'Earner', 'From', 'Stream', 'Level', 'Rate', 'Base', 'Paid', 'Status']}
          empty="No commissions recorded yet."
          rows={(data?.rows ?? []).map((c) => [
            <span key="a" className="text-ink-2">{shortDate(c.createdAt)}</span>,
            <span key="b" className="font-medium">{c.earner}</span>,
            <span key="c" className="text-ink-2">{c.from}</span>,
            <Badge key="d" tone={c.kind === 'DIRECT' ? 'info' : 'neutral'}>{c.kind}</Badge>,
            <span key="e" className="tabular-nums">L{c.level}</span>,
            <span key="f" className="tabular-nums">{c.percent}%</span>,
            <span key="g" className="tabular-nums text-ink-2">{usd(c.baseAmount)}</span>,
            <span key="h" className="font-medium tabular-nums text-good">{usd(c.paidAmount)}</span>,
            <Badge key="i" tone={toneFor(c.status)}>{c.status}</Badge>,
          ])}
        />

        <Pagination total={data?.total ?? 0} page={page} pageSize={size} onPage={setPage} onPageSize={setSize} />
      </Card>
    </>
  );
}
