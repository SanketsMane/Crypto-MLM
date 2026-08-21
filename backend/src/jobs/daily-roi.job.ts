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

export async function runDailyRoi(forDate = new Date()): Promise<RoiRunResult> {
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
