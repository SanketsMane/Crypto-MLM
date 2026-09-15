'use client';

import { useQuery } from '@tanstack/react-query';
import { Lock, Unlock } from 'lucide-react';
import { get } from '@/lib/api';
import { Card, CardHead, Table, Badge, Metric } from '@/components/ui/primitives';
import { usd, num } from '@/lib/format';

interface Level {
  level: number; percent: string; requiredDirects: number; requiredTeamVolume: string;
  unlocked: boolean; needDirects: number; needVolume: string;
  members: number; active: number; volume: string;
}

export default function LevelsPage() {
  const { data, isLoading } = useQuery({ queryKey: ['member', 'levels'], queryFn: () => get<Level[]>('/customer/levels') });
  const rows = data ?? [];
  const unlocked = rows.filter((r) => r.unlocked).length;
  const totalMembers = rows.reduce((a, r) => a + r.members, 0);
  const totalVolume = rows.reduce((a, r) => a + Number(r.volume), 0);
  const totalActive = rows.reduce((a, r) => a + r.active, 0);
  /* The first level still locked — what the member is actually working on. */
  const next = rows.find((r) => !r.unlocked);

  return (
    <>
      <div className="grid grid-cols-3 gap-2.5">
        <Metric label="Levels unlocked" value={isLoading ? '—' : `${unlocked} / ${rows.length || 30}`}
                hint={next ? `level ${next.level} pays ${next.percent}%` : 'every level open'} />
        <Metric label="Downline members" value={isLoading ? '—' : num(totalMembers)}
                hint={`${num(totalActive)} holding an active package`} />
        <Metric label="Downline volume" value={isLoading ? '—' : usd(totalVolume)}
                hint="capital deployed beneath you" />
      </div>

      <Card className="mt-3.5">
        <CardHead title="Generation levels" />
        <p className="px-3.5 pb-3 text-[12.5px] leading-relaxed text-ink-2">
          Each level pays a share of the daily return earned by members at that depth. A level unlocks once you
          hold enough active direct referrals and enough team volume — both conditions must be met.
        </p>
        <Table
          head={['Level', 'Pays', 'Status', 'Needs', 'Members', 'Active', 'Volume']}
          empty="Levels are being configured."
          rows={rows.map((l) => [
            <span key="a" className="font-semibold tabular-nums">Level {l.level}</span>,
            <span key="b" className="font-medium tabular-nums text-gold">{l.percent}%</span>,
            l.unlocked
              ? <Badge key="c" tone="good"><span className="inline-flex items-center gap-1"><Unlock size={10} /> unlocked</span></Badge>
              : <Badge key="c" tone="neutral"><span className="inline-flex items-center gap-1"><Lock size={10} /> locked</span></Badge>,
            <span key="d" className="text-ink-2">
              {l.unlocked ? '—' : [
                l.needDirects > 0 ? `${l.needDirects} direct${l.needDirects === 1 ? '' : 's'}` : null,
                Number(l.needVolume) > 0 ? `${usd(l.needVolume, 0)} volume` : null,
              ].filter(Boolean).join(' · ') || 'Ready'}
            </span>,
            <span key="e" className="tabular-nums">{num(l.members)}</span>,
            <span key="f" className="tabular-nums text-good">{num(l.active)}</span>,
            <span key="g" className="tabular-nums">{usd(l.volume)}</span>,
          ])}
        />
      </Card>
    </>
  );
}
