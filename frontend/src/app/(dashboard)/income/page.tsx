'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { get } from '@/lib/api';
import { Card, CardHead, Table, Select, Button, Label } from '@/components/ui/primitives';
import { usd, shortDate, titleCase, num } from '@/lib/format';

interface Summary { totalIncome: string; today: string; yesterday: string; breakdown: { category: string; total: string; count: number }[] }
interface Statement { total: number; rows: { id: string; category: string; amount: string; description: string | null; meta: Record<string, string> | null; reference: string; createdAt: string }[] }

/* The four streams that pay into Main. Colours match the dashboard's cap
   bar and accrual chart, so a member learns one mapping from stream to
   colour across the whole product rather than one per page. */
const STREAMS = [
  { key: 'DAILY_ROI',        label: 'Daily trade',    color: 'var(--color-chart-1)' },
  { key: 'DIRECT_BONUS',     label: 'Direct sponsor', color: 'var(--color-chart-2)' },
  { key: 'GENERATION_BONUS', label: 'Generation',     color: 'var(--color-chart-3)' },
  { key: 'RANK_BONUS',       label: 'Rank rewards',   color: 'var(--color-chart-4)' },
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
    a.href = url; a.download = `income-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
{/* The lifetime figure leads, with the two days that show whether it is
          still moving. This page used to open with SEVEN tiles of equal
          weight — four streams, then total, today and yesterday — which made
          the total no more prominent than a stream that had paid nothing. */}
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <Label>Total earned · all streams</Label>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="text-[30px] font-semibold leading-none tracking-[-0.03em] text-ink tabular-nums">
              {s.isLoading ? '—' : usd(s.data?.totalIncome)}
            </span>
            <span className="text-[11.5px] text-ink-3">paid into your main wallet</span>
          </div>
        </div>
        <div className="flex shrink-0 gap-6">
          <div>
            <Label>Today</Label>
            <p className="mt-1.5 text-[19px] font-semibold leading-none tracking-[-0.02em] text-good tabular-nums">
              {s.isLoading ? '—' : usd(s.data?.today)}
            </p>
          </div>
          <div>
            <Label>Yesterday</Label>
            <p className="mt-1.5 text-[19px] font-semibold leading-none tracking-[-0.02em] text-ink-2 tabular-nums">
              {s.isLoading ? '—' : usd(s.data?.yesterday)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
        {STREAMS.map(({ key, label, color }) => {
          const total = Number(s.data?.breakdown.find((b) => b.category === key)?.total ?? 0);
          const lifetime = Number(s.data?.totalIncome ?? 0);
          return (
            <div key={key} className="flex min-w-0 items-stretch gap-3 rounded-[5px] border border-line bg-card px-3.5 py-2.5">
              <span aria-hidden className="w-[3px] shrink-0 rounded-[1px]" style={{ background: color }} />
              <div className="min-w-0 flex-1">
                <Label>{label}</Label>
                <p className="mt-1.5 truncate text-[19px] font-semibold leading-none tracking-[-0.02em] text-ink tabular-nums">
                  {s.isLoading ? '—' : usd(total)}
                </p>
                {/* Share of lifetime income — which stream is actually
                    carrying this member, rather than four bare totals. */}
                <p className="mt-1.5 truncate text-[10.5px] text-ink-3 tabular-nums">
                  {lifetime > 0 ? `${Math.round((total / lifetime) * 100)}% of everything earned` : 'nothing yet'}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <Card className="mt-3.5">
        <CardHead
          title={`Income statement — ${num(rows.length)}`}
          action={
            <div className="flex items-center gap-2">
              <Select label="Filter by income stream" value={type} onChange={setType} className="h-9 text-[12.5px]"
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
