'use client';

import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { Card, CardHead, Table, Badge, Metric } from '@/components/ui/primitives';
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

  /* What share of the team's volume the member's own directs account for —
     the difference between a wide first line and a deep one. */
  const team = Number(s.data?.totalTeamBusiness ?? 0);
  const direct = Number(s.data?.directBusiness ?? 0);
  const teamShare = team > 0
    ? `${Math.round((direct / team) * 100)}% of it from your directs`
    : 'no volume yet';

  return (
    <>
      {/* Four figures, each with the ratio that gives it meaning. The tiles
          these replace were 118px tall, carried a tinted icon chip that said
          nothing a label did not already say, and stated each number with
          nothing to compare it against. */}
      <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
        <Metric label="Team size" value={s.isLoading ? '—' : num(s.data?.teamSize)}
                hint={`${num(s.data?.directCount)} direct · ${num(Math.max(0, (s.data?.teamSize ?? 0) - (s.data?.directCount ?? 0)))} below them`} />
        <Metric label="Direct referrals" value={s.isLoading ? '—' : num(s.data?.directCount)}
                hint={`${num(s.data?.legs?.length ?? 0)} leg${(s.data?.legs?.length ?? 0) === 1 ? '' : 's'} producing volume`} />
        <Metric label="Team business" value={s.isLoading ? '—' : usd(s.data?.totalTeamBusiness)}
                hint={teamShare} />
        <Metric label="Direct business" value={s.isLoading ? '—' : usd(s.data?.directBusiness)}
                hint="bought by the people you sponsored" />
      </div>

      <div className="mt-3.5 grid grid-cols-1 items-start gap-3.5 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <ReferralPanel profile={dash.data?.profile} team={dash.data?.team} />
        </div>

        <div className="space-y-3.5 lg:col-span-8">
          <Card>
            <CardHead title="Your legs" />
            <p className="px-3.5 pb-3 text-[12.5px] text-ink-2">
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
