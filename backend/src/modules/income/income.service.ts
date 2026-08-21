import { prisma } from '../../core/db.js';
import { money } from '../../core/money.js';

const INCOME_CATEGORIES = ['DAILY_ROI', 'DIRECT_BONUS', 'GENERATION_BONUS', 'RANK_BONUS'] as const;

export async function summary(userId: string) {
  const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);
  const yesterday = new Date(startOfDay.getTime() - 86_400_000);

  const [byCategory, today, prior] = await Promise.all([
    prisma.ledgerEntry.groupBy({
      by: ['category'],
      where: { userId, direction: 'CREDIT', category: { in: [...INCOME_CATEGORIES] } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.ledgerEntry.aggregate({
      where: { userId, direction: 'CREDIT', category: { in: [...INCOME_CATEGORIES] }, createdAt: { gte: startOfDay } },
      _sum: { amount: true },
    }),
    prisma.ledgerEntry.aggregate({
      where: {
        userId, direction: 'CREDIT', category: { in: [...INCOME_CATEGORIES] },
        createdAt: { gte: yesterday, lt: startOfDay },
      },
      _sum: { amount: true },
    }),
  ]);

  const total = byCategory.reduce((a, r) => a.add(money(r._sum.amount?.toString() ?? 0)), money(0));

  return {
    totalIncome: total.toString(),
    today: (today._sum.amount ?? 0).toString(),
    yesterday: (prior._sum.amount ?? 0).toString(),
    breakdown: byCategory.map((b) => ({
      category: b.category,
      total: (b._sum.amount ?? 0).toString(),
      count: b._count._all,
    })),
  };
}

export async function statement(userId: string, opts: { take?: number; skip?: number } = {}) {
  const where = { userId, direction: 'CREDIT' as const, category: { in: [...INCOME_CATEGORIES] } };
  const [rows, total] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where, orderBy: { createdAt: 'desc' },
      take: opts.take ?? 50, skip: opts.skip ?? 0,
    }),
    prisma.ledgerEntry.count({ where }),
  ]);

  return {
    total,
    rows: rows.map((r) => ({
      id: r.id, category: r.category, amount: r.amount.toString(),
      description: r.description, meta: r.meta, reference: r.reference, createdAt: r.createdAt,
    })),
  };
}

/**
 * A statement for one period.
 *
 * Different from the ledger listing above it: a statement has an opening
 * balance, a closing balance, and totals that reconcile between them. That is
 * what makes it a document a member can file or hand to an accountant, rather
 * than a screen they scroll.
 *
 * Opening balance is read from the running balance the ledger already records,
 * so it cannot drift from the entries beneath it.
 */
export async function periodStatement(userId: string, from: Date, to: Date) {
  const [user, entries, before] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { userCode: true, email: true, firstName: true, lastName: true, createdAt: true },
    }),
    prisma.ledgerEntry.findMany({
      where: { userId, createdAt: { gte: from, lte: to } },
      orderBy: { createdAt: 'asc' },
      select: {
        reference: true, direction: true, category: true, amount: true,
        balanceAfter: true, description: true, createdAt: true,
        wallet: { select: { type: true } },
      },
    }),
    // The last entry before the window IS the opening balance — derived from
    // the ledger rather than recomputed, so the two can never disagree.
    prisma.ledgerEntry.findFirst({
      where: { userId, createdAt: { lt: from } },
      orderBy: { createdAt: 'desc' },
      select: { balanceAfter: true },
    }),
  ]);

  const byCategory = new Map<string, { credits: string; debits: string; count: number }>();
  let credits = money(0);
  let debits = money(0);

  for (const e of entries) {
    const amount = money(e.amount.toString());
    if (e.direction === 'CREDIT') credits = credits.add(amount);
    else debits = debits.add(amount);

    const row = byCategory.get(e.category) ?? { credits: '0', debits: '0', count: 0 };
    if (e.direction === 'CREDIT') row.credits = money(row.credits).add(amount).toString();
    else row.debits = money(row.debits).add(amount).toString();
    row.count += 1;
    byCategory.set(e.category, row);
  }

  const opening = money(before?.balanceAfter?.toString() ?? '0');
  const closing = entries.length
    ? money(entries.at(-1)!.balanceAfter.toString())
    : opening;

  return {
    member: {
      userCode: user.userCode,
      name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.userCode,
      email: user.email,
      memberSince: user.createdAt,
    },
    period: { from, to },
    opening: opening.toString(),
    closing: closing.toString(),
    totals: {
      credits: credits.toString(),
      debits: debits.toString(),
      net: credits.sub(debits).toString(),
      entries: entries.length,
    },
    byCategory: [...byCategory.entries()].map(([category, v]) => ({ category, ...v })),
    entries: entries.map((e) => ({
      date: e.createdAt,
      reference: e.reference,
      description: e.description,
      category: e.category,
      wallet: e.wallet.type,
      direction: e.direction,
      amount: e.amount.toString(),
      balanceAfter: e.balanceAfter.toString(),
    })),
    generatedAt: new Date(),
  };
}

/**
 * The annual figures a member needs to file.
 *
 * Earnings and withholding for one calendar year, broken down by source. Not a
 * tax document and does not claim to be one — it is the platform's record of
 * what it paid and what it withheld, which is what an accountant actually asks
 * for.
 */
export async function taxSummary(userId: string, year: number) {
  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

  const [user, credits, withdrawals] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { userCode: true, email: true, firstName: true, lastName: true },
    }),
    // Everything paid TO the member in the year, by source.
    prisma.ledgerEntry.groupBy({
      by: ['category'],
      where: {
        userId,
        direction: 'CREDIT',
        createdAt: { gte: from, lte: to },
        category: { in: ['DAILY_ROI', 'DIRECT_BONUS', 'GENERATION_BONUS', 'RANK_BONUS', 'ROAMING_CLUB'] },
      },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.withdrawal.aggregate({
      where: { userId, status: 'PROCESSED', processedAt: { gte: from, lte: to } },
      _sum: { amount: true, fee: true, tax: true, netAmount: true },
      _count: true,
    }),
  ]);

  const earnings = credits.map((c) => ({
    source: c.category,
    amount: c._sum.amount?.toString() ?? '0',
    count: c._count,
  }));

  const totalEarned = earnings.reduce((sum, e) => sum.add(money(e.amount)), money(0));

  return {
    member: {
      userCode: user.userCode,
      name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.userCode,
      email: user.email,
    },
    year,
    earnings,
    totalEarned: totalEarned.toString(),
    withdrawals: {
      count: withdrawals._count,
      gross: withdrawals._sum.amount?.toString() ?? '0',
      fees: withdrawals._sum.fee?.toString() ?? '0',
      taxWithheld: withdrawals._sum.tax?.toString() ?? '0',
      received: withdrawals._sum.netAmount?.toString() ?? '0',
    },
    notice:
      'This is the platform\'s record of what it paid you and what it withheld during the year. It is not a tax return and does not constitute tax advice — how these figures are treated depends on where you live.',
    generatedAt: new Date(),
  };
}