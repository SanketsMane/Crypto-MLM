'use client';

import { useQuery } from '@tanstack/react-query';
import { Check, Trophy } from 'lucide-react';
import { get } from '@/lib/api';
import { Card, CardHead } from '@/components/ui/primitives';
import { StatCard } from '@/components/dashboard/stat-card';
import { Users, Wallet } from 'lucide-react';
import { usd, pct, shortDate } from '@/lib/format';
import { rankLabel } from '@/lib/rank';
import { RewardSchedule } from '@/components/member/reward-schedule';

interface RankRow {
  rankCode: string; rankName: string; level: number;
  required: { selfCapital: string; teamBusiness: string; powerLegMax: string; otherLegsMin: string };
  actual: { selfCapital: string; teamBusiness: string; powerLeg: string; otherLegs: string };
  achieved: boolean; achievedAt: string | null; reward: string; percentComplete: number;
}

export default function RankPage() {
  const { data, isLoading } = useQuery({ queryKey: ['member', 'rank'], queryFn: () => get<RankRow[]>('/rank') });
  const first = data?.[0];
  const achievedCount = (data ?? []).filter((r) => r.achieved).length;

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Ranks Achieved" value={`${achievedCount} / ${data?.length ?? 10}`} change={null}
                  icon={Trophy} chip="bg-warn-soft text-warn" loading={isLoading} />
        <StatCard label="Power Leg" value={usd(first?.actual.powerLeg)} change={null}
                  icon={Users} chip="bg-violet-soft text-violet" loading={isLoading} />
        <StatCard label="Other Legs" value={usd(first?.actual.otherLegs)} change={null}
                  icon={Wallet} chip="bg-[#E8F1FE] text-info dark:bg-[#12233D]" loading={isLoading} />
      </div>

      <RewardSchedule />

      <Card className="mt-3.5">
        <CardHead title="How rank qualification works" />
        <p className="px-5 pb-5 text-[12.5px] leading-relaxed text-ink-2">
          Each rank needs both a personal investment and a team business total. Team business counts
          <span className="font-medium text-ink"> 50:50</span> — at most half may come from your strongest leg,
          and at least half must come from all your other legs combined. Business already counted carries forward
          to the next rank.
        </p>
      </Card>

      <div className="mt-3.5 space-y-2.5">
        {(data ?? []).map((r) => {
          const half = Number(r.required.powerLegMax);
          const power = Number(r.actual.powerLeg);
          const others = Number(r.actual.otherLegs);
          return (
            <Card key={r.rankCode} className={r.achieved ? 'border-good/40' : undefined}>
              <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
                <div className="flex items-center gap-3">
                  <span className={`grid h-10 w-10 place-items-center rounded-xl ${
                    r.achieved ? 'bg-good-soft text-good' : 'bg-canvas text-ink-3'}`}>
                    {r.achieved ? <Check size={18} strokeWidth={2.4} /> : <Trophy size={17} />}
                  </span>
                  <div>
                    <p className="text-[15px] font-semibold text-ink">{rankLabel(r.level)}</p>
                    {r.achievedAt && (
                      <p className="text-[11.5px] text-ink-2">Achieved {shortDate(r.achievedAt)}</p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[17px] font-semibold tabular-nums text-ink">{usd(r.reward, 0)}</p>
                  <p className="text-[10.5px] uppercase tracking-wide text-ink-2">reward</p>
                </div>
              </div>

              <div className="px-5 pb-5 pt-3">
                <div className="h-2 overflow-hidden rounded-full bg-line-soft">
                  <div className={`h-full rounded-full ${r.achieved ? 'bg-good' : 'bg-violet'}`}
                       style={{ width: `${Math.max(1.5, Math.min(100, r.percentComplete))}%` }} />
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  {[
                    { label: 'Self capital', now: Number(r.actual.selfCapital), need: Number(r.required.selfCapital) },
                    { label: 'Power leg (max 50%)', now: power, need: half },
                    { label: 'Other legs (min 50%)', now: others, need: half },
                  ].map((m) => (
                    <div key={m.label}>
                      <div className="flex justify-between text-[11.5px]">
                        <span className="text-ink-2">{m.label}</span>
                        <span className={`tabular-nums ${m.now >= m.need ? 'text-good' : 'text-ink-2'}`}>
                          {usd(m.now, 0)} / {usd(m.need, 0)}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line-soft">
                        <div className={`h-full rounded-full ${m.now >= m.need ? 'bg-good' : 'bg-violet'}`}
                             style={{ width: `${m.need > 0 ? Math.min(100, Math.max(1.5, (m.now / m.need) * 100)) : 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>

                <p className="mt-3 text-[11.5px] tabular-nums text-ink-2">
                  Team business {usd(r.actual.teamBusiness)} of {usd(r.required.teamBusiness, 0)} · {pct(r.percentComplete)}
                </p>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
