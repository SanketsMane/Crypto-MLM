import { prisma, type Tx } from '../../core/db.js';
import { buildPath, getDownline, getLevel } from '../../core/tree.js';
import { notFound } from '../../core/errors.js';
import { money, toDb, type Money } from '../../core/money.js';

/**
 * Team volume rollup.
 *
 * The rank ladder counts team business 50:50 — at most half may come from the
 * strongest ("power") leg, and at least half from all remaining legs combined
 * (FortuneX p15). That means we cannot keep a single team total; we need the
 * volume of each direct leg so the strongest can be identified.
 */

export interface LegVolume {
  directId: string;
  userCode: string;
  volume: Money;
  members: number;
}

/** Volume under each direct referral, including the direct's own investment. */
export async function legVolumes(userId: string, db: Tx = prisma): Promise<LegVolume[]> {
  const directs = await db.user.findMany({
    where: { sponsorId: userId },
    select: { id: true, userCode: true, path: true, totalInvested: true },
  });

  const legs: LegVolume[] = [];
  for (const d of directs) {
    const prefix = buildPath(d.path, d.id);
    const agg = await db.user.aggregate({
      where: { OR: [{ path: prefix }, { path: { startsWith: `${prefix}.` } }] },
      _sum: { totalInvested: true },
      _count: { _all: true },
    });

    legs.push({
      directId: d.id,
      userCode: d.userCode,
      volume: money(d.totalInvested.toString()).add(money(agg._sum.totalInvested?.toString() ?? 0)),
      members: (agg._count._all ?? 0) + 1,
    });
  }
  return legs.sort((a, b) => b.volume.comparedTo(a.volume));
}

/** Recompute and persist a user's team statistics. */
export async function recalculate(userId: string, db: Tx = prisma) {
  const legs = await legVolumes(userId, db);

  const total = legs.reduce((a, l) => a.add(l.volume), money(0));
  const powerLeg = legs[0]?.volume ?? money(0);
  const otherLegs = total.sub(powerLeg);
  const teamSize = legs.reduce((a, l) => a + l.members, 0);

  const directBusinessAgg = await db.user.aggregate({
    where: { sponsorId: userId },
    _sum: { totalInvested: true },
  });

  const data = {
    directBusiness: toDb(money(directBusinessAgg._sum.totalInvested?.toString() ?? 0)),
    totalTeamBusiness: toDb(total),
    powerLegVolume: toDb(powerLeg),
    otherLegsVolume: toDb(otherLegs),
    teamSize,
    recalculatedAt: new Date(),
  };

  return db.teamVolume.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
}

/**
 * Propagate an investment up the tree. Called once when a package is bought.
 * Cheaper than recomputing whole legs, and keeps rank evaluation responsive.
 */
export async function propagateInvestment(db: Tx, buyerId: string, amount: Money) {
  const user = await db.user.findUnique({ where: { id: buyerId }, select: { path: true } });
  if (!user?.path) return;

  const ancestors = user.path.split('.').filter(Boolean);
  if (ancestors.length === 0) return;

  /**
   * Totals move atomically, and the rows are locked in a fixed order.
   *
   * This used to be a bare `WHERE "userId" = ANY(...)`. Postgres is free to
   * lock the matched rows in whatever order the plan yields, so two members
   * buying at the same time anywhere in overlapping branches could take the
   * same two ancestors in opposite orders and deadlock. Under load that is not
   * rare: forty concurrent purchases produced thirty-four `40P01` failures,
   * every one of them a member seeing "something went wrong" on a payment that
   * had already left their wallet.
   *
   * Selecting `FOR UPDATE` with an `ORDER BY` first means every transaction
   * acquires these locks in ascending id order, so no cycle can form.
   */
  await db.$executeRaw`
    UPDATE team_volumes
       SET "totalTeamBusiness" = "totalTeamBusiness" + ${toDb(amount)}::numeric,
           "updatedAt" = now()
     WHERE "userId" IN (
       SELECT "userId" FROM team_volumes
        WHERE "userId" = ANY(${ancestors}::text[])
        ORDER BY "userId"
        FOR UPDATE
     )`;

  const sponsorId = ancestors[ancestors.length - 1];
  if (sponsorId) {
    await db.$executeRaw`
      UPDATE team_volumes
         SET "directBusiness" = "directBusiness" + ${toDb(amount)}::numeric
       WHERE "userId" = ${sponsorId}`;
  }
}

export async function summary(userId: string) {
  const [tv, directs, legs] = await Promise.all([
    prisma.teamVolume.findUnique({ where: { userId } }),
    prisma.user.count({ where: { sponsorId: userId } }),
    legVolumes(userId),
  ]);

  return {
    totalTeamBusiness: tv?.totalTeamBusiness ?? '0',
    directBusiness: tv?.directBusiness ?? '0',
    powerLegVolume: tv?.powerLegVolume ?? '0',
    otherLegsVolume: tv?.otherLegsVolume ?? '0',
    teamSize: tv?.teamSize ?? 0,
    directCount: directs,
    legs: legs.map((l) => ({ ...l, volume: l.volume.toString() })),
  };
}

export { getDownline, getLevel };

/**
 * The downline as a tree, rooted at the member themselves.
 *
 * Returned flat with `sponsorId` on every node rather than nested: the client
 * assembles it in one pass, and a flat array survives JSON size limits far
 * better than deep nesting on a wide network.
 */
export async function genealogy(userId: string, depth: number | null) {
  const [root, rows] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, userCode: true, firstName: true, lastName: true, status: true,
        depth: true, totalInvested: true, createdAt: true, sponsorId: true, directCount: true,
      },
    }),
    getDownline(userId, depth),
  ]);
  if (!root) throw notFound('User not found');

  const baseDepth = root.depth;
  const node = (u: {
    id: string; userCode: string; firstName: string; lastName: string | null;
    status: string; depth: number; totalInvested: unknown; createdAt: Date;
    sponsorId: string | null; directCount: number;
  }, isRoot: boolean) => ({
    id: u.id,
    userCode: u.userCode,
    name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.userCode,
    status: u.status,
    // Relative to the viewer, so their own directs read as level 1 whatever
    // their absolute position in the global tree.
    level: u.depth - baseDepth,
    parentId: isRoot ? null : u.sponsorId,
    invested: String(u.totalInvested),
    directs: u.directCount,
    joinedAt: u.createdAt,
  });

  const nodes = [node(root, true), ...rows.filter((r) => r.id !== root.id).map((r) => node(r, false))];

  return {
    rootId: root.id,
    total: nodes.length - 1,
    maxLevel: nodes.reduce((m, n) => Math.max(m, n.level), 0),
    nodes,
  };
}

/**
 * Every package bought anywhere in the downline.
 *
 * Team volume answers "how much" — this answers "who, and when". A member
 * watching their network grow wants the second question, and an aggregate
 * cannot give it to them.
 *
 * Resolved from the materialised path, so thirty levels costs the same as one.
 */
export async function teamPackages(userId: string, opts: {
  level?: number; take?: number; skip?: number;
} = {}) {
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { depth: true } });
  if (!me) throw notFound('User not found');

  const downline = await getDownline(userId, 30);
  const ids = downline.filter((d) => d.id !== userId).map((d) => d.id);
  if (!ids.length) {
    return { total: 0, totalValue: '0', activeCount: 0, rows: [] };
  }

  const depthById = new Map(downline.map((d) => [d.id, d.depth - me.depth]));
  const inScope = opts.level
    ? ids.filter((id) => depthById.get(id) === opts.level)
    : ids;

  if (!inScope.length) return { total: 0, totalValue: '0', activeCount: 0, rows: [] };

  const take = Math.min(Math.max(opts.take ?? 50, 1), 200);

  const [rows, total, totals, active] = await Promise.all([
    prisma.investment.findMany({
      where: { userId: { in: inScope } },
      orderBy: { createdAt: 'desc' },
      take,
      skip: Math.max(opts.skip ?? 0, 0),
      select: {
        id: true, amount: true, status: true, createdAt: true, totalEarned: true,
        package: { select: { name: true } },
        user: {
          select: {
            id: true, userCode: true, firstName: true, lastName: true,
            sponsor: { select: { userCode: true, firstName: true, lastName: true } },
          },
        },
      },
    }),
    prisma.investment.count({ where: { userId: { in: inScope } } }),
    prisma.investment.aggregate({ where: { userId: { in: inScope } }, _sum: { amount: true } }),
    prisma.investment.count({ where: { userId: { in: inScope }, status: 'ACTIVE' } }),
  ]);

  const name = (f?: string, l?: string | null, code?: string) =>
    [f, l].filter(Boolean).join(' ') || code || '—';

  return {
    total,
    totalValue: totals._sum.amount?.toString() ?? '0',
    activeCount: active,
    rows: rows.map((r) => ({
      id: r.id,
      level: depthById.get(r.user.id) ?? 0,
      userCode: r.user.userCode,
      name: name(r.user.firstName, r.user.lastName, r.user.userCode),
      sponsorCode: r.user.sponsor?.userCode ?? '—',
      sponsorName: name(r.user.sponsor?.firstName, r.user.sponsor?.lastName, r.user.sponsor?.userCode),
      packageName: r.package.name,
      amount: r.amount.toString(),
      earned: r.totalEarned.toString(),
      status: r.status,
      purchasedAt: r.createdAt,
    })),
  };
}