'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Percent, TrendingUp, Trophy, Users } from 'lucide-react';
import { get } from '@/lib/api';
import { Card, CardHead, Table, Select, Button } from '@/components/ui/primitives';
import { StatCard } from '@/components/dashboard/stat-card';
import { usd, shortDate, titleCase, num } from '@/lib/format';

interface Summary { totalIncome: string; today: string; yesterday: string; breakdown: { category: string; total: string; count: number }[] }
interface Statement { total: number; rows: { id: string; category: string; amount: string; description: string | null; meta: Record<string, string> | null; reference: string; createdAt: string }[] }

const STREAMS = [
  { key: 'DAILY_ROI',        label: 'Daily Trade Bonus', Icon: TrendingUp, chip: 'bg-good-soft text-good' },
  { key: 'DIRECT_BONUS',     label: 'Direct Sponsor',    Icon: Users,      chip: 'bg-violet-soft text-violet' },
  { key: 'GENERATION_BONUS', label: 'Generation',        Icon: Percent,    chip: 'bg-[#E8F1FE] text-info dark:bg-[#12233D]' },
  { key: 'RANK_BONUS',       label: 'Rank Rewards',      Icon: Trophy,     chip: 'bg-warn-soft text-warn' },
];

export default function IncomePage() {
  const [type, setType] = useState('');
  const s = useQuery({ queryKey: ['member', 'income'], queryFn: () => get<Summary>('/income') });
  const st = useQuery({ queryKey: ['member', 'statement'], queryFn: () => get<Statement>('/income/statement', { take: 200 }) });

  const rows = (st.data?.rows ?? []).filter((r) => !type || r.category === type);

  const exportCsv = () => {
    const head = ['Date', 'Stream', 'Amount', 'Basis', 'Reference'];
    const body = rows.map((r) => [
      new Date(r.createdAt).toISOString(), r.category, r.amount,
      r.meta?.base ? `base ${r.meta.base} @ ${r.meta.percent ?? r.meta.rate}%` : '', r.reference,
    ]);
    const csv = [head, ...body].map((c) => c.map((x) => `"${x}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `fortunex-income-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {STREAMS.map(({ key, label, Icon, chip }) => {
          const row = s.data?.breakdown.find((b) => b.category === key);
          return (
            <StatCard key={key} label={label} value={usd(row?.total ?? 0)} change={null}
                      icon={Icon} chip={chip} loading={s.isLoading} />
          );
        })}
      </div>

      <div className="mt-3.5 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        {[
          { k: 'Total earned', v: usd(s.data?.totalIncome), tone: 'text-ink' },
          { k: 'Today', v: usd(s.data?.today), tone: 'text-good' },
          { k: 'Yesterday', v: usd(s.data?.yesterday), tone: 'text-ink-2' },
        ].map((x) => (
          <Card key={x.k} className="px-5 py-4">
            <p className="text-[10.5px] font-medium uppercase tracking-[0.05em] text-ink-2">{x.k}</p>
            <p className={`mt-1.5 text-[22px] font-semibold tabular-nums tracking-[-0.02em] ${x.tone}`}>{x.v}</p>
          </Card>
        ))}
      </div>

      <Card className="mt-3.5">
        <CardHead
          title={`Income statement — ${num(rows.length)}`}
          action={
            <div className="flex items-center gap-2">
              <Select value={type} onChange={setType} className="h-9 text-[12.5px]"
                      options={[{ value: '', label: 'All streams' }, ...STREAMS.map((x) => ({ value: x.key, label: x.label }))]} />
              <Button size="sm" variant="outline" onClick={exportCsv} disabled={!rows.length}>
                <Download size={14} /> CSV
              </Button>
            </div>
          }
        />
        <Table
          head={['Date', 'Stream', 'Amount', 'How it was calculated']}
          empty="No income yet. Activate a package to start earning."
          rows={rows.map((r) => [
            <span key="a" className="text-ink-2">{shortDate(r.createdAt)}</span>,
            <span key="b" className="font-medium">{titleCase(r.category)}</span>,
            <span key="c" className="font-semibold tabular-nums text-good">+{usd(r.amount)}</span>,
            <span key="d" className="text-ink-2">
              {r.meta?.base
                ? `${usd(r.meta.base)} × ${r.meta.percent ?? r.meta.rate}%${r.meta.level ? ` · level ${r.meta.level}` : ''}`
                : (r.description ?? '—')}
            </span>,
          ])}
        />
      </Card>
    </>
  );
}
