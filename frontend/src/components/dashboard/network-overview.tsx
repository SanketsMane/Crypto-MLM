'use client';

import Link from 'next/link';
import { User } from 'lucide-react';
import { Card, CardHead, Skeleton } from '@/components/ui/primitives';
import { num, usdWhole } from '@/lib/format';

export interface NetworkData {
  totalMembers: number; activeMembers: number; totalTeams: number; teamVolume: string;
  levels: { level: number; members: number }[];
}

/** Node cluster under each level — capped, with a remainder chip. */
function Cluster({ members }: { members: number }) {
  const show = Math.min(members, 8);
  return (
    <div className="flex flex-wrap justify-center gap-1.5">
      {Array.from({ length: show }).map((_, i) => (
        <span key={i}
              className={`grid h-6 w-6 place-items-center rounded-full ring-2 ring-card ${
                i < Math.ceil(show * 0.7) ? 'bg-violet/15 text-violet' : 'bg-line text-ink-3'}`}>
          <User size={11} strokeWidth={2.2} />
        </span>
      ))}
      {members > show && (
        <span className="grid h-6 min-w-6 place-items-center rounded-full bg-navy px-1.5 text-[9.5px] font-semibold text-white">
          +{num(members - show)}
        </span>
      )}
    </div>
  );
}

export function NetworkOverview({ data, rootCode, loading }: {
  data: NetworkData | undefined; rootCode: string; loading?: boolean;
}) {
  const levels = [1, 2, 3].map((l) => ({
    level: l,
    members: data?.levels.find((x) => x.level === l)?.members ?? 0,
  }));

  return (
    <Card className="flex flex-col">
      <CardHead title="Network Overview" />
      <div className="px-5 pb-4">
        {loading ? <Skeleton className="h-[230px]" /> : (
          <>
            {/* root */}
            <div className="flex justify-center">
              <div className="inline-flex items-center gap-2.5 rounded-[5px] bg-navy px-4 py-2.5">
                <span className="grid h-7 w-7 place-items-center rounded-[4px] bg-gradient-to-br from-gold to-gold-hi text-navy">
                  <User size={14} strokeWidth={2.4} />
                </span>
                <span className="leading-tight">
                  <span className="block text-[13px] font-semibold text-white">Platform Root</span>
                  <span className="block text-[10.5px] text-white/55">ID: {rootCode}</span>
                </span>
              </div>
            </div>

            {/* connector */}
            <svg viewBox="0 0 300 26" aria-hidden className="mx-auto mt-1 h-6 w-full max-w-[420px]">
              <path d="M150 0 V10 M40 26 V16 H260 V26 M150 10 V16" fill="none"
                    stroke="var(--color-line)" strokeWidth="1.5" />
            </svg>

            {/* levels */}
            <div className="grid grid-cols-3 gap-2.5">
              {levels.map((l) => (
                <div key={l.level} className="rounded-[5px] border border-line bg-canvas/60 px-2 py-2.5 text-center">
                  <p className="text-[12px] font-semibold text-ink">Level {l.level}</p>
                  <p className="text-[11px] tabular-nums text-ink-2">{num(l.members)} members</p>
                </div>
              ))}
            </div>

            <div className="mt-3.5 grid grid-cols-3 gap-2.5">
              {levels.map((l) => <Cluster key={l.level} members={l.members} />)}
            </div>
          </>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-4">
        {[
          { k: 'Total Members', v: num(data?.totalMembers ?? 0) },
          { k: 'Active Members', v: num(data?.activeMembers ?? 0) },
          { k: 'Total Teams', v: num(data?.totalTeams ?? 0) },
          { k: 'Team Volume', v: usdWhole(data?.teamVolume) },
        ].map((s) => (
          <div key={s.k} className="bg-card px-4 py-3">
            <dt className="text-[10.5px] uppercase tracking-[0.04em] text-ink-2">{s.k}</dt>
            <dd className="mt-1 text-[16px] font-semibold tabular-nums text-violet">{s.v}</dd>
          </div>
        ))}
      </dl>

      <Link href="/admin/network"
            className="border-t border-line py-2.5 text-center text-[13px] font-medium text-violet transition hover:bg-canvas">
        Explore network
      </Link>
    </Card>
  );
}
