'use client';

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { LineChart } from 'lucide-react';
import { Card, CardHead, Select } from '@/components/ui/primitives';
import { usd, titleCase } from '@/lib/format';

const LABEL: Record<string, string> = {
  DAILY_ROI: 'Daily trade bonus',
  DIRECT_BONUS: 'Direct sponsor',
  GENERATION_BONUS: 'Generation',
  RANK_BONUS: 'Rank reward',
};

const axisDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export function IncomeBreakdown({ income, series, range, onRange, loading }: {
  income?: { total: string; today: string; yesterday: string; breakdown: { category: string; total: string; count: number }[] };
  series: { date: string; value: number }[];
  range: string; onRange: (v: string) => void; loading?: boolean;
}) {
  const empty = !loading && series.every((s) => s.value === 0);

  return (
    <Card className="dash-card h-full overflow-hidden">
      <CardHead
        title="Income"
        action={<Select label="Choose a time range" value={range} onChange={onRange} className="h-9 text-[12.5px]"
                        options={[{ value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }]} />}
      />
      <div className="px-5 pb-2">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
          <div>
            <p className="text-[10.5px] font-medium uppercase tracking-[0.05em] text-ink-2">Total earned</p>
            <p className="mt-1 text-[26px] font-semibold leading-none tabular-nums tracking-[-0.025em] text-ink">{usd(income?.total)}</p>
          </div>
          <div className="flex gap-5">
            <div>
              <p className="text-[10.5px] uppercase tracking-[0.05em] text-ink-2">Today</p>
              <p className="mt-1 text-[15px] font-semibold tabular-nums text-good">+{usd(income?.today)}</p>
            </div>
            <div>
              <p className="text-[10.5px] uppercase tracking-[0.05em] text-ink-2">Yesterday</p>
              <p className="mt-1 text-[15px] font-semibold tabular-nums text-ink-2">{usd(income?.yesterday)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="relative h-[168px] px-2">
        {empty ? (
          /* No chart at all, not even a greyed one: recharts derives an axis
             from an all-zero series, and that $0–$4 scale is a range this
             member does not have. The panel says so in words instead. */
          <div className="grid h-full place-items-center">
            <div className="flex flex-col items-center gap-2.5 px-4 text-center">
              <span className="grid h-11 w-11 place-items-center rounded-[5px] bg-[var(--dash-well)] text-ink-4 ring-1 ring-inset ring-[var(--dash-border)]">
                <LineChart size={19} strokeWidth={1.9} />
              </span>
              <p className="text-[12.5px] text-ink-2">No earnings in this period yet.</p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 6, right: 14, left: 2, bottom: 0 }}>
              <defs>
                <linearGradient id="memberIncome" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-s1)" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="var(--color-s1)" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--dash-border)" strokeDasharray="4 4" vertical={false} />
              <XAxis dataKey="date" tickFormatter={axisDate} tickLine={false} axisLine={false}
                     tick={{ fill: 'var(--color-ink-2)', fontSize: 11 }} dy={6} />
              <YAxis tickFormatter={(v: number) => (v >= 1000 ? `$${Math.round(v / 1000)}K` : `$${v}`)}
                     tickLine={false} axisLine={false} width={46} tick={{ fill: 'var(--color-ink-2)', fontSize: 11 }} />
              <Tooltip
                cursor={{ stroke: 'var(--color-s1)', strokeWidth: 1, strokeDasharray: '4 4' }}
                content={({ active, payload, label }) => active && payload?.length ? (
                  <div className="rounded-[4px] border border-line bg-card px-3 py-2 shadow-[0_8px_24px_-8px_rgba(16,24,40,0.22)]">
                    <p className="text-[11px] text-ink-2">{label ? axisDate(String(label)) : ''}</p>
                    <p className="mt-0.5 text-[13.5px] font-semibold tabular-nums text-ink">{usd(payload[0]!.value as number)}</p>
                  </div>
                ) : null}
              />
              <Area type="monotone" dataKey="value" stroke="var(--color-s1)" strokeWidth={2} fill="url(#memberIncome)"
                    dot={false} activeDot={{ r: 5, fill: 'var(--color-s1)', stroke: 'var(--color-card)', strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <ul className="grid grid-cols-2 gap-px border-t border-[var(--dash-border)] bg-[var(--dash-border)] sm:grid-cols-4">
        {(['DAILY_ROI', 'DIRECT_BONUS', 'GENERATION_BONUS', 'RANK_BONUS'] as const).map((c) => {
          const row = income?.breakdown.find((b) => b.category === c);
          return (
            <li key={c} className="bg-card px-4 py-3.5">
              <p className="truncate text-[10.5px] uppercase tracking-[0.04em] text-ink-2">{LABEL[c] ?? titleCase(c)}</p>
              <p className="mt-1 text-[15px] font-semibold tabular-nums text-ink">{usd(row?.total ?? 0)}</p>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
