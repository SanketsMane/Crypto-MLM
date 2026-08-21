'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, CardHead, Skeleton } from '@/components/ui/primitives';
import { num, pct } from '@/lib/format';

export interface Segment { key: string; label: string; count: number; percent: number }

/* Series are re-picked per theme (see --color-chart-* in globals.css) rather
   than reused blindly: light leads with purple on white, dark leads with gold
   on navy. Both sets are validated for CVD against their own surface —
   lightness band · chroma floor · adjacent ΔE · contrast — and contrast
   relief is satisfied by the direct labels in the legend. */
const SERIES = ['var(--color-chart-1)', 'var(--color-chart-2)', 'var(--color-chart-3)'];

export function PortfolioStats({ total, segments, loading }: {
  total: number; segments: Segment[]; loading?: boolean;
}) {
  const data = segments.map((s, i) => ({ ...s, fill: SERIES[i % SERIES.length]! }));
  const hasData = total > 0;

  return (
    <Card className="h-full">
      <CardHead title="Portfolio Statistics" />
      <div className="grid items-center gap-4 px-5 pb-5 sm:grid-cols-[172px_1fr]">
        <div className="relative mx-auto h-[172px] w-[172px]">
          {loading ? <Skeleton className="h-full w-full rounded-full" /> : (
            <>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={hasData ? data : [{ key: 'x', label: 'None', count: 1, percent: 100, fill: 'var(--color-chart-grid)' }]}
                       dataKey="count" innerRadius={58} outerRadius={82} paddingAngle={hasData ? 2 : 0}
                       startAngle={90} endAngle={-270} stroke="var(--color-card)" strokeWidth={2}>
                    {(hasData ? data : [{ fill: 'var(--color-chart-grid)' }]).map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Pie>
                  {hasData && (
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const p = payload[0]!.payload as Segment;
                        return (
                          <div className="rounded-lg border border-line bg-card px-3 py-2 shadow-pop">
                            <p className="text-[12px] font-medium text-ink">{p.label}</p>
                            <p className="text-[11.5px] tabular-nums text-ink-2">{num(p.count)} · {pct(p.percent)}</p>
                          </div>
                        );
                      }}
                    />
                  )}
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
                <p className="text-[22px] font-semibold leading-none tabular-nums text-ink">{num(total)}</p>
                <p className="mt-1 text-[11px] text-ink-2">Total Packages</p>
              </div>
            </>
          )}
        </div>

        {/* legend doubles as the direct labels — identity is never colour-alone */}
        <ul className="space-y-3">
          {data.map((s) => (
            <li key={s.key} className="flex items-center gap-2.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.fill }} />
              <span className="flex-1 truncate text-[13px] text-ink-2">{s.label}</span>
              <span className="text-[13px] font-semibold tabular-nums text-ink">{num(s.count)}</span>
              <span className="w-[52px] text-right text-[12px] tabular-nums text-ink-2">({pct(s.percent)})</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
