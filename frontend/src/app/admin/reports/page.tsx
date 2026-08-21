'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, TrendingUp, Wallet, Layers } from 'lucide-react';
import { adminGet } from '@/lib/admin-api';
import { Card, CardHead, PageHeader, Table, Badge } from '@/components/ui/primitives';
import { StatCard } from '@/components/dashboard/stat-card';
import { IncomeStreams, type IncomePoint } from '@/components/dashboard/income-streams';
import { usd, num, titleCase } from '@/lib/format';

interface Overview {
  users: { total: number; active: number; newToday: number };
  investments: { count: number; volume: string };
  payouts: { total: string; thisMonth: string; byCategory: { category: string; total: string }[] };
  outstandingLiability: string;
  deposits: { count: number; total: string };
  withdrawals: { count: number; total: string; feesCollected: string };
  netPosition: string;
}
interface Earner { userCode: string; email: string; totalInvested: string; totalEarned: string; rank: string | null }
interface CapRow { status: string; count: number; volume: string; capLimit: string; earned: string }

interface Cohort {
  month: string; joined: number; invested: number; conversionPercent: number;
  retained: { month1Percent: number; month3Percent: number; month6Percent: number };
}
interface PlanRow {
  id: string; name: string; price: string; sold: number; matured: number;
  takenIn: string; paidOut: string; remainingLiability: string; payoutRatioPercent: number;
}
interface Solvency {
  memberBalances: string;
  pendingPayouts: { count: number; amount: string };
  futureObligation: { ceiling: string; paidSoFar: string; remaining: string };
}

export default function ReportsPage() {
  const o = useQuery({ queryKey: ['admin', 'overview'], queryFn: () => adminGet<Overview>('/admin/reports/overview') });
  const e = useQuery({ queryKey: ['admin', 'earners'], queryFn: () => adminGet<Earner[]>('/admin/reports/top-earners?take=15') });
  const c = useQuery({ queryKey: ['admin', 'cap'], queryFn: () => adminGet<CapRow[]>('/admin/reports/cap-utilisation') });
  const [days, setDays] = useState('30');
  const income = useQuery({
    queryKey: ['admin', 'income-series', days],
    queryFn: () => adminGet<IncomePoint[]>('/admin/reports/income-series', { days }),
  });
  const cohorts = useQuery<Cohort[]>({
    queryKey: ['admin', 'cohorts'],
    queryFn: () => adminGet('/admin/reports/cohorts'),
  });
  const plans = useQuery<PlanRow[]>({
    queryKey: ['admin', 'plan-performance'],
    queryFn: () => adminGet('/admin/reports/plan-performance'),
  });
  const solvency = useQuery<Solvency>({
    queryKey: ['admin', 'solvency'],
    queryFn: () => adminGet('/admin/reports/solvency'),
  });

  const d = o.data;
  const sv = solvency.data;

  return (
    <>
      <PageHeader title="Reports" subtitle="Platform performance, outstanding liability and top earners." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Members" value={num(d?.users.total)} change={null} icon={Users} chip="bg-violet-soft text-violet-on" loading={o.isLoading} />
        <StatCard label="Capital Invested" value={usd(d?.investments.volume)} change={null} icon={TrendingUp} chip="bg-info-soft text-info-on" loading={o.isLoading} />
        <StatCard label="Total Paid Out" value={usd(d?.payouts.total)} change={null} icon={Wallet} chip="bg-good-soft text-good-on" loading={o.isLoading} />
        <StatCard label="Outstanding Liability" value={usd(d?.outstandingLiability)} change={null} icon={Layers} chip="bg-warn-soft text-warn-on" loading={o.isLoading} />
      </div>

      <div className="mt-3.5">
        <IncomeStreams rows={income.data ?? []} days={days} onDays={setDays} loading={income.isLoading} />
      </div>

      <div className="mt-3.5 grid grid-cols-1 items-start gap-3.5 lg:grid-cols-2">
        <Card>
          <CardHead title="Payouts by stream" />
          <Table head={['Stream', 'Total paid']} empty="No payouts yet."
            rows={(d?.payouts.byCategory ?? []).map((p) => [
              titleCase(p.category),
              <span key="t" className="font-medium tabular-nums">{usd(p.total)}</span>,
            ])} />
        </Card>

        <Card>
          <CardHead title="Cap utilisation" />
          <Table head={['Status', 'Packages', 'Volume', 'Cap limit', 'Earned']} empty="No packages yet."
            rows={(c.data ?? []).map((r) => [
              <Badge key="s" tone={r.status === 'ACTIVE' ? 'good' : 'warn'}>{r.status}</Badge>,
              <span key="n" className="tabular-nums">{num(r.count)}</span>,
              <span key="v" className="tabular-nums">{usd(r.volume)}</span>,
              <span key="c" className="tabular-nums text-ink-2">{usd(r.capLimit)}</span>,
              <span key="e" className="tabular-nums text-good">{usd(r.earned)}</span>,
            ])} />
        </Card>
      </div>

      {/* Solvency first among the new blocks: it is the number an operator
          needs before approving anything large. */}
      <Card className="mt-3.5">
        <CardHead
          title="Position"
          subtitle="What members hold, what is queued to leave, and what active packages could still earn."
        />
        <div className="grid gap-px overflow-hidden border-t border-line bg-line sm:grid-cols-4">
          {[
            { k: 'Member balances', v: usd(Number(sv?.memberBalances ?? 0)), hint: 'Owed on demand' },
            { k: 'Payouts queued', v: usd(Number(sv?.pendingPayouts.amount ?? 0)), hint: `${sv?.pendingPayouts.count ?? 0} awaiting approval` },
            { k: 'Still to earn', v: usd(Number(sv?.futureObligation.remaining ?? 0)), hint: 'If every package runs to its ceiling' },
            { k: 'Already paid', v: usd(Number(sv?.futureObligation.paidSoFar ?? 0)), hint: 'Against active packages' },
          ].map((c) => (
            <div key={c.k} className="bg-card px-4 py-3.5">
              <p className="text-[10.5px] uppercase tracking-[0.04em] text-ink-3">{c.k}</p>
              <p className="mt-1 text-[18px] font-semibold tabular-nums text-ink">{c.v}</p>
              <p className="mt-0.5 text-[11px] text-ink-3">{c.hint}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-3.5">
        <CardHead
          title="Plan economics"
          subtitle="What each tier took in, what it has paid out, and what it still owes."
        />
        <Table
          head={['Plan', 'Price', 'Sold', 'Matured', 'Taken in', 'Paid out', 'Payout ratio', 'Still owed']}
          empty="No packages sold yet."
          rows={(plans.data ?? []).map((p) => [
            <span key="n" className="font-medium">{p.name}</span>,
            <span key="p" className="tabular-nums text-ink-2">{usd(Number(p.price))}</span>,
            <span key="s" className="tabular-nums">{num(p.sold)}</span>,
            <span key="m" className="tabular-nums text-ink-2">{num(p.matured)}</span>,
            <span key="t" className="tabular-nums">{usd(Number(p.takenIn))}</span>,
            <span key="o" className="tabular-nums text-good">{usd(Number(p.paidOut))}</span>,
            // Above 100% the tier has paid out more than it took — expected late
            // in its life, alarming early.
            <span key="r" className={`tabular-nums ${p.payoutRatioPercent > 100 ? 'text-warn' : 'text-ink-2'}`}>
              {p.payoutRatioPercent}%
            </span>,
            <span key="l" className="tabular-nums text-warn">{usd(Number(p.remainingLiability))}</span>,
          ])}
        />
      </Card>

      <Card className="mt-3.5">
        <CardHead
          title="Cohorts"
          subtitle="Members grouped by the month they joined. Totals can look healthy while every cohort collapses."
        />
        <Table
          head={['Joined', 'Members', 'Invested', 'Conversion', 'Still active at 1m', 'at 3m', 'at 6m']}
          empty="No members yet."
          rows={(cohorts.data ?? []).map((c) => [
            <span key="m" className="font-medium">{c.month}</span>,
            <span key="j" className="tabular-nums">{num(c.joined)}</span>,
            <span key="i" className="tabular-nums text-ink-2">{num(c.invested)}</span>,
            <span key="cv" className="tabular-nums">{c.conversionPercent}%</span>,
            <span key="1" className="tabular-nums text-ink-2">{c.retained.month1Percent}%</span>,
            <span key="3" className="tabular-nums text-ink-2">{c.retained.month3Percent}%</span>,
            <span key="6" className="tabular-nums text-ink-2">{c.retained.month6Percent}%</span>,
          ])}
        />
      </Card>

      <Card className="mt-3.5">
        <CardHead title="Top earners" />
        <Table head={['User', 'Email', 'Invested', 'Earned', 'Rank']} empty="No earnings yet."
          rows={(e.data ?? []).map((x) => [
            <span key="u" className="font-medium">{x.userCode}</span>,
            <span key="m" className="text-ink-2">{x.email}</span>,
            <span key="i" className="tabular-nums">{usd(x.totalInvested)}</span>,
            <span key="e" className="font-medium tabular-nums text-good">{usd(x.totalEarned)}</span>,
            x.rank ?? '—',
          ])} />
      </Card>
    </>
  );
}
