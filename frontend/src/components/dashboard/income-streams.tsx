'use client';

import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardHead, Select, Skeleton } from '@/components/ui/primitives';
import { usdWhole, titleCase } from '@/lib/format';

export interface IncomePoint { day: string; category: string; total: string }

const STREAMS = ['DAILY_ROI', 'DIRECT_BONUS', 'GENERATION_BONUS', 'RANK_BONUS'] as const;
const COLOR: Record<string, string> = {
  DAILY_ROI: 'var(--color-chart-1)',
  DIRECT_BONUS: 'var(--color-chart-2)',
  GENERATION_BONUS: 'var(--color-chart-3)',
  RANK_BONUS: 'var(--color-good)',
};

const axisDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/**
 * What the platform paid out, by stream, per day.
 *
 * `/admin/reports/income-series` has always returned this; nothing drew it, so
 * the only view of payout composition was a single all-time total per stream.
 * Stacked, because the question is "what did we pay in total, and what drove it".
 */
export function IncomeStreams({ rows, days, onDays, loading }: {
  rows: IncomePoint[]; days: string; onDays: (v: string) => void; loading?: boolean;
}) {
  /* one row per day, one column per stream — recharts wants it pivoted */
  const byDay = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const key = new Date(r.day).toISOString().slice(0, 10);
    const row = byDay.get(key) ?? {};
    row[r.category] = (row[r.category] ?? 0) + Number(r.total);
    byDay.set(key, row);
  }
  const data = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, streams]) => ({ date, ...Object.fromEntries(STREAMS.map((s) => [s, streams[s] ?? 0])) }));

  const empty = !loading && data.length === 0;

  return (
    <Card>
      <CardHead
        title="Payout streams over time"
        action={
          <Select value={days} onChange={onDays} className="h-9 text-[12.5px]"
                  options={[
                    { value: '14', label: 'Last 14 days' },
                    { value: '30', label: 'Last 30 days' },
                    { value: '90', label: 'Last 90 days' },
                  ]} />
        }
      />
      <div className="px-2 pb-4">
        {loading ? <Skeleton className="mx-3 h-[280px]" /> : (
          <div className="relative h-[280px]">
            {empty && (
              <div className="absolute inset-0 z-10 grid place-items-center">
                <p className="text-[13px] text-ink-2">Nothing has been paid out in this period yet.</p>
              </div>
            )}
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-chart-grid)" strokeDasharray="4 4" vertical={false} />
                <XAxis dataKey="date" tickFormatter={axisDate} tickLine={false} axisLine={false}
                       tick={{ fill: 'var(--color-chart-axis)', fontSize: 11.5 }} dy={8} />
                <YAxis tickFormatter={(v: number) => (v >= 1000 ? `$${Math.round(v / 1000)}K` : `$${v}`)}
                       tickLine={false} axisLine={false} width={54}
                       tick={{ fill: 'var(--color-chart-axis)', fontSize: 11.5 }} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const total = payload.reduce((a, p) => a + Number(p.value ?? 0), 0);
                    return (
                      <div className="rounded-lg border border-line bg-card px-3 py-2 shadow-pop">
                        <p className="text-[11px] text-ink-2">{label ? axisDate(String(label)) : ''}</p>
                        {payload.filter((p) => Number(p.value) > 0).map((p) => (
                          <p key={String(p.dataKey)} className="mt-0.5 flex items-center gap-2 text-[12px]">
                            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                            <span className="flex-1 text-ink-2">{titleCase(String(p.dataKey))}</span>
                            <span className="font-medium tabular-nums text-ink">{usdWhole(Number(p.value))}</span>
                          </p>
                        ))}
                        <p className="mt-1 border-t border-line pt-1 text-[12px] font-semibold tabular-nums text-ink">
                          {usdWhole(total)} total
                        </p>
                      </div>
                    );
                  }}
                />
                <Legend iconType="circle" iconSize={8}
                        formatter={(v) => <span className="text-[11.5px] text-ink-2">{titleCase(String(v))}</span>} />
                {STREAMS.map((s) => (
                  <Area key={s} type="monotone" dataKey={s} stackId="income"
                        stroke={COLOR[s]} fill={COLOR[s]} fillOpacity={0.18} strokeWidth={2} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </Card>
  );
}
