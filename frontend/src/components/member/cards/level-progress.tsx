'use client';

import Link from 'next/link';
import { Lock, Unlock } from 'lucide-react';
import { Card, CardHead } from '@/components/ui/primitives';
import { usd } from '@/lib/format';

/** All 30 generation levels as a grid — unlocked ones read at a glance. */
export function LevelProgress({ levels }: {
  levels?: { unlocked: number; total: number; next: { level: number; percent: string; needDirects: number; needVolume: string } | null };
}) {
  const total = levels?.total ?? 30;
  const unlocked = levels?.unlocked ?? 0;

  return (
    <Card className="dash-card flex h-full flex-col">
      <CardHead
        title="Level Status"
        action={<Link href="/levels" className="text-[12.5px] font-medium text-violet hover:underline">Details</Link>}
      />
      <div className="flex flex-1 flex-col px-5 pb-5">
        <p className="text-[13px] text-ink-2">
          <span className="text-[20px] font-semibold tabular-nums text-ink">{unlocked}</span>
          <span className="text-ink-2"> of {total} generation levels unlocked</span>
        </p>

        <div className="mt-3.5 grid grid-cols-10 gap-1">
          {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
            <span key={n} title={`Level ${n}`}
              className={`grid aspect-square place-items-center rounded-[5px] text-[9px] font-semibold tabular-nums ${
                n <= unlocked ? 'bg-violet text-white' : 'bg-line-soft text-mute-on'}`}>
              {n}
            </span>
          ))}
        </div>

        {levels?.next ? (
          <div className="mt-auto rounded-[4px] border border-line bg-canvas px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-ink">
              <Lock size={12} className="text-ink-3" /> Unlock level {levels.next.level} — earns {levels.next.percent}%
            </p>
            <p className="mt-1 text-[11.5px] text-ink-2">
              {levels.next.needDirects > 0 && <>{levels.next.needDirects} more active direct{levels.next.needDirects === 1 ? '' : 's'}</>}
              {levels.next.needDirects > 0 && Number(levels.next.needVolume) > 0 && ' · '}
              {Number(levels.next.needVolume) > 0 && <>{usd(levels.next.needVolume)} more team volume</>}
              {levels.next.needDirects === 0 && Number(levels.next.needVolume) <= 0 && 'Requirements met — unlocks on the next run.'}
            </p>
          </div>
        ) : (
          <p className="mt-auto flex items-center gap-1.5 rounded-[4px] bg-good-soft px-3 py-2.5 text-[12px] text-good">
            <Unlock size={12} /> Every level is unlocked.
          </p>
        )}
      </div>
    </Card>
  );
}
