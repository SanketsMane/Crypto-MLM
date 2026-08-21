'use client';

import { useQuery } from '@tanstack/react-query';
import { Users, Wallet, Network, Percent } from 'lucide-react';
import { get } from '@/lib/api';
import { Card, CardHead, Table, Badge } from '@/components/ui/primitives';
import { StatCard } from '@/components/dashboard/stat-card';
import { ReferralPanel } from '@/components/member/cards/referral-panel';
import { usd, num, shortDate } from '@/lib/format';

interface Summary {
  totalTeamBusiness: string; directBusiness: string; powerLegVolume: string;
  otherLegsVolume: string; teamSize: number; directCount: number;
  legs: { directId: string; userCode: string; volume: string; members: number }[];
}
interface Member { id: string; userCode: string; firstName: string; lastName: string | null; status: string; totalInvested: string; createdAt: string }
interface Dash { profile: { userCode: string; referralLink: string }; team: { directCount: number; activeDirectCount: number; teamSize: number; directBusiness: string } }

export default function TeamPage() {
  const s = useQuery({ queryKey: ['member', 'team'], queryFn: () => get<Summary>('/team') });
  const directs = useQuery({ queryKey: ['member', 'level', 1], queryFn: () => get<Member[]>('/team/level/1') });
  const dash = useQuery({ queryKey: ['member', 'dashboard'], queryFn: () => get<Dash>('/customer/dashboard') });

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Team Size" value={num(s.data?.teamSize)} change={null} icon={Users}
                  chip="bg-violet-soft text-violet" loading={s.isLoading} />
        <StatCard label="Direct Referrals" value={num(s.data?.directCount)} change={null} icon={Network}
                  chip="bg-[#E8F1FE] text-info dark:bg-[#12233D]" loading={s.isLoading} />
        <StatCard label="Team Business" value={usd(s.data?.totalTeamBusiness)} change={null} icon={Wallet}
                  chip="bg-good-soft text-good" loading={s.isLoading} />
        <StatCard label="Direct Business" value={usd(s.data?.directBusiness)} change={null} icon={Percent}
                  chip="bg-warn-soft text-warn" loading={s.isLoading} />
      </div>

      <div className="mt-3.5 grid grid-cols-1 items-start gap-3.5 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <ReferralPanel profile={dash.data?.profile} team={dash.data?.team} />
        </div>

        <div className="space-y-3.5 lg:col-span-8">
          <Card>
            <CardHead title="Your legs" />
            <p className="px-5 pb-3 text-[12.5px] text-ink-2">
              Rank qualification counts your strongest leg for at most half the requirement — the rest must come
              from your other legs combined.
            </p>
            <Table
              head={['Direct', 'Members', 'Volume', 'Role']}
              empty="No legs yet — invite your first member to begin."
              rows={(s.data?.legs ?? []).map((l, i) => [
                <span key="a" className="font-medium">{l.userCode}</span>,
                <span key="b" className="tabular-nums">{num(l.members)}</span>,
                <span key="c" className="font-semibold tabular-nums">{usd(l.volume)}</span>,
                i === 0
                  ? <Badge key="d" tone="info">power leg</Badge>
                  : <span key="d" className="text-[12px] text-ink-2">other</span>,
              ])}
            />
          </Card>

          <Card>
            <CardHead title={`Direct referrals — ${directs.data?.length ?? 0}`} />
            <Table
              head={['Member', 'Name', 'Status', 'Invested', 'Joined']}
              empty="No direct referrals yet."
              rows={(directs.data ?? []).map((m) => [
                <span key="a" className="font-medium">{m.userCode}</span>,
                <span key="b">{[m.firstName, m.lastName].filter(Boolean).join(' ')}</span>,
                <Badge key="c" tone={m.status === 'ACTIVE' ? 'good' : 'neutral'}>{m.status}</Badge>,
                <span key="d" className="tabular-nums">{usd(m.totalInvested)}</span>,
                <span key="e" className="text-ink-2">{shortDate(m.createdAt)}</span>,
              ])}
            />
          </Card>
        </div>
      </div>
    </>
  );
}
