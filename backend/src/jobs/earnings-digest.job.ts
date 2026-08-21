import { prisma } from '../core/db.js';
import { logger } from '../core/logger.js';
import { money } from '../core/money.js';
import { deliverMember } from '../core/notify.js';

/**
 * One earnings notification per member per day.
 *
 * The alternative is what a naive implementation does: the ROI job pays every
 * active investment and walks thirty generation levels, so a member with a
 * modest downline could collect fifty notifications in a night, most of them
 * for a few cents. That is not a notification system, it is a way of teaching
 * people to ignore the bell — and the bell is also where "your payout address
 * changed" appears.
 *
 * So daily returns and generation bonuses are summarised. Direct sponsor
 * bonuses are notified individually, because they are infrequent and a member
 * genuinely wants to know the moment someone they referred invests.
 *
 * Runs after the ROI job. Idempotent by (member, date).
 */

export interface DigestResult {
  date: string;
  members: number;
  notified: number;
  capped: number;
}

export async function sendEarningsDigest(forDate = new Date()): Promise<DigestResult> {
  const date = new Date(Date.UTC(forDate.getUTCFullYear(), forDate.getUTCMonth(), forDate.getUTCDate()));
  const iso = date.toISOString().slice(0, 10);
  const dayEnd = new Date(date.getTime() + 86_400_000);

  const [roi, generation] = await Promise.all([
    prisma.roiAccrual.groupBy({
      by: ['userId'],
      where: { accrualDate: date, paidAmount: { gt: 0 } },
      _sum: { paidAmount: true },
      _count: true,
    }),
    prisma.commission.groupBy({
      by: ['userId'],
      where: { kind: 'GENERATION', createdAt: { gte: date, lt: dayEnd }, paidAmount: { gt: 0 } },
      _sum: { paidAmount: true },
      _count: true,
    }),
  ]);

  // Merge both streams per member, so one line covers the whole day.
  const totals = new Map<string, { roi: string; roiCount: number; gen: string; genCount: number }>();
  for (const r of roi) {
    totals.set(r.userId, {
      roi: r._sum.paidAmount?.toString() ?? '0', roiCount: r._count,
      gen: '0', genCount: 0,
    });
  }
  for (const g of generation) {
    const existing = totals.get(g.userId) ?? { roi: '0', roiCount: 0, gen: '0', genCount: 0 };
    existing.gen = g._sum.paidAmount?.toString() ?? '0';
    existing.genCount = g._count;
    totals.set(g.userId, existing);
  }

  let notified = 0;
  for (const [userId, t] of totals) {
    const total = money(t.roi).add(money(t.gen));
    if (total.lte(0)) continue;

    const parts: string[] = [];
    if (money(t.roi).gt(0)) parts.push(`$${t.roi} in daily returns`);
    if (money(t.gen).gt(0)) {
      parts.push(`$${t.gen} from ${t.genCount} team level${t.genCount === 1 ? '' : 's'}`);
    }

    const sent = await deliverMember({
      userId,
      type: 'earnings.daily',
      // One per member per day, whatever happens to the job.
      dedupeKey: `digest:${userId}:${iso}`,
      title: `You earned $${total.toString()} today`,
      body: parts.join(' and ') + '.',
      meta: { date: iso, roi: t.roi, generation: t.gen, levels: t.genCount },
    }).catch((err: unknown) => {
      logger.error({ err, userId }, 'digest notification failed');
      return null;
    });
    if (sent) notified += 1;
  }

  // Reaching the ceiling ends a member's earnings until they reinvest, which is
  // the one earnings event that genuinely needs saying on its own.
  const capped = await prisma.investment.findMany({
    where: { status: 'CAPPED', cappedAt: { gte: date, lt: dayEnd } },
    select: { id: true, userId: true, amount: true, capLimit: true },
  });

  for (const inv of capped) {
    await deliverMember({
      userId: inv.userId,
      type: 'investment.capped',
      dedupeKey: `capped:${inv.id}`,
      title: 'Package fully matured',
      body: `Your $${inv.amount.toString()} package has paid out its full $${inv.capLimit.toString()} ceiling and has stopped earning. Invest again to keep earning.`,
      meta: { investmentId: inv.id, capLimit: inv.capLimit.toString() },
    }).catch(() => null);
  }

  const result = { date: iso, members: totals.size, notified, capped: capped.length };
  logger.info(result, 'earnings digest sent');
  return result;
}
