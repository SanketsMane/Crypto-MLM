import { prisma } from '../../../core/db.js';
import { money } from '../../../core/money.js';
import { notFound } from '../../../core/errors.js';
import { activeDirectCount, buildPath, getUpline } from '../../../core/tree.js';
import { legVolumes } from '../../team/team.service.js';

/** Cross-user views over the ledger and its derived records. */

export async function transactions(opts: { take: number; skip: number; category?: string; q?: string }) {
  const where = {
    ...(opts.category ? { category: opts.category as never } : {}),
    ...(opts.q ? { user: { userCode: { contains: opts.q.toUpperCase() } } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where, orderBy: { createdAt: 'desc' }, take: opts.take, skip: opts.skip,
      include: { user: { select: { userCode: true, email: true } }, wallet: { select: { type: true } } },
    }),
    prisma.ledgerEntry.count({ where }),
  ]);
  return {
    total,
    rows: rows.map((r) => ({
      id: r.id, userCode: r.user.userCode, email: r.user.email,
      wallet: r.wallet.type, direction: r.direction, category: r.category,
      amount: r.amount.toString(), balanceAfter: r.balanceAfter.toString(),
      reference: r.reference, description: r.description, status: r.status, createdAt: r.createdAt,
    })),
  };
}

export async function commissions(opts: { take: number; skip: number; kind?: string }) {
  const where = opts.kind ? { kind: opts.kind as never } : {};
  const [rows, total, agg] = await Promise.all([
    prisma.commission.findMany({
      where, orderBy: { createdAt: 'desc' }, take: opts.take, skip: opts.skip,
      include: { user: { select: { userCode: true } }, fromUser: { select: { userCode: true } } },
    }),
    prisma.commission.count({ where }),
    prisma.commission.aggregate({ where, _sum: { paidAmount: true, amount: true } }),
  ]);
  return {
    total,
    totalPaid: (agg._sum.paidAmount ?? 0).toString(),
    totalIntended: (agg._sum.amount ?? 0).toString(),
    rows: rows.map((c) => ({
      id: c.id, earner: c.user.userCode, from: c.fromUser.userCode,
      kind: c.kind, level: c.level, percent: c.percent.toString(),
      baseAmount: c.baseAmount.toString(), amount: c.amount.toString(),
      paidAmount: c.paidAmount.toString(), status: c.status, createdAt: c.createdAt,
    })),
  };
}

export async function investments(opts: { take: number; skip: number; status?: string }) {
  const where = opts.status ? { status: opts.status as never } : {};
  const [rows, total, agg] = await Promise.all([
    prisma.investment.findMany({
      where, orderBy: { createdAt: 'desc' }, take: opts.take, skip: opts.skip,
      include: { user: { select: { userCode: true } }, package: { select: { name: true } } },
    }),
    prisma.investment.count({ where }),
    prisma.investment.aggregate({ where, _sum: { amount: true, totalEarned: true, capLimit: true } }),
  ]);
  return {
    total,
    volume: (agg._sum.amount ?? 0).toString(),
    paidOut: (agg._sum.totalEarned ?? 0).toString(),
    liability: money(agg._sum.capLimit?.toString() ?? 0).sub(money(agg._sum.totalEarned?.toString() ?? 0)).toString(),
    rows: rows.map((i) => ({
      id: i.id, userCode: i.user.userCode, plan: i.package.name,
      amount: i.amount.toString(), capLimit: i.capLimit.toString(),
      totalEarned: i.totalEarned.toString(), status: i.status,
      dailyRoiPercent: i.dailyRoiPercent.toString(), startedAt: i.startedAt,
    })),
  };
}

/** Platform-wide wallet position. */
export async function walletSummary() {
  const [byType, deposits, withdrawals] = await Promise.all([
    prisma.walletAccount.groupBy({ by: ['type'], _sum: { balance: true }, _count: { _all: true } }),
    prisma.deposit.aggregate({ where: { status: 'PROCESSED' }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.withdrawal.aggregate({ where: { status: 'PROCESSED' }, _sum: { amount: true, fee: true }, _count: { _all: true } }),
  ]);
  const held = byType.reduce((a, w) => a.add(money(w._sum.balance?.toString() ?? 0)), money(0));
  return {
    heldTotal: held.toString(),
    byWallet: byType.map((w) => ({ type: w.type, balance: (w._sum.balance ?? 0).toString(), accounts: w._count._all })),
    depositsIn: (deposits._sum.amount ?? 0).toString(),
    depositCount: deposits._count._all,
    withdrawalsOut: (withdrawals._sum.amount ?? 0).toString(),
    withdrawalCount: withdrawals._count._all,
    feesCollected: (withdrawals._sum.fee ?? 0).toString(),
  };
}

/** Level-by-level network breakdown. */
export async function networkLevels() {
  const rows = await prisma.$queryRaw<{ depth: number; members: bigint; volume: string; active: bigint }[]>`
    SELECT depth,
           COUNT(*)::bigint AS members,
           COALESCE(SUM("totalInvested"),0)::text AS volume,
           COUNT(*) FILTER (WHERE status = 'ACTIVE')::bigint AS active
      FROM users WHERE depth > 0
     GROUP BY depth ORDER BY depth ASC LIMIT 30`;
  return rows.map((r) => ({
    level: r.depth, members: Number(r.members), active: Number(r.active), volume: r.volume,
  }));
}

/* ── genealogy ──────────────────────────────────────────────────────────
   The console could only ever show the network as a level histogram. An
   operator answering "why has this member not been paid" needs the actual
   shape around one person: who sponsored them, who sits underneath, and
   where the volume is concentrated.                                      */

export interface TreeNode {
  id: string; userCode: string; name: string; status: string;
  depth: number; relativeLevel: number;
  totalInvested: string; directCount: number;
  joinedAt: Date;
  children: TreeNode[];
}

/** Hard ceiling on one expansion, so a wide network cannot stall the API. */
const MAX_NODES = 400;

export async function genealogy(opts: { userCode?: string; userId?: string; depth: number }) {
  const where = opts.userId ? { id: opts.userId } : { userCode: (opts.userCode ?? '').toUpperCase() };
  const root = await prisma.user.findFirst({
    where,
    select: {
      id: true, userCode: true, firstName: true, lastName: true, status: true,
      depth: true, path: true, totalInvested: true, directCount: true,
      createdAt: true,
      teamVolume: { select: { totalTeamBusiness: true, teamSize: true, powerLegVolume: true } },
      sponsor: { select: { userCode: true } },
    },
  });
  if (!root) throw notFound('Member not found');

  const depth = Math.min(Math.max(opts.depth, 1), 5);
  const prefix = buildPath(root.path, root.id);

  /* Live, not the stale column. See core/tree.ts. */
  const rootActiveDirects = await activeDirectCount(root.id);

  const [descendants, total, upline, legs] = await Promise.all([
    prisma.user.findMany({
      where: {
        OR: [{ path: prefix }, { path: { startsWith: `${prefix}.` } }],
        depth: { lte: root.depth + depth },
      },
      select: {
        id: true, userCode: true, firstName: true, lastName: true, status: true,
        depth: true, path: true, totalInvested: true, directCount: true, createdAt: true,
      },
      orderBy: [{ depth: 'asc' }, { createdAt: 'asc' }],
      take: MAX_NODES + 1,
    }),
    // The whole downline, not just the slice being drawn.
    prisma.user.count({
      where: { OR: [{ path: prefix }, { path: { startsWith: `${prefix}.` } }] },
    }),
    getUpline(root.id, 10),
    legVolumes(root.id),
  ]);

  const truncated = descendants.length > MAX_NODES;
  const rows = truncated ? descendants.slice(0, MAX_NODES) : descendants;

  const node = (r: (typeof rows)[number]): TreeNode => ({
    id: r.id, userCode: r.userCode,
    name: [r.firstName, r.lastName].filter(Boolean).join(' '),
    status: r.status, depth: r.depth, relativeLevel: r.depth - root.depth,
    totalInvested: r.totalInvested.toString(), directCount: r.directCount,
    joinedAt: r.createdAt, children: [],
  });

  // One pass: every row's parent is the last id in its own path.
  const byId = new Map<string, TreeNode>();
  for (const r of rows) byId.set(r.id, node(r));

  const children: TreeNode[] = [];
  for (const r of rows) {
    const parentId = r.path.split('.').filter(Boolean).pop();
    const self = byId.get(r.id)!;
    if (parentId === root.id) children.push(self);
    else if (parentId && byId.has(parentId)) byId.get(parentId)!.children.push(self);
    // A row whose parent sits outside the fetched slice is unreachable in the
    // drawn tree; it is still counted in `totalDownline`.
  }

  return {
    root: {
      id: root.id, userCode: root.userCode,
      name: [root.firstName, root.lastName].filter(Boolean).join(' '),
      status: root.status, depth: root.depth,
      totalInvested: root.totalInvested.toString(),
      directCount: root.directCount, activeDirectCount: rootActiveDirects,
      joinedAt: root.createdAt,
      sponsorCode: root.sponsor?.userCode ?? null,
      teamBusiness: root.teamVolume?.totalTeamBusiness?.toString() ?? '0',
      teamSize: root.teamVolume?.teamSize ?? 0,
      powerLegVolume: root.teamVolume?.powerLegVolume?.toString() ?? '0',
    },
    /** Sponsor chain, nearest first — level 1 is the direct sponsor. */
    upline: upline.map((a) => ({ userCode: a.userCode, level: a.level, status: a.status })),
    /** Volume per direct leg, so a power leg is visible at a glance. */
    legs: legs.map((l) => ({ userCode: l.userCode ?? '', volume: l.volume.toString(), members: l.members })),
    totalDownline: total,
    shown: rows.length,
    truncated,
    depth,
    children,
  };
}
