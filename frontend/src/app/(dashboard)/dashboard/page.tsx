'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Layers, Package, TrendingUp, Users } from 'lucide-react';
import { get } from '@/lib/api';
import { WelcomeHeader } from '@/components/dashboard/welcome-header';
import { GetTheApp } from '@/components/dashboard/get-the-app';
import { MemberSummary } from '@/components/dashboard/member-summary';
import { BalancePanel } from '@/components/dashboard/balance-panel';
import { NoPackageCta } from '@/components/dashboard/no-package-cta';
import { MetricCard } from '@/components/dashboard/metric-card';
import { CappingTracker } from '@/components/member/cards/capping-tracker';
import { LevelProgress } from '@/components/member/cards/level-progress';
import { IncomeBreakdown } from '@/components/member/cards/income-breakdown';
import { RankProgress } from '@/components/member/cards/rank-progress';
import { ReferralPanel } from '@/components/member/cards/referral-panel';
import { ActivityFeed, type Entry } from '@/components/member/cards/activity-feed';
import { usdWhole, num } from '@/lib/format';

interface Dash {
  profile: { name: string; userCode: string; walletAddress: string | null; referralLink: string; joinedAt: string; rank: { name: string; level: number } | null };
  wallets: { type: string; balance: string; available: string }[];
  capping: { limit: string; earned: string; remaining: string; isCapped: boolean; percent: number; ceiling: number; mode: string };
  investments: { totalInvested: string; totalEarned: string; active: number; capped: number; count: number };
  income: { total: string; today: string; yesterday: string; breakdown: { category: string; total: string; count: number }[] };
  team: { totalTeamBusiness: string; directBusiness: string; powerLegVolume: string; otherLegsVolume: string; teamSize: number; directCount: number; activeDirectCount: number };
  levels: { unlocked: number; total: number; next: { level: number; percent: string; needDirects: number; needVolume: string } | null };
  rank: { current: { name: string; level: number } | null; next: { name: string; level: number; reward: string; selfCapital: string; teamBusiness: string; percent: number } | null };
}

export default function MemberDashboard() {
  const [range, setRange] = useState('7');

  const { data, isLoading } = useQuery({
    queryKey: ['member', 'dashboard'],
    queryFn: () => get<Dash>('/customer/dashboard'),
    refetchInterval: 60_000,
  });
  const series = useQuery({
    queryKey: ['member', 'series', range],
    queryFn: () => get<{ date: string; value: number }[]>('/customer/dashboard/income-series', { days: range }),
  });
  const activity = useQuery({
    queryKey: ['member', 'activity'],
    queryFn: () => get<Entry[]>('/customer/dashboard/activity', { take: 6 }),
  });
  /* Sponsor is the only field on the summary card the dashboard aggregate does
     not return. Same query key as /profile, so the two screens share one cache
     entry rather than each fetching their own. */
  const profile = useQuery({
    queryKey: ['member', 'profile'],
    queryFn: () => get<{ sponsor: { userCode: string } | null }>('/customer/profile'),
  });

  const main = data?.wallets.find((w) => w.type === 'MAIN')?.balance;
  const noPackages = !isLoading && (data?.investments.count ?? 0) === 0;

  return (
    <>
      <WelcomeHeader firstName={data?.profile.name?.split(' ')[0]} />

      {/* Sits directly under the greeting: seen on arrival, above the fold,
          and dismissible so it never becomes furniture. */}
      <GetTheApp />

      {/* Account overview. The wallet is the hero and sizes to its own
          content, so the identity card and the onboarding step share the left
          column rather than one being stretched to the other's height. */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <MemberSummary
            profile={data?.profile}
            invested={data?.investments.totalInvested}
            earned={data?.income.total}
            sponsor={profile.data?.sponsor?.userCode ?? (profile.isSuccess ? 'Root account' : undefined)}
            joinedAt={data?.profile.joinedAt}
          />
          {noPackages && <NoPackageCta />}
        </div>
        <BalancePanel
          main={main}
          walletAddress={data?.profile.walletAddress}
          todayIncome={data?.income.today}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 min-[360px]:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total Invested" value={usdWhole(data?.investments.totalInvested)}
                    icon={Package} accent="violet" loading={isLoading} />
        <MetricCard label="Total Earned" value={usdWhole(data?.income.total)}
                    icon={TrendingUp} accent="good" loading={isLoading} />
        <MetricCard label="Team Business" value={usdWhole(data?.team.totalTeamBusiness)}
                    icon={Users} accent="info" loading={isLoading} />
        <MetricCard label="Active Packages" value={num(data?.investments.active)}
                    icon={Layers} accent="warn" loading={isLoading} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7 xl:col-span-8">
          <IncomeBreakdown income={data?.income} series={series.data ?? []} range={range}
                           onRange={setRange} loading={isLoading || series.isLoading} />
        </div>
        <div className="lg:col-span-5 xl:col-span-4">
          <CappingTracker capping={data?.capping} />
        </div>
      </div>

      {/* Four equal cards. No `items-start` and no span on the last one: the
          first left a ragged row, the second punched a hole beside the
          referral panel in the two-column layout. */}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <RankProgress rank={data?.rank} team={data?.team} />
        <LevelProgress levels={data?.levels} />
        <ReferralPanel profile={data?.profile} team={data?.team} className="dash-card" />
        <ActivityFeed items={activity.data ?? []} loading={activity.isLoading} />
      </div>
    </>
  );
}
