import { prisma } from '../../core/db.js';
import { getCapState } from '../../core/capping.js';
import { money } from '../../core/money.js';
import { env } from '../../config/env.js';
import { config } from '../../core/runtime-config.js';

/**
 * One aggregate for the member dashboard, so the page opens with a single call.
 * Everything is scoped to the signed-in member — nothing platform-wide leaks.
 */
const DAY = 86_400_000;
const INCOME = ['DAILY_ROI', 'DIRECT_BONUS', 'GENERATION_BONUS', 'RANK_BONUS'] as const;

export async function summary(userId: string, webUrl = env.WEB_URL) {
  const cfg = await config();
  const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);
  const yesterday = new Date(startOfDay.getTime() - DAY);

  const [user, wallets, cap, invRows, byCategory, today, prior, tv, directs, activeDirects, rules, currentRank, nextRank] =
    await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { userCode: true, firstName: true, lastName: true, email: true, walletAddress: true,
                  affiliateMode: true, status: true, totalInvested: true, totalEarned: true, createdAt: true },
      }),
      prisma.walletAccount.findMany({ where: { userId }, orderBy: { type: 'asc' } }),
      getCapState(userId),
      prisma.investment.findMany({ where: { userId }, select: { amount: true, capLimit: true, totalEarned: true, status: true } }),
      prisma.ledgerEntry.groupBy({
        by: ['category'], where: { userId, direction: 'CREDIT', category: { in: [...INCOME] } },
        _sum: { amount: true }, _count: { _all: true },
      }),
      prisma.ledgerEntry.aggregate({ where: { userId, direction: 'CREDIT', category: { in: [...INCOME] }, createdAt: { gte: startOfDay } }, _sum: { amount: true } }),
      prisma.ledgerEntry.aggregate({ where: { userId, direction: 'CREDIT', category: { in: [...INCOME] }, createdAt: { gte: yesterday, lt: startOfDay } }, _sum: { amount: true } }),
      prisma.teamVolume.findUnique({ where: { userId } }),
      prisma.user.count({ where: { sponsorId: userId } }),
      prisma.user.count({ where: { sponsorId: userId, status: 'ACTIVE' } }),
      prisma.commissionRule.findMany({ where: { kind: 'GENERATION', isActive: true }, orderBy: { level: 'asc' } }),
      prisma.user.findUnique({ where: { id: userId }, select: { currentRank: true } }),
      prisma.rankDefinition.findMany({ where: { isActive: true }, orderBy: { level: 'asc' } }),
    ]);

  // how many of the 30 generation levels this member has unlocked
  const teamBusiness = money(tv?.totalTeamBusiness?.toString() ?? 0);
  const unlocked = rules.filter(
    (r) => activeDirects >= r.requiredDirects && teamBusiness.gte(money(r.requiredTeamVolume.toString())),
  ).length;
  const nextLocked = rules.find(
    (r) => activeDirects < r.requiredDirects || teamBusiness.lt(money(r.requiredTeamVolume.toString())),
  );

  const achieved = currentRank?.currentRank;
  const target = nextRank.find((r) => !achieved || r.level > achieved.level);

  const sum = (f: (r: (typeof invRows)[number]) => string) =>
    invRows.reduce((a, r) => a.add(money(f(r))), money(0));

  return {
    profile: {
      userCode: user.userCode,
      name: [user.firstName, user.lastName].filter(Boolean).join(' '),
      email: user.email,
      walletAddress: user.walletAddress,
      affiliateMode: user.affiliateMode,
      status: user.status,
      rank: achieved ? { code: achieved.code, name: achieved.name, level: achieved.level } : null,
      joinedAt: user.createdAt,
      referralLink: `${webUrl}/register?ref=${user.userCode}`,
    },
    wallets: wallets.map((w) => ({
      type: w.type, balance: w.balance.toString(), locked: w.locked.toString(),
      available: money(w.balance.toString()).sub(money(w.locked.toString())).toString(),
    })),
    capping: {
      limit: cap.capLimit.toString(), earned: cap.totalEarned.toString(),
      remaining: cap.remaining.toString(), isCapped: cap.isCapped,
      percent: cap.capLimit.gt(0) ? Number(cap.totalEarned.div(cap.capLimit).mul(100).toFixed(2)) : 0,
      mode: user.affiliateMode,
      ceiling: user.affiliateMode === 'ACTIVE' ? cfg.capActivePercent : cfg.capPassivePercent,
    },
    investments: {
      totalInvested: sum((r) => r.amount.toString()).toString(),
      totalEarned: sum((r) => r.totalEarned.toString()).toString(),
      active: invRows.filter((r) => r.status === 'ACTIVE').length,
      capped: invRows.filter((r) => r.status === 'CAPPED').length,
      count: invRows.length,
    },
    income: {
      total: byCategory.reduce((a, b) => a.add(money(b._sum.amount?.toString() ?? 0)), money(0)).toString(),
      today: (today._sum.amount ?? 0).toString(),
      yesterday: (prior._sum.amount ?? 0).toString(),
      breakdown: byCategory.map((b) => ({
        category: b.category, total: (b._sum.amount ?? 0).toString(), count: b._count._all,
      })),
    },
    team: {
      totalTeamBusiness: tv?.totalTeamBusiness?.toString() ?? '0',
      directBusiness: tv?.directBusiness?.toString() ?? '0',
      powerLegVolume: tv?.powerLegVolume?.toString() ?? '0',
      otherLegsVolume: tv?.otherLegsVolume?.toString() ?? '0',
      teamSize: tv?.teamSize ?? 0,
      directCount: directs,
      activeDirectCount: activeDirects,
    },
    levels: {
      unlocked,
      total: rules.length,
      next: nextLocked
        ? {
            level: nextLocked.level,
            percent: nextLocked.percent.toString(),
            needDirects: Math.max(0, nextLocked.requiredDirects - activeDirects),
            needVolume: money(nextLocked.requiredTeamVolume.toString()).sub(teamBusiness).toString(),
          }
        : null,
    },
    rank: {
      current: achieved ? { code: achieved.code, name: achieved.name, level: achieved.level } : null,
      next: target
        ? {
            code: target.code, name: target.name, level: target.level,
            reward: target.reward.toString(),
            selfCapital: target.selfCapital.toString(),
            teamBusiness: target.teamBusiness.toString(),
            percent: money(target.teamBusiness.toString()).gt(0)
              ? Math.min(100, Number(teamBusiness.div(money(target.teamBusiness.toString())).mul(100).toFixed(1)))
              : 0,
          }
        : null,
    },
  };
}

/** Daily earnings for the member's income sparkline. */
export async function incomeSeries(userId: string, days = 7) {
  const from = new Date(Date.now() - days * DAY);
  const rows = await prisma.$queryRaw<{ day: Date; total: string }[]>`
    SELECT date_trunc('day', "createdAt") AS day, SUM(amount)::text AS total
      FROM ledger_entries
     WHERE "userId" = ${userId} AND direction = 'CREDIT'
       AND category IN ('DAILY_ROI','DIRECT_BONUS','GENERATION_BONUS','RANK_BONUS')
       AND "createdAt" >= ${from}
     GROUP BY 1 ORDER BY 1 ASC`;
  const map = new Map(rows.map((r) => [r.day.toISOString().slice(0, 10), r.total]));
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.now() - (days - 1 - i) * DAY).toISOString().slice(0, 10);
    return { date: d, value: Number(map.get(d) ?? 0) };
  });
}

/** The member's own recent ledger activity. */
export async function activity(userId: string, take = 6) {
  const rows = await prisma.ledgerEntry.findMany({
    where: { userId }, orderBy: { createdAt: 'desc' }, take,
    include: { wallet: { select: { type: true } } },
  });
  return rows.map((r) => ({
    id: r.id, category: r.category, direction: r.direction,
    amount: r.amount.toString(), wallet: r.wallet.type,
    description: r.description, meta: r.meta, createdAt: r.createdAt,
  }));
}


/**
 * All 30 generation levels for this member: the rate each pays, what it takes
 * to unlock, and how many of their downline currently sit at that depth.
 */
export async function levelStatus(userId: string) {
  const [me, rules, activeDirects, tv] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { path: true, depth: true } }),
    prisma.commissionRule.findMany({ where: { kind: 'GENERATION', isActive: true }, orderBy: { level: 'asc' } }),
    prisma.user.count({ where: { sponsorId: userId, status: 'ACTIVE' } }),
    prisma.teamVolume.findUnique({ where: { userId } }),
  ]);

  const prefix = me.path ? `${me.path}.${userId}` : userId;
  const rows = await prisma.$queryRaw<{ depth: number; members: bigint; active: bigint; volume: string }[]>`
    SELECT depth,
           COUNT(*)::bigint AS members,
           COUNT(*) FILTER (WHERE status = 'ACTIVE')::bigint AS active,
           COALESCE(SUM("totalInvested"),0)::text AS volume
      FROM users
     WHERE path = ${prefix} OR path LIKE ${prefix + '.%'}
     GROUP BY depth`;

  const byDepth = new Map(rows.map((r) => [Number(r.depth) - me.depth, r]));
  const teamBusiness = money(tv?.totalTeamBusiness?.toString() ?? 0);

  return rules.map((r) => {
    const stats = byDepth.get(r.level);
    const needDirects = Math.max(0, r.requiredDirects - activeDirects);
    const needVolume = money(r.requiredTeamVolume.toString()).sub(teamBusiness);
    return {
      level: r.level,
      percent: r.percent.toString(),
      requiredDirects: r.requiredDirects,
      requiredTeamVolume: r.requiredTeamVolume.toString(),
      unlocked: needDirects === 0 && needVolume.lte(0),
      needDirects,
      needVolume: needVolume.gt(0) ? needVolume.toString() : '0',
      members: Number(stats?.members ?? 0),
      active: Number(stats?.active ?? 0),
      volume: stats?.volume ?? '0',
    };
  });
}
