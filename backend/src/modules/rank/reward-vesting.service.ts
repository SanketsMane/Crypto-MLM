import { prisma, type Tx } from '../../core/db.js';
import { postEntry } from '../../core/ledger.js';
import { money, toDb, type Money } from '../../core/money.js';
import { deterministicReference } from '../../core/reference.js';
import { config } from '../../core/runtime-config.js';
import { logger } from '../../core/logger.js';
import { notifyMember } from '../../core/notify.js';

/**
 * Rank rewards, paid in equal monthly parts instead of all at once.
 *
 * The reward is *earned* the moment the rank is achieved — that fact is
 * recorded immediately and never moves. What changes is when the money lands:
 * an operator can spread it over N months, credited on the 1st.
 *
 * Three properties this file exists to guarantee:
 *
 *   • the instalments sum to exactly the reward, to the last decimal place;
 *   • a job that runs twice pays once;
 *   • a month the job did not run is not a month the member loses.
 */

/** First of the month after `from`, in UTC. */
export function firstOfNextMonth(from: Date): Date {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
}

/** Adds whole months to a UTC first-of-month date. */
export function addMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}

/** Midnight UTC today, for comparing against a DATE column. */
export const todayUtc = (now: Date = new Date()): Date =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

/**
 * Split a reward into `n` parts that add up to exactly the reward.
 *
 * $300 over 7 months is $42.857142857… — a number that does not exist in the
 * ledger. Every part is rounded DOWN to the project's 8 decimal places, which
 * is the house rule so a rounding step never over-pays, and the shortfall that
 * creates is handed to the FINAL instalment.
 *
 * The result is that no single payment exceeds an even share, and the total is
 * neither a fraction over nor a fraction under what the member was promised.
 * Paying the remainder first would let a member who is suspended part-way
 * through collect more than their pro-rata share.
 */
export function splitEvenly(total: Money, n: number): Money[] {
  if (n < 1) throw new Error('instalment count must be at least 1');
  const each = money(total).div(n).toDecimalPlaces(8, 3 /* ROUND_DOWN */);
  const parts: Money[] = [];
  let running = money(0);
  for (let i = 0; i < n - 1; i += 1) {
    parts.push(each);
    running = running.add(each);
  }
  parts.push(money(total).sub(running)); // the last one carries the remainder
  return parts;
}

/**
 * Write the schedule for a reward that has just been earned.
 *
 * Called inside the same path that creates the achievement. Returns the number
 * of instalments written, or 0 when vesting is switched off — in which case the
 * caller pays the reward outright, exactly as it always did.
 */
export async function scheduleReward(
  db: Tx,
  input: { achievementId: string; userId: string; reward: Money; months: number; achievedAt: Date },
): Promise<number> {
  const { achievementId, userId, reward, months, achievedAt } = input;
  if (months < 1 || reward.lte(0)) return 0;

  const amounts = splitEvenly(reward, months);
  const firstDue = firstOfNextMonth(achievedAt);

  await db.rankRewardInstalment.createMany({
    data: amounts.map((amount, i) => ({
      achievementId,
      userId,
      sequence: i + 1,
      ofTotal: months,
      amount: toDb(amount),
      dueOn: addMonths(firstDue, i),
      // Deterministic, so a retry of the achievement path cannot create a
      // second schedule for the same reward.
      reference: deterministicReference('RANKVEST', achievementId, i + 1),
    })),
    skipDuplicates: true,
  });

  return months;
}

export interface VestingRunResult {
  ranAt: string;
  due: number;
  paid: number;
  skippedInactive: number;
  amountPaid: string;
}

/**
 * Pay every instalment that has come due and has not been paid.
 *
 * Deliberately "everything due", not "everything due today". If the job did
 * not run on the 1st — a deploy, an outage, a queue that was drained — those
 * instalments simply remain due and are paid on the next run. Catch-up is not a
 * special case here; it is the ordinary behaviour of the query.
 *
 * A member who is not ACTIVE is skipped rather than marked anything. Their row
 * stays due, so the day they are reinstated the arrears pay themselves.
 */
export async function runRewardVesting(now: Date = new Date()): Promise<VestingRunResult> {
  const today = todayUtc(now);

  const due = await prisma.rankRewardInstalment.findMany({
    where: { paidAt: null, dueOn: { lte: today } },
    orderBy: [{ dueOn: 'asc' }, { sequence: 'asc' }],
    include: {
      user: { select: { id: true, status: true } },
      achievement: { select: { rank: { select: { code: true, name: true, level: true } } } },
    },
  });

  let paid = 0;
  let skippedInactive = 0;
  let total = money(0);

  for (const inst of due) {
    if (inst.user.status !== 'ACTIVE') {
      skippedInactive += 1;
      continue;
    }

    const amount = money(inst.amount.toString());

    try {
      /**
       * One transaction per instalment, not one for the whole run: a single
       * member's failure must not roll back everybody else's payment. The
       * conditional update is what makes a concurrent second worker harmless —
       * only one of them can move the row out of `paidAt: null`.
       */
      await prisma.$transaction(async (tx) => {
        const claimed = await tx.rankRewardInstalment.updateMany({
          where: { id: inst.id, paidAt: null },
          data: { paidAt: new Date() },
        });
        if (claimed.count === 0) return; // another worker got there first

        await postEntry(tx, {
          userId: inst.userId,
          walletType: 'MAIN',
          direction: 'CREDIT',
          category: 'RANK_BONUS',
          amount,
          reference: inst.reference,
          description:
            `Rank reward — ${inst.achievement.rank.name} `
            + `(instalment ${inst.sequence} of ${inst.ofTotal})`,
          meta: {
            rank: inst.achievement.rank.code,
            achievementId: inst.achievementId,
            sequence: inst.sequence,
            ofTotal: inst.ofTotal,
            dueOn: inst.dueOn.toISOString().slice(0, 10),
          },
          sourceType: 'rank_reward_instalment',
          sourceId: inst.id,
        });

        // Counted as earned when it is actually received, not when it was
        // promised — otherwise the figure a member sees includes money they
        // cannot spend for months.
        await tx.$executeRaw`
          UPDATE users SET "totalEarned" = "totalEarned" + ${toDb(amount)}::numeric
           WHERE id = ${inst.userId}`;
      });

      paid += 1;
      total = total.add(amount);

      notifyMember({
        userId: inst.userId,
        type: 'rank.instalment',
        dedupeKey: `rankvest:${inst.id}`,
        title: `Rank reward instalment ${inst.sequence} of ${inst.ofTotal}`,
        body:
          `$${amount.toString()} from your ${inst.achievement.rank.name} reward has been `
          + `credited to your main wallet.`,
        meta: { rank: inst.achievement.rank.code, sequence: inst.sequence, ofTotal: inst.ofTotal },
      });
    } catch (err) {
      // One bad row must not stop the run. It stays due and is retried next time.
      logger.error({ err, instalmentId: inst.id, userId: inst.userId }, 'reward instalment failed');
    }
  }

  const result: VestingRunResult = {
    ranAt: today.toISOString().slice(0, 10),
    due: due.length,
    paid,
    skippedInactive,
    amountPaid: total.toString(),
  };
  logger.info(result, 'reward vesting run complete');
  return result;
}

/** What a member has been promised, what has landed, and what is still coming. */
export async function vestingSummary(userId: string) {
  const rows = await prisma.rankRewardInstalment.findMany({
    where: { userId },
    orderBy: [{ dueOn: 'asc' }, { sequence: 'asc' }],
    include: { achievement: { select: { rank: { select: { code: true, name: true, level: true } } } } },
  });

  const credited = rows.filter((r) => r.paidAt).reduce((a, r) => a.add(money(r.amount.toString())), money(0));
  const outstanding = rows.filter((r) => !r.paidAt).reduce((a, r) => a.add(money(r.amount.toString())), money(0));
  const nextDue = rows.find((r) => !r.paidAt);

  return {
    scheduled: rows.length > 0,
    totalAwarded: credited.add(outstanding).toString(),
    credited: credited.toString(),
    outstanding: outstanding.toString(),
    nextDueOn: nextDue?.dueOn.toISOString().slice(0, 10) ?? null,
    nextAmount: nextDue ? money(nextDue.amount.toString()).toString() : null,
    instalments: rows.map((r) => ({
      rank: r.achievement.rank.name,
      rankLevel: r.achievement.rank.level,
      sequence: r.sequence,
      ofTotal: r.ofTotal,
      amount: money(r.amount.toString()).toString(),
      dueOn: r.dueOn.toISOString().slice(0, 10),
      paidAt: r.paidAt,
      status: r.paidAt ? 'PAID' : 'SCHEDULED',
    })),
  };
}
