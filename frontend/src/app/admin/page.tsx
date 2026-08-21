'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, Banknote, LineChart, Percent, TrendingUp, Users } from 'lucide-react';
import { adminGet } from '@/lib/admin-api';
import { useGreeting } from '@/lib/greeting';
import { PageHeader } from '@/components/ui/primitives';
import { StatCard } from '@/components/dashboard/stat-card';
import { InvestmentOverview, type SeriesPoint } from '@/components/dashboard/investment-overview';
import { PlatformActivity, type ActivityItem } from '@/components/dashboard/platform-activity';
import { NetworkOverview, type NetworkData } from '@/components/dashboard/network-overview';
import { PortfolioStats, type Segment } from '@/components/dashboard/portfolio-stats';
import { RecentTransactions, type TxnRow } from '@/components/dashboard/recent-transactions';
import { QuickActions } from '@/components/dashboard/quick-actions';
import { GrowNetworkCard } from '@/components/dashboard/promo-card';
import { QueueHealth, type Queues } from '@/components/dashboard/queue-health';
import { DateRangeControl } from '@/components/dashboard/date-range';
import { num, usdWhole } from '@/lib/format';

interface Kpi { key: string; value: string | number | null; change: number | null; available: boolean }
interface Dashboard {
  kpis: Kpi[];
  investmentSeries: SeriesPoint[];
  activity: ActivityItem[];
  network: NetworkData;
  portfolio: { total: number; segments: Segment[] };
  recentTransactions: TxnRow[];
}

/** Presentation for each KPI, keyed to what the API returns. */
const TILES = [
  { key: 'totalUsers',       label: 'Total Users',       icon: Users,      chip: 'bg-violet-soft text-violet-on', money: false },
  { key: 'totalInvestments', label: 'Total Investments', icon: TrendingUp, chip: 'bg-good-soft text-good-on', money: true },
  { key: 'totalPayouts',     label: 'Total Payouts',     icon: Banknote,   chip: 'bg-info-soft text-info-on', money: true },
  { key: 'activePackages',   label: 'Active Packages',   icon: LineChart,  chip: 'bg-gold-soft text-gold-on-soft', money: false },
  { key: 'totalCommissions', label: 'Total Commissions', icon: Percent,    chip: 'bg-violet-bg text-violet', money: true },
  { key: 'pendingApproval',  label: 'Pending Approval',  icon: BadgeCheck, chip: 'bg-warn-soft text-warn-on', money: false, invert: true },
] as const;

export default function DashboardPage() {
  const [days, setDays] = useState('7');
  const greeting = useGreeting();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: () => adminGet<Dashboard>('/admin/dashboard'),
    refetchInterval: 60_000,
  });

  const series = useQuery({
    queryKey: ['admin', 'series', days],
    queryFn: () => adminGet<SeriesPoint[]>('/admin/dashboard/investment-series', { days }),
    enabled: days !== '7',
  });

  /* queue health polls a little faster than the rest — it is the figure an
     operator is watching when something is going wrong */
  const queues = useQuery({
    queryKey: ['admin', 'queues'],
    queryFn: () => adminGet<Queues>('/admin/queues'),
    refetchInterval: 30_000,
  });

  const kpi = (k: string) => data?.kpis.find((x) => x.key === k);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`${greeting}, Admin! Here's what's happening with your platform.`}
        action={<DateRangeControl days={Number(days)} onDays={(d) => setDays(String(d))} />}
      />

      {/* KPI row — 1 / 2 / 3 / 6 across the breakpoints */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 xl:gap-3.5">
        {TILES.map((t) => {
          const k = kpi(t.key);
          const raw = k?.value ?? 0;
          return (
            <StatCard
              key={t.key}
              label={t.label}
              value={t.money ? usdWhole(raw as string) : num(raw as number)}
              change={k?.change ?? null}
              icon={t.icon}
              chip={t.chip}
              invert={'invert' in t ? t.invert : false}
              loading={isLoading}
            />
          );
        })}
      </div>

      {/* chart + activity + plans
          md: chart full, activity|plans paired · lg: chart|activity, plans full · xl: 5|4|3 */}
      <div className="mt-3.5 grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:grid-cols-12">
        <div className="md:col-span-2 lg:col-span-7 xl:col-span-5">
          <InvestmentOverview
            data={days === '7' ? (data?.investmentSeries ?? []) : (series.data ?? [])}
            range={days} onRange={setDays} loading={isLoading || series.isLoading} />
        </div>
        <div className="lg:col-span-5 xl:col-span-4">
          <PlatformActivity items={data?.activity ?? []} loading={isLoading} />
        </div>
        <div className="flex flex-col gap-3.5 lg:col-span-12 xl:col-span-3">
          <QueueHealth data={queues.data} loading={queues.isLoading} />
          <QuickActions className="h-full" />
        </div>
      </div>

      {/* network + portfolio/transactions + actions */}
      <div className="mt-3.5 grid grid-cols-1 items-start gap-3.5 md:grid-cols-2 lg:grid-cols-12">
        <div className="md:col-span-2 lg:col-span-6 xl:col-span-4">
          <NetworkOverview data={data?.network} rootCode="FX100001" loading={isLoading} />
        </div>

        <div className="flex flex-col gap-3.5 md:col-span-2 lg:col-span-6 xl:col-span-5">
          <PortfolioStats total={data?.portfolio.total ?? 0} segments={data?.portfolio.segments ?? []} loading={isLoading} />
          <RecentTransactions rows={data?.recentTransactions ?? []} loading={isLoading} />
        </div>

        <div className="self-start md:col-span-2 lg:col-span-12 xl:col-span-3">
          <GrowNetworkCard />
        </div>
      </div>
    </>
  );
}
