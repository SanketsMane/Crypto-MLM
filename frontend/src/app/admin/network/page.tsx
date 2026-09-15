'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Network, Search, Users, Wallet } from 'lucide-react';
import { adminGet, adminError } from '@/lib/admin-api';
import { Card, CardHead, PageHeader, Table, Select, Badge, Skeleton, controlCls } from '@/components/ui/primitives';
import { StatCard } from '@/components/dashboard/stat-card';
import { GrowNetworkCard } from '@/components/dashboard/promo-card';
import { GenealogyTree, RootCard, type TreeNode } from '@/components/admin/genealogy-tree';
import { usd, num } from '@/lib/format';

interface Level { level: number; members: number; active: number; volume: string }
interface Dash { network: { totalMembers: number; activeMembers: number; totalTeams: number; teamVolume: string } }
interface Genealogy {
  root: {
    id: string; userCode: string; name: string; status: string;
    totalInvested: string; directCount: number; activeDirectCount: number;
    teamBusiness: string; teamSize: number; powerLegVolume: string;
    sponsorCode: string | null; joinedAt: string;
  };
  upline: { userCode: string; level: number; status: string }[];
  legs: { userCode: string; volume: string; members: number }[];
  totalDownline: number; shown: number; truncated: boolean; depth: number;
  children: TreeNode[];
}

export default function NetworkPage() {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [depth, setDepth] = useState('3');

  const levels = useQuery({ queryKey: ['admin', 'network-levels'], queryFn: () => adminGet<Level[]>('/admin/network-levels') });
  const dash = useQuery({ queryKey: ['admin', 'dashboard'], queryFn: () => adminGet<Dash>('/admin/dashboard') });

  const tree = useQuery({
    queryKey: ['admin', 'genealogy', submitted, depth],
    queryFn: () => adminGet<Genealogy>('/admin/network/genealogy', { userCode: submitted, depth }),
    enabled: submitted.length > 0,
    retry: false,
  });

  const n = dash.data?.network;
  const maxMembers = Math.max(1, ...(levels.data ?? []).map((l) => l.members));
  const g = tree.data;

  return (
    <>
      <PageHeader title="Network" subtitle="Genealogy depth, member distribution and team volume by level." />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Members" value={num(n?.totalMembers ?? 0)} change={null} icon={Users} chip="bg-violet-soft text-violet-on" loading={dash.isLoading} />
        <StatCard label="Active Members" value={num(n?.activeMembers ?? 0)} change={null} icon={Users} chip="bg-good-soft text-good-on" loading={dash.isLoading} />
        <StatCard label="Root Accounts" value={num(n?.totalTeams ?? 0)} change={null} icon={Network} chip="bg-warn-soft text-warn-on" loading={dash.isLoading} />
        <StatCard label="Team Volume" value={usd(n?.teamVolume)} change={null} icon={Wallet} chip="bg-info-soft text-info-on" loading={dash.isLoading} />
      </div>

      {/* ── genealogy browser ─────────────────────────────────────────────
          The level histogram below answers "how deep is the network".
          This answers "what does it look like around this member", which is
          the question support is actually asked.                          */}
      <Card className="mt-3.5">
        <CardHead
          title="Genealogy browser"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Select label="How many levels to show" value={depth} onChange={setDepth} className="h-9 text-[12.5px]"
                      options={[1, 2, 3, 4, 5].map((d) => ({ value: String(d), label: `${d} level${d === 1 ? '' : 's'} deep` }))} />
              <form onSubmit={(e) => { e.preventDefault(); setSubmitted(query.trim().toUpperCase()); }}
                    className="relative flex items-center">
                <Search size={15} className="pointer-events-none absolute left-3 text-ink-3" />
                <input value={query} onChange={(e) => setQuery(e.target.value)}
                       placeholder="Member ID e.g. FX100001"
                       className={`${controlCls} h-9 w-56 pl-9 text-[12.5px] uppercase placeholder:normal-case`} />
              </form>
            </div>
          }
        />

        {!submitted ? (
          <p className="px-5 py-12 text-center text-[13.5px] text-ink-2">
            Search a member ID to see their sponsor chain, their legs and the network beneath them.
          </p>
        ) : tree.isLoading ? (
          <div className="space-y-2 px-5 pb-5">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
        ) : tree.isError ? (
          <p className="px-5 py-12 text-center text-[13.5px] text-bad">{adminError(tree.error)}</p>
        ) : g ? (
          <>
            <RootCard root={g.root} />

            {(g.upline.length > 0 || g.legs.length > 0) && (
              <div className="grid gap-px border-b border-line bg-line lg:grid-cols-2">
                <div className="bg-card px-5 py-3">
                  <p className="mb-1.5 text-[10.5px] uppercase tracking-[0.04em] text-ink-2">Sponsor chain</p>
                  {g.upline.length === 0 ? (
                    <p className="text-[12.5px] text-ink-3">Root account — nobody above.</p>
                  ) : (
                    <ol className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
                      {[...g.upline].reverse().map((u) => (
                        <li key={u.userCode} className="flex items-center gap-1.5">
                          <span className="rounded-[3px] bg-canvas px-1.5 py-0.5 font-medium tabular-nums text-ink-2">
                            {u.userCode}
                          </span>
                          <span className="text-ink-3">›</span>
                        </li>
                      ))}
                      <li className="font-semibold text-gold">{g.root.userCode}</li>
                    </ol>
                  )}
                </div>
                <div className="bg-card px-5 py-3">
                  <p className="mb-1.5 text-[10.5px] uppercase tracking-[0.04em] text-ink-2">
                    Legs — power leg carries {usd(g.root.powerLegVolume, 0)}
                  </p>
                  {g.legs.length === 0 ? (
                    <p className="text-[12.5px] text-ink-3">No direct referrals yet.</p>
                  ) : (
                    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
                      {g.legs.map((l) => (
                        <li key={l.userCode} className="tabular-nums">
                          <span className="font-medium text-ink">{l.userCode}</span>
                          <span className="text-ink-2"> · {usd(l.volume, 0)} · {num(l.members)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            <GenealogyTree children={g.children} />

            <p className="border-t border-line px-5 py-2.5 text-[11.5px] text-ink-3">
              Showing {num(g.shown)} of {num(g.totalDownline)} members in this downline, to {g.depth} level
              {g.depth === 1 ? '' : 's'}.
              {g.truncated && ' This branch is larger than one view — narrow the depth or open a member directly.'}
            </p>
          </>
        ) : null}
      </Card>

      <div className="mt-3.5 grid grid-cols-1 items-start gap-3.5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHead title="Distribution by generation level" />
          <Table
            head={['Level', 'Members', 'Active', 'Volume', 'Share']}
            empty="No downline members yet."
            rows={(levels.data ?? []).map((l) => [
              <span key="a" className="font-medium">Level {l.level}</span>,
              <span key="b" className="tabular-nums">{num(l.members)}</span>,
              <span key="c" className="tabular-nums text-good">{num(l.active)}</span>,
              <span key="d" className="tabular-nums">{usd(l.volume)}</span>,
              <span key="e" className="flex items-center gap-2">
                <span className="h-1.5 w-24 overflow-hidden rounded-full bg-line-soft">
                  <span className="block h-full rounded-full bg-violet" style={{ width: `${(l.members / maxMembers) * 100}%` }} />
                </span>
              </span>,
            ])}
          />
        </Card>
        <GrowNetworkCard />
      </div>
    </>
  );
}
