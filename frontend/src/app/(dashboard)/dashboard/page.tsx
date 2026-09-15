'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { get } from '@/lib/api';
import { usePlatformConfig } from '@/features/config/use-config';
import { GetTheApp } from '@/components/dashboard/get-the-app';
import { TapeStrip } from '@/components/member/terminal/tape-strip';
import { CapHeadroom } from '@/components/member/terminal/cap-headroom';
import { KpiRail } from '@/components/member/terminal/kpi-rail';
import { AccrualChart, type Point } from '@/components/member/terminal/accrual-chart';
import { BalancesPanel, RankPanel, LedgerTape, type TapeEntry } from '@/components/member/terminal/side-rail';
import { Panel, Label } from '@/components/member/terminal/panel';
import { usd, num } from '@/lib/format';

/**
 * The member terminal.
 *
 * This is a rebuild of the page's STRUCTURE, not a restyle of the old one.
 * What changed and why:
 *
 * - It opens with a live tape (did I earn today, when do I get paid) instead
 *   of a greeting.
 * - Cap headroom leads. It is the hardest limit in the plan — at 250% of
 *   capital every stream stops — and it used to sit two thirds down the page
 *   as a progress bar.
 * - Two columns, not eight equal cards. A wide working column for what the
 *   member came to look at; a narrow standing rail for what they check on the
 *   way past. Eight equal-weight cards told them everything was equally
 *   urgent, which is the same as telling them nothing is.
 * - The chart owns a panel instead of sharing one with four totals.
 * - Recent activity became a ledger tape: one row per entry, amounts in a
 *   column you can read down.
 *
 * `/customer/dashboard` still returns exactly what it did — this rearranges
 * what is already fetched rather than asking the API for anything new.
 */

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

interface Activity {
  id: string; category: string; direction: string; amount: string;
  wallet: string; description: string | null; createdAt: string;
}

const STREAM_LABEL: Record<string, string> = {
  DAILY_TRADE: 'Daily trade', DAILY_ROI: 'Daily trade',
  DIRECT_BONUS: 'Direct sponsor',
  GENERATION: 'Generation', GENERATION_BONUS: 'Generation',
  RANK_REWARD: 'Rank reward', RANK_BONUS: 'Rank reward',
  ROAMING_CLUB: 'Offers',
  DEPOSIT: 'Deposit', WITHDRAWAL: 'Withdrawal', INVESTMENT: 'Package', ADJUSTMENT: 'Adjustment',
  TRANSFER: 'Transfer',
};

export default function MemberTerminal() {
  const [range, setRange] = useState('30');

  const { data, isLoading } = useQuery({
    queryKey: ['member', 'dashboard'],
    queryFn: () => get<Dash>('/customer/dashboard'),
    refetchInterval: 60_000,
  });
  const series = useQuery({
    queryKey: ['member', 'series', range],
    queryFn: () => get<Point[]>('/customer/dashboard/income-series', { days: range }),
  });
  const activity = useQuery({
    queryKey: ['member', 'activity', 'tape'],
    queryFn: () => get<Activity[]>('/customer/dashboard/activity', { take: 12 }),
  });
  const { data: cfg } = usePlatformConfig();

  const noPackages = !isLoading && (data?.investments.count ?? 0) === 0;
  const streamTotal = (k: string) => data?.income.breakdown.find((b) => b.category === k)?.total ?? '0';

  const tape: TapeEntry[] = (activity.data ?? []).map((a) => ({
    id: a.id,
    createdAt: a.createdAt,
    label: a.description ?? STREAM_LABEL[a.category] ?? a.category,
    amount: a.amount,
    direction: a.direction === 'DEBIT' ? 'DEBIT' : 'CREDIT',
    category: a.category,
  }));

  return (
    <>
      <GetTheApp />

      {/* Full-bleed tape: it is chrome for the page, not a panel on it. */}
      <div className="-mx-4 -mt-5 sm:-mx-6 sm:-mt-6">
        <TapeStrip
          today={data?.income.today}
          yesterday={data?.income.yesterday}
          total={data?.income.total}
          nextPayoutDate={cfg?.withdrawal.nextPayoutDate}
          tradingDays={cfg?.returns.tradingDays}
          loading={isLoading}
        />
      </div>

      {/* The one blocker that stops every stream, stated once and loudly. */}
      {noPackages && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[5px] border border-gold-line bg-gold-soft px-3.5 py-3">
          <div className="min-w-0">
            <p className="text-[12.5px] font-semibold text-ink">No active package</p>
            <p className="mt-0.5 text-[11.5px] text-ink-2">
              The daily bonus, sponsor commission and every level below you stay at zero until one is running.
            </p>
          </div>
          <Link href="/packages"
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-[4px] bg-gold px-3.5 text-[11.5px] font-semibold text-gold-on transition-colors hover:bg-gold-hover">
            Choose a plan <ArrowRight size={13} />
          </Link>
        </div>
      )}

      <div className="mt-3 grid grid-cols-1 gap-2.5 xl:grid-cols-[minmax(0,1fr)_312px]">
        {/* ── working column ── */}
        <div className="flex min-w-0 flex-col gap-2.5">
          <CapHeadroom
            capping={data?.capping}
            breakdown={data?.income.breakdown}
            today={data?.income.today}
            loading={isLoading}
          />

          <KpiRail
            invested={data?.investments.totalInvested}
            earned={data?.income.total}
            teamBusiness={data?.team.totalTeamBusiness}
            activePackages={data?.investments.active}
            packageCount={data?.investments.count}
            teamSize={data?.team.teamSize}
            directCount={data?.team.directCount}
            activeDirectCount={data?.team.activeDirectCount}
            powerLeg={data?.team.powerLegVolume}
            otherLegs={data?.team.otherLegsVolume}
            loading={isLoading}
          />

          <AccrualChart
            series={series.data ?? []}
            range={range}
            onRange={setRange}
            loading={isLoading || series.isLoading}
            streams={[
              { label: 'Daily trade', total: streamTotal('DAILY_TRADE'),  color: 'var(--color-chart-1)' },
              { label: 'Direct',      total: streamTotal('DIRECT_BONUS'), color: 'var(--color-chart-2)' },
              { label: 'Generation',  total: streamTotal('GENERATION'),   color: 'var(--color-chart-3)' },
              { label: 'Rank',        total: streamTotal('RANK_REWARD'),  color: 'var(--color-chart-4)' },
            ]}
          />

          <LevelDepth levels={data?.levels} loading={isLoading} />
        </div>

        {/* ── standing rail ── */}
        <aside className="flex min-w-0 flex-col gap-2.5">
          <BalancesPanel wallets={data?.wallets} loading={isLoading} />
          <RankPanel rank={data?.rank} team={data?.team} loading={isLoading} />
          <LedgerTape items={tape} loading={activity.isLoading} />
          <InvitePanel profile={data?.profile} team={data?.team} />
        </aside>
      </div>
    </>
  );
}

/**
 * Thirty levels on one line.
 *
 * The old Level Status card rendered a 10x3 grid of numbered chips, which
 * takes as much space as the chart and answers one question: how deep am I.
 * A single strip answers it at a glance and leaves room to say what the next
 * level actually costs.
 */
function LevelDepth({ levels, loading }: {
  levels?: { unlocked: number; total: number; next: { level: number; percent: string; needDirects: number; needVolume: string } | null };
  loading?: boolean;
}) {
  const total = levels?.total ?? 30;
  const unlocked = levels?.unlocked ?? 0;
  const next = levels?.next;

  return (
    <Panel title="Generation depth" meta={`${unlocked} of ${total} unlocked`}>
      <div className="flex gap-[2px]">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            title={`Level ${i + 1}`}
            className={`h-5 flex-1 rounded-[1px] ${
              loading ? 'bg-line-soft' : i < unlocked ? 'bg-gold' : i === unlocked ? 'bg-line-strong' : 'bg-card-2'
            }`}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between">
        <Label>L1</Label>
        <Label>L{total}</Label>
      </div>

      {next && (
        <p className="mt-2.5 border-t border-line pt-2.5 text-[11.5px] leading-relaxed text-ink-2">
          Level <span className="tabular-nums text-ink">{next.level}</span> needs{' '}
          <span className="tabular-nums text-ink">{num(next.needDirects)}</span> more active direct
          {next.needDirects === 1 ? '' : 's'} and{' '}
          <span className="tabular-nums text-ink">{usd(next.needVolume)}</span> more team volume. It pays{' '}
          <span className="tabular-nums text-ink">{next.percent}%</span> of each member’s daily return.
        </p>
      )}
    </Panel>
  );
}

function InvitePanel({ profile, team }: {
  profile?: { referralLink: string; userCode: string };
  team?: { directCount: number; activeDirectCount: number; directBusiness: string };
}) {
  return (
    <Panel title="Invite" meta={`${num(team?.directCount ?? 0)} directs`}>
      <div className="flex items-center gap-1.5 rounded-[4px] border border-field-line bg-field px-2.5 py-1.5">
        <span className="min-w-0 flex-1 truncate tabular-nums text-[10.5px] text-ink-2">
          {profile?.referralLink ?? '—'}
        </span>
        <button
          type="button"
          onClick={() => profile?.referralLink && void navigator.clipboard?.writeText(profile.referralLink)}
          className="shrink-0 text-[10.5px] font-semibold text-gold hover:text-gold-hi"
        >
          Copy
        </button>
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        <span>
          <Label>Active directs</Label>
          <span className="mt-1 block tabular-nums text-[13px] font-semibold text-ink">
            {num(team?.activeDirectCount ?? 0)}<span className="text-ink-3">/{num(team?.directCount ?? 0)}</span>
          </span>
        </span>
        <span className="text-right">
          <Label>Their capital</Label>
          <span className="mt-1 block tabular-nums text-[13px] font-semibold text-ink">{usd(team?.directBusiness)}</span>
        </span>
      </div>
      <p className="mt-2 text-[10.5px] leading-relaxed text-ink-3">
        Direct sponsor pays 4% · 0.5% · 0.5% across the first three levels.
      </p>
    </Panel>
  );
}
