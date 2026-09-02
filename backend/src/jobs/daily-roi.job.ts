import { prisma } from '../core/db.js';
import { postEntry } from '../core/ledger.js';
import { consumeAllowance } from '../core/capping.js';
import { money, percentOf, toDb } from '../core/money.js';
import { deterministicReference } from '../core/reference.js';
import { payGenerationBonus } from '../modules/commission/commission.service.js';
import { config } from '../core/runtime-config.js';
import { logger } from '../core/logger.js';
import { isSimulating, simulationRunId } from '../middleware/request-context.js';

/**
 * Daily trade bonus (FortuneX p10/p18).
 *
 *   • 0.5% per day of invested capital
 *   • Monday–Friday ONLY — weekends never accrue
 *   • clamped by the 250% / 300% earnings cap
 *   • each accrual triggers the 30-level generation bonus
 *
 * Idempotent by (investmentId, accrualDate): re-running for the same day is a
 * no-op, so a retry or an overlapping cron cannot pay twice.
 */

export const isTradingDay = (d: Date, tradingDays: number[]): boolean => {
  const iso = d.getUTCDay() === 0 ? 7 : d.getUTCDay(); // 1=Mon … 7=Sun
  return tradingDays.includes(iso);
};

const utcDate = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export interface RoiRunResult {
  date: string;
  skipped: boolean;
  processed: number;
  paid: string;
  cappedOut: number;
  generationPayouts: number;
}

/**
 * `existingOnly` restricts the run to investments that already existed before
 * `forDate`. Off by default, deliberately: the single-date engine has always
 * accrued every ACTIVE investment for whatever date it was handed, and tests
 * rely on driving it at past dates. Catch-up turns it on, because replaying a
 * missed day must not pay an investment that was opened during the outage for
 * days before it existed.
 */
export async function runDailyRoi(
  forDate = new Date(),
  opts: { existingOnly?: boolean } = {},
): Promise<RoiRunResult> {
  const cfg = await config();
  const date = utcDate(forDate);
  const iso = date.toISOString().slice(0, 10);

  if (!isTradingDay(date, cfg.tradingDays)) {
    logger.info({ date: iso }, 'not a trading day — ROI skipped');
    return { date: iso, skipped: true, processed: 0, paid: '0', cappedOut: 0, generationPayouts: 0 };
  }

  /**
   * A simulation only ever pays its own members.
   *
   * Without this scope a dry run would walk every active investment on the
   * platform and credit real members for days that have not happened — real
   * money, written to the real ledger, and effectively impossible to unwind.
   *
   * Read from the async context rather than passed in, so a future caller
   * cannot forget it. Outside a simulation the filter is absent and the job
   * behaves exactly as before.
   */
  const runId = simulationRunId();
  if (isSimulating() && !runId) {
    throw new Error('Refusing to run: simulating without a run id would pay real members');
  }

  const investments = await prisma.investment.findMany({
    where: {
      status: 'ACTIVE',
      ...(runId ? { user: { simulationRunId: runId } } : {}),
      ...(opts.existingOnly ? { startedAt: { lt: date } } : {}),
    },
    select: { id: true, userId: true, amount: true, dailyRoiPercent: true },
  });

  let processed = 0;
  let cappedOut = 0;
  let generationPayouts = 0;
  let paidTotal = money(0);

  for (const inv of investments) {
    const reference = deterministicReference('ROI', inv.id, iso);

    try {
      const result = await prisma.$transaction(async (tx) => {
        const exists = await tx.roiAccrual.findUnique({
          where: { investmentId_accrualDate: { investmentId: inv.id, accrualDate: date } },
          select: { id: true },
        });
        if (exists) return null;

        const base = money(inv.amount.toString());
        const rate = inv.dailyRoiPercent.toString();
        const gross = percentOf(base, rate);

        // Cap gate — everything the platform pays passes through here.
        const payable = await consumeAllowance(tx, inv.userId, gross);

        const accrual = await tx.roiAccrual.create({
          data: {
            investmentId: inv.id,
            userId: inv.userId,
            accrualDate: date,
            baseAmount: toDb(base),
            ratePercent: rate,
            amount: toDb(gross),
            paidAmount: toDb(payable),
          },
        });

        if (payable.gt(0)) {
          await postEntry(tx, {
            userId: inv.userId,
            walletType: 'MAIN',
            direction: 'CREDIT',
            category: 'DAILY_ROI',
            amount: payable,
            reference,
            description: `Daily trade bonus ${iso}`,
            meta: { base: toDb(base), rate, gross: toDb(gross) },
            sourceType: 'roi_accrual',
            sourceId: accrual.id,
          });
          await tx.$executeRaw`
            UPDATE users SET "totalEarned" = "totalEarned" + ${toDb(payable)}::numeric
             WHERE id = ${inv.userId}`;
        }

        await tx.investment.update({
          where: { id: inv.id },
          data: { lastAccrualDate: date },
        });

        // 30-level generation bonus, paid on this ROI amount.
        const gen = payable.gt(0)
          ? await payGenerationBonus(tx, {
              accrualId: accrual.id,
              earnerFromId: inv.userId,
              roiAmount: payable,
              investmentId: inv.id,
            })
          : [];

        return { payable, gross, generation: gen.filter((g) => g.paid.gt(0)).length };
      }, { timeout: 60_000 });

      if (!result) continue;

      processed += 1;
      paidTotal = paidTotal.add(result.payable);
      generationPayouts += result.generation;
      if (result.payable.lt(result.gross)) cappedOut += 1;
    } catch (err) {
      logger.error({ err, investment: inv.id }, 'ROI accrual failed');
    }
  }

  const summary = { date: iso, skipped: false, processed, paid: paidTotal.toString(), cappedOut, generationPayouts };
  logger.info(summary, 'daily ROI run complete');
  return summary;
}


/**
 * Accrue every trading day that was missed, oldest first.
 *
 * The scheduler used to call `runDailyRoi()` with no argument, which accrues
 * exactly one day: today. `lastAccrualDate` was written on every investment
 * and read by nothing. So any interruption on a weekday — a worker crash, a
 * Redis outage, a scheduler miss, a deploy that overran — erased that day's
 * 0.5% permanently, along with the generation bonuses paid on it, silently,
 * for every active investment on the platform.
 *
 * The accrual table's `(investmentId, accrualDate)` unique constraint already
 * made a re-run a no-op, so catching up is a loop rather than a redesign.
 *
 * Bounded on purpose. A gap longer than `maxDays` is not an outage any more,
 * it is a restore from an old backup or a clock problem, and quietly paying
 * out months of backdated returns is the wrong response to either — so the
 * window is capped and the overflow is reported for a human.
 */
export interface RoiCatchUpResult {
  days: RoiRunResult[];
  /** Trading days older than the window that were NOT paid. Needs an operator. */
  skippedBeyondWindow: string[];
}

export async function catchUpDailyRoi(
  through = new Date(),
  maxDays = 30,
): Promise<RoiCatchUpResult> {
  const cfg = await config();
  const today = utcDate(through);

  /**
   * The last day the job actually ran.
   *
   * Every active investment gets `lastAccrualDate` stamped on a successful
   * run, so the maximum across them is the most recent completed run. Null
   * everywhere (a fresh platform) means there is nothing to catch up.
   */
  const high = await prisma.investment.aggregate({
    where: { status: 'ACTIVE' },
    _max: { lastAccrualDate: true },
  });
  const last = high._max.lastAccrualDate;
  if (!last) return { days: [await runDailyRoi(through)], skippedBeyondWindow: [] };

  // Every trading day strictly after the last run, up to and including today.
  const pending: Date[] = [];
  for (let d = utcDate(new Date(last.getTime() + 86_400_000)); d <= today; d = utcDate(new Date(d.getTime() + 86_400_000))) {
    if (isTradingDay(d, cfg.tradingDays)) pending.push(d);
  }

  const skippedBeyondWindow = pending
    .slice(0, Math.max(0, pending.length - maxDays))
    .map((d) => d.toISOString().slice(0, 10));

  if (skippedBeyondWindow.length) {
    logger.error(
      { count: skippedBeyondWindow.length, from: skippedBeyondWindow[0], to: skippedBeyondWindow.at(-1) },
      'ROI gap is longer than the catch-up window — these days need an operator decision',
    );
  }

  const days: RoiRunResult[] = [];
  for (const day of pending.slice(-maxDays)) {
    // Oldest first: the cap consumes headroom in date order, so replaying out
    // of order would clamp the wrong day.
    days.push(await runDailyRoi(day, { existingOnly: true }));
  }

  if (days.length > 1) {
    logger.warn({ days: days.length }, 'ROI catch-up paid more than one day — the worker had missed some');
  }
  return { days, skippedBeyondWindow };
}
