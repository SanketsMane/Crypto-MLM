import { prisma } from '../../../core/db.js';
import { money } from '../../../core/money.js';

/** Numbers an operator or owner actually asks for. */

/**
 * Reports count real members only.
 *
 * A dry run tags every member it creates with `simulationRunId` and the rest of
 * the platform respects that — modelled members get no notifications, no
 * activity trail, no operator alerts. The reports did not, so a run left
 * un-erased was silently folded into the platform's own figures: with fifty
 * modelled members present this dashboard reported $121,920 of payouts against
 * a real $32,716, and the trial balance agreed with it.
 *
 * Applied at every aggregate rather than filtered afterwards, because a total
 * that is 3x wrong is not a rounding problem — it is a number somebody reports
 * to an investor or a tax authority.
 */
const REAL_USER = { simulationRunId: null } as const;
/** For rows that hang off a user rather than being one. */
const REAL_OWNER = { user: { simulationRunId: null } } as const;

export async function overview() {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [users, activeUsers, newToday, inv, payouts, deposits, withdrawals, monthPayouts] = await Promise.all([
    prisma.user.count({ where: REAL_USER }),
    prisma.user.count({ where: { ...REAL_USER, status: 'ACTIVE' } }),
    prisma.user.count({ where: { ...REAL_USER, createdAt: { gte: today } } }),
    prisma.investment.aggregate({ where: REAL_OWNER, _sum: { amount: true, capLimit: true, totalEarned: true }, _count: { _all: true } }),
    prisma.ledgerEntry.groupBy({
      by: ['category'], where: { ...REAL_OWNER, direction: 'CREDIT', category: { in: ['DAILY_ROI', 'DIRECT_BONUS', 'GENERATION_BONUS', 'RANK_BONUS'] } },
      _sum: { amount: true },
    }),
    prisma.deposit.aggregate({ where: { ...REAL_OWNER, status: 'PROCESSED' }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.withdrawal.aggregate({ where: { ...REAL_OWNER, status: 'PROCESSED' }, _sum: { amount: true, fee: true }, _count: { _all: true } }),
    prisma.ledgerEntry.aggregate({
      where: { ...REAL_OWNER, direction: 'CREDIT', createdAt: { gte: monthStart }, category: { in: ['DAILY_ROI', 'DIRECT_BONUS', 'GENERATION_BONUS', 'RANK_BONUS'] } },
      _sum: { amount: true },
    }),
  ]);

  const invested = money(inv._sum.amount?.toString() ?? 0);
  const liability = money(inv._sum.capLimit?.toString() ?? 0).sub(money(inv._sum.totalEarned?.toString() ?? 0));
  const paidTotal = payouts.reduce((a, p) => a.add(money(p._sum.amount?.toString() ?? 0)), money(0));

  return {
    users: { total: users, active: activeUsers, newToday },
    investments: { count: inv._count._all, volume: invested.toString() },
    payouts: {
      total: paidTotal.toString(),
      thisMonth: (monthPayouts._sum.amount ?? 0).toString(),
      byCategory: payouts.map((p) => ({ category: p.category, total: (p._sum.amount ?? 0).toString() })),
    },
    /// What the platform still owes if every active package runs to its cap.
    outstandingLiability: liability.toString(),
    deposits: { count: deposits._count._all, total: (deposits._sum.amount ?? 0).toString() },
    withdrawals: {
      count: withdrawals._count._all,
      total: (withdrawals._sum.amount ?? 0).toString(),
      feesCollected: (withdrawals._sum.fee ?? 0).toString(),
    },
    netPosition: money(deposits._sum.amount?.toString() ?? 0)
      .sub(money(withdrawals._sum.amount?.toString() ?? 0)).toString(),
  };
}

export async function topEarners(take = 20) {
  const rows = await prisma.user.findMany({
    where: REAL_USER,
    orderBy: { totalEarned: 'desc' }, take,
    select: { userCode: true, email: true, totalInvested: true, totalEarned: true, directCount: true,
              currentRank: { select: { name: true, level: true } } },
  });
  return rows.map((r) => ({
    userCode: r.userCode, email: r.email,
    totalInvested: r.totalInvested.toString(), totalEarned: r.totalEarned.toString(),
    directCount: r.directCount, rank: r.currentRank?.name ?? null, rankLevel: r.currentRank?.level ?? null,
  }));
}

/** Daily income totals for the last N days, for charting. */
export async function incomeSeries(days = 30) {
  const from = new Date(Date.now() - days * 86_400_000);
  const rows = await prisma.$queryRaw<{ day: Date; category: string; total: string }[]>`
    SELECT date_trunc('day', l."createdAt") AS day, l.category::text AS category, SUM(l.amount)::text AS total
      FROM ledger_entries l
      JOIN users u ON u.id = l."userId"
     WHERE l.direction = 'CREDIT'
       AND u."simulationRunId" IS NULL
       AND l."createdAt" >= ${from}
       AND l.category IN ('DAILY_ROI','DIRECT_BONUS','GENERATION_BONUS','RANK_BONUS')
     GROUP BY 1, 2
     ORDER BY 1 ASC`;
  return rows.map((r) => ({ day: r.day, category: r.category, total: r.total }));
}

export async function capUtilisation() {
  const rows = await prisma.investment.groupBy({
    by: ['status'], where: REAL_OWNER, _count: { _all: true },
    _sum: { amount: true, capLimit: true, totalEarned: true },
  });
  return rows.map((r) => ({
    status: r.status, count: r._count._all,
    volume: (r._sum.amount ?? 0).toString(),
    capLimit: (r._sum.capLimit ?? 0).toString(),
    earned: (r._sum.totalEarned ?? 0).toString(),
  }));
}

/**
 * Cohort retention.
 *
 * Groups members by the month they joined and asks how many were still active
 * one, three and six months later. A platform can look healthy on totals while
 * every cohort collapses — the totals only measure how fast new members arrive.
 */
export async function cohorts(months = 12) {
  const since = new Date();
  since.setUTCMonth(since.getUTCMonth() - months);
  since.setUTCDate(1);
  since.setUTCHours(0, 0, 0, 0);

  const rows = await prisma.$queryRaw<{
    cohort: Date; joined: bigint; invested: bigint;
    active_m1: bigint; active_m3: bigint; active_m6: bigint;
    total_invested: string;
  }[]>`
    WITH cohort_members AS (
      SELECT
        date_trunc('month', u."createdAt") AS cohort,
        u.id,
        u."createdAt",
        (SELECT MIN(i."createdAt") FROM investments i WHERE i."userId" = u.id) AS first_investment,
        (SELECT MAX(i."createdAt") FROM investments i WHERE i."userId" = u.id) AS last_investment,
        (SELECT COALESCE(SUM(i.amount), 0) FROM investments i WHERE i."userId" = u.id) AS invested
      FROM users u
      WHERE u."createdAt" >= ${since}
    )
    SELECT
      cohort,
      COUNT(*)::bigint                                                        AS joined,
      COUNT(*) FILTER (WHERE first_investment IS NOT NULL)::bigint            AS invested,
      -- "Still active" means they invested at least that long after joining,
      -- which is the only signal of continued participation the ledger has.
      COUNT(*) FILTER (WHERE last_investment >= "createdAt" + interval '1 month')::bigint AS active_m1,
      COUNT(*) FILTER (WHERE last_investment >= "createdAt" + interval '3 month')::bigint AS active_m3,
      COUNT(*) FILTER (WHERE last_investment >= "createdAt" + interval '6 month')::bigint AS active_m6,
      COALESCE(SUM(invested), 0)::text                                        AS total_invested
    FROM cohort_members
    GROUP BY cohort
    ORDER BY cohort DESC`;

  return rows.map((r) => {
    const joined = Number(r.joined);
    const pct = (n: bigint) => (joined ? Math.round((Number(n) / joined) * 1000) / 10 : 0);
    return {
      month: r.cohort.toISOString().slice(0, 7),
      joined,
      invested: Number(r.invested),
      conversionPercent: pct(r.invested),
      retained: {
        month1: Number(r.active_m1), month1Percent: pct(r.active_m1),
        month3: Number(r.active_m3), month3Percent: pct(r.active_m3),
        month6: Number(r.active_m6), month6Percent: pct(r.active_m6),
      },
      totalInvested: r.total_invested,
    };
  });
}

/**
 * Per-plan economics.
 *
 * Which tiers members actually buy, and what each has paid out against what it
 * took in. Liability is the figure that matters: a tier can look popular while
 * committing the platform to far more than it collected.
 */
export async function planPerformance() {
  const plans = await prisma.packagePlan.findMany({
    orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true, amount: true, capPercent: true, dailyRoiPercent: true, isActive: true },
  });

  const [byPlan, cappedByPlan] = await Promise.all([
    prisma.investment.groupBy({
      by: ['packageId'],
      where: REAL_OWNER,
      _count: true,
      _sum: { amount: true, totalEarned: true },
    }),
    prisma.investment.groupBy({
      by: ['packageId'],
      where: { ...REAL_OWNER, status: 'CAPPED' },
      _count: true,
    }),
  ]);

  const stats = new Map(byPlan.map((p) => [p.packageId, p]));
  const capped = new Map(cappedByPlan.map((p) => [p.packageId, p._count]));

  return plans.map((plan) => {
    const st = stats.get(plan.id);
    const taken = money(st?._sum.amount?.toString() ?? '0');
    const paid = money(st?._sum.totalEarned?.toString() ?? '0');
    // What the platform is still committed to paying on this tier.
    const ceiling = taken.mul(Number(plan.capPercent.toString())).div(100);
    const outstanding = ceiling.sub(paid);

    return {
      id: plan.id,
      name: plan.name,
      price: plan.amount.toString(),
      dailyRoiPercent: plan.dailyRoiPercent.toString(),
      capPercent: plan.capPercent.toString(),
      isActive: plan.isActive,
      sold: st?._count ?? 0,
      matured: capped.get(plan.id) ?? 0,
      takenIn: taken.toString(),
      paidOut: paid.toString(),
      remainingLiability: (outstanding.gt(0) ? outstanding : money(0)).toString(),
      // Above 100% the tier has paid out more than it collected. Expected late
      // in a tier's life; alarming early.
      payoutRatioPercent: taken.gt(0)
        ? Math.round(paid.div(taken).mul(100).toNumber() * 10) / 10
        : 0,
    };
  });
}

/**
 * Where the money physically is, against what is owed.
 *
 * The single number an operator needs before approving a large payout: member
 * balances are a liability, and the treasury is what backs them.
 */
export async function solvency() {
  const [wallets, pendingWithdrawals, liability] = await Promise.all([
    // Modelled wallets are not money the platform owes, and counting them
    // here would tell an operator the treasury covers more than it does —
    // on the one screen read before approving a large payout.
    prisma.walletAccount.groupBy({ by: ['type'], where: REAL_OWNER, _sum: { balance: true } }),
    prisma.withdrawal.aggregate({
      where: { ...REAL_OWNER, status: 'PENDING' },
      _sum: { netAmount: true },
      _count: true,
    }),
    prisma.investment.aggregate({
      where: { ...REAL_OWNER, status: 'ACTIVE' },
      _sum: { capLimit: true, totalEarned: true },
    }),
  ]);

  const held = wallets.reduce((sum, w) => sum.add(money(w._sum.balance?.toString() ?? '0')), money(0));
  const ceiling = money(liability._sum.capLimit?.toString() ?? '0');
  const alreadyPaid = money(liability._sum.totalEarned?.toString() ?? '0');

  return {
    memberBalances: held.toString(),
    byWallet: wallets.map((w) => ({ type: w.type, total: w._sum.balance?.toString() ?? '0' })),
    pendingPayouts: {
      count: pendingWithdrawals._count,
      amount: pendingWithdrawals._sum.netAmount?.toString() ?? '0',
    },
    futureObligation: {
      // What active packages could still earn if every one ran to its ceiling.
      ceiling: ceiling.toString(),
      paidSoFar: alreadyPaid.toString(),
      remaining: ceiling.sub(alreadyPaid).toString(),
    },
  };
}