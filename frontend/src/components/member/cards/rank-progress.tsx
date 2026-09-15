'use client';

import Link from 'next/link';
import { Trophy } from 'lucide-react';
import { Card, CardHead } from '@/components/ui/primitives';
import { usd, pct } from '@/lib/format';
import { rankLabel } from '@/lib/rank';

export function RankProgress({ rank, team }: {
  rank?: { current: { name: string; level: number } | null; next: { name: string; level: number; reward: string; selfCapital: string; teamBusiness: string; percent: number } | null };
  team?: { totalTeamBusiness: string; powerLegVolume: string; otherLegsVolume: string };
}) {
  const next = rank?.next;
  const half = next ? Number(next.teamBusiness) / 2 : 0;
  const power = Number(team?.powerLegVolume ?? 0);
  const others = Number(team?.otherLegsVolume ?? 0);

  return (
    <Card className="dash-card flex h-full flex-col">
      <CardHead title="Rank Progress"
        action={<Link href="/rank" className="text-[12.5px] font-medium text-gold hover:underline">All ranks</Link>} />
      <div className="flex flex-1 flex-col px-5 pb-5">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-[5px] bg-gold/12 text-gold ring-1 ring-gold-line/40">
            <Trophy size={19} strokeWidth={2.1} />
          </span>
          <div>
            <p className="text-[15px] font-semibold text-ink">{rank?.current ? rankLabel(rank.current.level) : 'Unranked'}</p>
            <p className="text-[12px] text-ink-2">{next ? `Next: ${rankLabel(next.level)}` : 'Highest rank achieved'}</p>
          </div>
          {next && (
            <span className="ml-auto text-right">
              <span className="block text-[15px] font-semibold tabular-nums text-ink">{usd(next.reward, 0)}</span>
              <span className="block text-[10.5px] uppercase tracking-wide text-ink-2">reward</span>
            </span>
          )}
        </div>

        {next && (
          <>
            <div className="mt-4 h-2 overflow-hidden rounded-[1px] bg-line-soft">
              <div className="h-full rounded-[1px] bg-gradient-to-r from-gold to-gold-hi transition-[width] duration-700"
                   style={{ width: `${Math.max(1.5, next.percent)}%` }} />
            </div>
            <p className="mt-2 text-[12px] tabular-nums text-ink-2">
              {usd(team?.totalTeamBusiness)} of {usd(next.teamBusiness, 0)} team business · {pct(next.percent)}
            </p>

            {/* the 50:50 rule made visible — this is what actually gates the rank.
                `mt-auto` drops it to the foot of whatever height the row sets. */}
            <div className="mt-auto space-y-2.5 pt-5">
              {[
                { label: 'Power leg (max 50%)', value: power },
                { label: 'Other legs (min 50%)', value: others },
              ].map((leg) => (
                <div key={leg.label}>
                  <div className="flex justify-between text-[11.5px]">
                    <span className="text-ink-2">{leg.label}</span>
                    <span className="tabular-nums text-ink-2">{usd(leg.value)} / {usd(half, 0)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-[1px] bg-line-soft">
                    <div className="h-full rounded-[1px] bg-gold"
                         style={{ width: `${half > 0 ? Math.min(100, Math.max(1.5, (leg.value / half) * 100)) : 1.5}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
