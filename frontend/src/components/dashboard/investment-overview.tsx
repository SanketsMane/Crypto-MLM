'use client';

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardHead, Select, Skeleton } from '@/components/ui/primitives';
import { usdWhole } from '@/lib/format';

export interface SeriesPoint { date: string; value: number }

const axisDate = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** Single series → no legend needed; the card title names it.
 *  Surface, border and shadow are tokens, so the tooltip re-colours with the
 *  theme instead of staying a white box on a navy chart. */
function ChartTooltip({ active, payload, label }: {
  active?: boolean; payload?: { value: number }[]; label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-card px-3 py-2 shadow-pop">
      <p className="text-[11px] text-ink-2">{label ? axisDate(label) : ''}</p>
      <p className="mt-0.5 text-[14px] font-semibold tabular-nums text-ink">{usdWhole(payload[0]!.value)}</p>
    </div>
  );
}

export function InvestmentOverview({ data, range, onRange, loading }: {
  data: SeriesPoint[]; range: string; onRange: (v: string) => void; loading?: boolean;
}) {
  const empty = !loading && data.every((d) => d.value === 0);

  return (
    <Card className="h-full">
      <CardHead
        title="Investment Overview"
        action={
          <Select label="Choose a time range" value={range} onChange={onRange} className="h-9 text-[12.5px]"
                  options={[
                    { value: '7', label: 'This Week' },
                    { value: '30', label: 'Last 30 Days' },
                    { value: '90', label: 'Last 90 Days' },
                  ]} />
        }
      />
      <div className="px-2 pb-4">
        {loading ? (
          <Skeleton className="mx-3 h-[268px]" />
        ) : (
          <div className="relative h-[268px]">
            {empty && (
              <div className="absolute inset-0 z-10 grid place-items-center">
                <p className="text-[13px] text-ink-2">No investments in this period yet.</p>
              </div>
            )}
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="fxArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.24} />
                    <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                {/* recessive grid — horizontal only */}
                <CartesianGrid stroke="var(--color-chart-grid)" strokeDasharray="4 4" vertical={false} />
                <XAxis dataKey="date" tickFormatter={axisDate} tickLine={false} axisLine={false}
                       tick={{ fill: 'var(--color-chart-axis)', fontSize: 11.5 }} dy={8} />
                <YAxis tickFormatter={(v: number) => (v >= 1000 ? `$${Math.round(v / 1000)}K` : `$${v}`)}
                       tickLine={false} axisLine={false} width={54}
                       tick={{ fill: 'var(--color-chart-axis)', fontSize: 11.5 }} />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--color-chart-1)', strokeWidth: 1, strokeDasharray: '4 4' }} />
                <Area type="monotone" dataKey="value" stroke="var(--color-chart-1)" strokeWidth={2}
                      fill="url(#fxArea)"
                      dot={{ r: 3.5, fill: 'var(--color-card)', stroke: 'var(--color-chart-1)', strokeWidth: 2 }}
                      activeDot={{ r: 5.5, fill: 'var(--color-chart-1)', stroke: 'var(--color-card)', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </Card>
  );
}
