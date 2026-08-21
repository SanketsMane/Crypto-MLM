import { prisma } from '../../../core/db.js';
import { money } from '../../../core/money.js';

/**
 * One aggregate for the admin dashboard, so the page makes a single call.
 * Every figure is derived from the ledger or the domain tables — nothing is
 * invented. Where the platform has no such concept yet (KYC review, live
 * trading) the field is returned as null and the UI renders it as unavailable.
 */

const DAY = 86_400_000;
const INCOME = ['DAILY_ROI', 'DIRECT_BONUS', 'GENERATION_BONUS', 'RANK_BONUS'] as const;

/** Percent change between this 7-day window and the one before it. */
const delta = (now: number, prev: number): number | null => {
  if (prev === 0) return now === 0 ? 0 : null;
  return Number((((now - prev) / prev) * 100).toFixed(1));
};

export interface Kpi { key: string; value: string | number | null; change: number | null; available: boolean }

export async function kpis() {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * DAY);
  const twoWeeks = new Date(now.getTime() - 14 * DAY);

  const [
    users, usersWeek, usersPrev,
    invAll, invWeek, invPrev,
    payAll, payWeek, payPrev,
    activeInv, activeInvPrev,
    commAll, commWeek, commPrev,
    pendingVerify, pendingVerifyPrev,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.user.count({ where: { createdAt: { gte: twoWeeks, lt: weekAgo } } }),

    prisma.investment.aggregate({ _sum: { amount: true } }),
    prisma.investment.aggregate({ where: { createdAt: { gte: weekAgo } }, _sum: { amount: true } }),
    prisma.investment.aggregate({ where: { createdAt: { gte: twoWeeks, lt: weekAgo } }, _sum: { amount: true } }),

    prisma.ledgerEntry.aggregate({ where: { direction: 'CREDIT', category: { in: [...INCOME] } }, _sum: { amount: true } }),
    prisma.ledgerEntry.aggregate({ where: { direction: 'CREDIT', category: { in: [...INCOME] }, createdAt: { gte: weekAgo } }, _sum: { amount: true } }),
    prisma.ledgerEntry.aggregate({ where: { direction: 'CREDIT', category: { in: [...INCOME] }, createdAt: { gte: twoWeeks, lt: weekAgo } }, _sum: { amount: true } }),

    prisma.investment.count({ where: { status: 'ACTIVE' } }),
    prisma.investment.count({ where: { status: 'ACTIVE', createdAt: { lt: weekAgo } } }),

    prisma.commission.aggregate({ _sum: { paidAmount: true } }),
    prisma.commission.aggregate({ where: { createdAt: { gte: weekAgo } }, _sum: { paidAmount: true } }),
    prisma.commission.aggregate({ where: { createdAt: { gte: twoWeeks, lt: weekAgo } }, _sum: { paidAmount: true } }),

    prisma.user.count({ where: { status: 'PENDING' } }),
    prisma.user.count({ where: { status: 'PENDING', createdAt: { lt: weekAgo } } }),
  ]);

  const n = (v: unknown) => Number(v ?? 0);

  return [
    { key: 'totalUsers',       value: users,                                    change: delta(usersWeek, usersPrev),                     available: true },
    { key: 'totalInvestments', value: money(invAll._sum.amount?.toString() ?? 0).toString(), change: delta(n(invWeek._sum.amount), n(invPrev._sum.amount)), available: true },
    { key: 'totalPayouts',     value: money(payAll._sum.amount?.toString() ?? 0).toString(), change: delta(n(payWeek._sum.amount), n(payPrev._sum.amount)), available: true },
    { key: 'activePackages',   value: activeInv,                                change: delta(activeInv, activeInvPrev),                 available: true },
    { key: 'totalCommissions', value: money(commAll._sum.paidAmount?.toString() ?? 0).toString(), change: delta(n(commWeek._sum.paidAmount), n(commPrev._sum.paidAmount)), available: true },
    { key: 'pendingApproval',  value: pendingVerify,                            change: delta(pendingVerify, pendingVerifyPrev),         available: true },
  ] satisfies Kpi[];
}

/** Daily investment volume for the area chart. */
export async function investmentSeries(days = 7) {
  const from = new Date(Date.now() - days * DAY);
  const rows = await prisma.$queryRaw<{ day: Date; total: string }[]>`
    SELECT date_trunc('day', "createdAt") AS day, SUM(amount)::text AS total
      FROM investments WHERE "createdAt" >= ${from}
     GROUP BY 1 ORDER BY 1 ASC`;

  // fill gaps so the chart has a continuous axis
  const map = new Map(rows.map((r) => [r.day.toISOString().slice(0, 10), r.total]));
  const out: { date: string; value: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY).toISOString().slice(0, 10);
    out.push({ date: d, value: Number(map.get(d) ?? 0) });
  }
  return out;
}

/** Live feed built from the events that actually happened. */
export async function activity(take = 6) {
  const [users, investments, ledger, withdrawals] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take, select: { userCode: true, createdAt: true } }),
    prisma.investment.findMany({ orderBy: { createdAt: 'desc' }, take,
      include: { user: { select: { userCode: true } }, package: { select: { name: true } } } }),
    prisma.ledgerEntry.findMany({
      where: { category: { in: ['DIRECT_BONUS', 'GENERATION_BONUS', 'RANK_BONUS', 'DAILY_ROI'] } },
      orderBy: { createdAt: 'desc' }, take, include: { user: { select: { userCode: true } } } }),
    prisma.withdrawal.findMany({ orderBy: { createdAt: 'desc' }, take, include: { user: { select: { userCode: true } } } }),
  ]);

  const feed = [
    ...users.map((u) => ({ type: 'user', title: 'New user registered', subtitle: `User ID: ${u.userCode}`, amount: null as string | null, at: u.createdAt })),
    ...investments.map((i) => ({ type: 'investment', title: 'New investment', subtitle: `Plan: ${i.package.name}`, amount: i.amount.toString(), at: i.createdAt })),
    ...ledger.map((l) => ({ type: l.category === 'DAILY_ROI' ? 'payout' : 'commission',
      title: l.category === 'DAILY_ROI' ? 'Daily return paid' : 'Commission earned',
      subtitle: `User ID: ${l.user.userCode}`, amount: l.amount.toString(), at: l.createdAt })),
    ...withdrawals.map((w) => ({ type: 'withdrawal', title: 'Withdrawal request', subtitle: `User ID: ${w.user.userCode}`, amount: w.amount.toString(), at: w.createdAt })),
  ];

  return feed.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, take);
}

/** Packages ranked by capital raised. */
export async function topPlans(take = 5) {
  const grouped = await prisma.investment.groupBy({
    by: ['packageId'], _sum: { amount: true }, _count: { _all: true },
    orderBy: { _sum: { amount: 'desc' } }, take,
  });
  if (!grouped.length) return [];

  const plans = await prisma.packagePlan.findMany({
    where: { id: { in: grouped.map((g) => g.packageId) } },
    select: { id: true, name: true },
  });
  const byId = new Map(plans.map((p) => [p.id, p.name]));
  const max = Number(grouped[0]?._sum.amount ?? 0) || 1;

  return grouped.map((g, i) => ({
    rank: i + 1,
    name: byId.get(g.packageId) ?? 'Unknown plan',
    total: (g._sum.amount ?? 0).toString(),
    count: g._count._all,
    percent: Math.round((Number(g._sum.amount ?? 0) / max) * 100),
  }));
}

/** Network shape — real counts from the genealogy tree. */
export async function network() {
  const [total, active, roots, volume] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { status: 'ACTIVE' } }),
    prisma.user.count({ where: { sponsorId: null } }),
    prisma.user.aggregate({ _sum: { totalInvested: true } }),
  ]);

  const byDepth = await prisma.$queryRaw<{ depth: number; members: bigint }[]>`
    SELECT depth, COUNT(*)::bigint AS members FROM users
     WHERE depth > 0 GROUP BY depth ORDER BY depth ASC LIMIT 3`;

  return {
    totalMembers: total,
    activeMembers: active,
    totalTeams: roots,
    teamVolume: (volume._sum.totalInvested ?? 0).toString(),
    levels: byDepth.map((r) => ({ level: r.depth, members: Number(r.members) })),
  };
}

/** Portfolio split for the donut — investments by lifecycle state. */
export async function portfolioStats() {
  const rows = await prisma.investment.groupBy({ by: ['status'], _count: { _all: true } });
  const total = rows.reduce((a, r) => a + r._count._all, 0);
  const pick = (s: string) => rows.find((r) => r.status === s)?._count._all ?? 0;

  const segments = [
    { key: 'ACTIVE', label: 'Active packages', count: pick('ACTIVE') },
    { key: 'CAPPED', label: 'Capped out', count: pick('CAPPED') },
    { key: 'COMPLETED', label: 'Completed', count: pick('COMPLETED') },
  ];

  return {
    total,
    segments: segments.map((s) => ({ ...s, percent: total ? Number(((s.count / total) * 100).toFixed(1)) : 0 })),
  };
}

/** Latest money movements for the dashboard table. */
export async function recentTransactions(take = 6) {
  const rows = await prisma.ledgerEntry.findMany({
    orderBy: { createdAt: 'desc' }, take,
    include: { user: { select: { userCode: true } }, wallet: { select: { type: true } } },
  });
  return rows.map((r) => ({
    id: r.id, userCode: r.user.userCode, category: r.category, direction: r.direction,
    amount: r.amount.toString(), wallet: r.wallet.type, status: r.status, createdAt: r.createdAt,
  }));
}

export async function summary() {
  const [k, series, feed, plans, net, portfolio, txns] = await Promise.all([
    kpis(), investmentSeries(7), activity(5), topPlans(5), network(), portfolioStats(), recentTransactions(5),
  ]);
  return { kpis: k, investmentSeries: series, activity: feed, topPlans: plans, network: net, portfolio, recentTransactions: txns };
}
