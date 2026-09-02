import { prisma } from '../../core/db.js';
import { postEntry } from '../../core/ledger.js';
import { money, percentOf, toDb, type Money } from '../../core/money.js';
import { makeReference } from '../../core/reference.js';
import { badRequest, notFound } from '../../core/errors.js';
import { payDirectBonus, payBinaryBonus, announceCommissions } from '../commission/commission.service.js';
import { propagateInvestment } from '../team/team.service.js';
import { evaluate as evaluateRank } from '../rank/rank.service.js';
import { evaluate as evaluateRoaming } from '../roaming-club/roaming-club.service.js';
import { evaluate as evaluateRewards, announce as announceRewards } from '../rewards/rewards.service.js';
import { issueTickets, announceTickets } from '../lottery/lottery.service.js';
import { config } from '../../core/runtime-config.js';
import * as activity from '../../core/activity.js';
import { notifyMember } from '../../core/notify.js';
import type { Request } from 'express';

/**
 * Purchase flow. Everything below happens in ONE transaction:
 *   debit FUND wallet → create investment → pay 3-level direct bonus
 *   → propagate team volume → re-evaluate rank and Flyers Club.
 *
 * If any step fails the whole purchase rolls back, so money never moves
 * without the matching commissions.
 */
export async function purchase(userId: string, packageId: string, req?: Request) {
  const cfg = await config();
  const plan = await prisma.packagePlan.findUnique({ where: { id: packageId } });
  if (!plan || !plan.isActive) throw notFound('Package not available');

  const amount = money(plan.amount.toString());

  /**
   * The published package price is authoritative here.
   *
   * This used to re-check the price against MIN_INVESTMENT and an
   * INVESTMENT_STEP multiple at checkout. Because a member cannot choose the
   * amount — they pick a package and the price is read from the row — those
   * checks only ever validated operator-entered data, at the worst possible
   * moment: they turned a pricing decision into a member-facing error on a
   * plan that was live, listed and advertised. The real price ladder
   * ($110 / $270 / $530 …) is not a multiple of $50, so the three entry tiers
   * could not be bought at all.
   *
   * The floor now runs where the number is actually entered — see
   * admin/catalog.upsertPackage — and the step rule is gone, because there is
   * no free-amount path for it to govern.
   */

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, affiliateMode: true, status: true },
  });
  if (!user || user.status !== 'ACTIVE') throw badRequest('Account is not active');

  /**
   * The earnings ceiling.
   *
   * The package carries its own ceiling — that is the figure an operator edits
   * on the Plans screen, and it is authoritative for this tier. ACTIVE
   * affiliates earn an uplift on top of it, expressed as the gap between the
   * two configured ceilings (250% → 300% by default, so +50 points).
   *
   * Previously the package figure was ignored entirely and the ceiling came
   * from the environment, which made the Plans field decorative.
   */
  const uplift = user.affiliateMode === 'ACTIVE'
    ? Math.max(0, cfg.capActivePercent - cfg.capPassivePercent)
    : 0;
  const capPercent = Number(plan.capPercent.toString()) + uplift;
  const capLimit = percentOf(amount, capPercent);
  const reference = makeReference('INV', userId);

  return prisma.$transaction(
    async (tx) => {
      // Guarded debit — cannot overdraw even under concurrent purchases.
      await postEntry(tx, {
        userId,
        walletType: 'FUND',
        direction: 'DEBIT',
        category: 'INVESTMENT',
        amount,
        reference,
        description: `Purchase — ${plan.name}`,
        meta: { plan: plan.name, capPercent: String(capPercent), packageCapPercent: plan.capPercent.toString(), activeUplift: String(uplift) },
      });

      const investment = await tx.investment.create({
        data: {
          userId,
          packageId: plan.id,
          amount: toDb(amount),
          dailyRoiPercent: plan.dailyRoiPercent,
          capLimit: toDb(capLimit),
          status: 'ACTIVE',
        },
      });

      await tx.$executeRaw`
        UPDATE users SET "totalInvested" = "totalInvested" + ${toDb(amount)}::numeric
         WHERE id = ${userId}`;

      await propagateInvestment(tx, userId, amount);
      const bonuses = await payDirectBonus(tx, { investmentId: investment.id, buyerId: userId, amount });

      /* No-ops under unilevel — it checks the plan structure itself, so the
         purchase path reads the same whichever plan is in force. */
      const binary = await payBinaryBonus(tx, { investmentId: investment.id, buyerId: userId, amount });

      // Milestone cards unlock inside the same transaction, so one cannot
      // exist for a purchase that rolled back.
      const rewardTiers = await evaluateRewards(tx, userId);
      const drawTickets = await issueTickets(tx, userId);

      return { investment, bonuses: [...bonuses, ...binary], rewardTiers, drawTickets };
    },
    { timeout: 30_000 },
  ).then(async (res) => {
    // Rank / club evaluation runs after commit so a slow ladder walk cannot
    // hold the purchase transaction open.
    await evaluateRank(userId).catch(() => undefined);
    await evaluateRoaming(userId).catch(() => undefined);

    /**
     * Everything below is announced after commit, for one reason: none of it
     * runs on the transaction. `notifyMember` and `activity.record` write
     * through the global client so they can never fail a purchase, which also
     * means they commit independently of it — so calling them from inside the
     * transaction told the member about a purchase a late rollback would then
     * erase.
     */
    notifyMember({
      userId,
      type: 'investment.purchased',
      dedupeKey: `investment:${res.investment.id}`,
      title: `${plan.name} activated`,
      body: `$${amount.toString()} invested. Daily returns start on the next trading day, up to a ceiling of $${capLimit.toString()}.`,
      meta: { investmentId: res.investment.id, plan: plan.name, amount: amount.toString() },
    });

    activity.record({
      userId, event: 'INVESTMENT_PURCHASED', req,
      summary: `Purchased ${plan.name} for $${amount.toString()}`,
      meta: { plan: plan.name, amount: amount.toString(), capLimit: capLimit.toString() },
    });

    await announceCommissions(userId, res.bonuses).catch(() => undefined);
    announceRewards(userId, res.rewardTiers);
    announceTickets(userId, res.drawTickets);
    return res;
  });
}

export const listForUser = (userId: string) =>
  prisma.investment.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: { package: { select: { name: true } } },
  });

export async function overview(userId: string) {
  const rows = await prisma.investment.findMany({
    where: { userId },
    select: { amount: true, capLimit: true, totalEarned: true, status: true },
  });

  const sum = (f: (r: (typeof rows)[number]) => Money) =>
    rows.reduce((a, r) => a.add(f(r)), money(0));

  const invested = sum((r) => money(r.amount.toString()));
  const capLimit = sum((r) => money(r.capLimit.toString()));
  const earned = sum((r) => money(r.totalEarned.toString()));

  return {
    totalInvested: invested.toString(),
    capLimit: capLimit.toString(),
    totalEarned: earned.toString(),
    remaining: capLimit.sub(earned).toString(),
    capUsedPercent: capLimit.gt(0) ? Number(earned.div(capLimit).mul(100).toFixed(2)) : 0,
    active: rows.filter((r) => r.status === 'ACTIVE').length,
    capped: rows.filter((r) => r.status === 'CAPPED').length,
    total: rows.length,
  };
}
