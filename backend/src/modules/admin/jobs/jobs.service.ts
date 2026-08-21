import type { Request } from 'express';
import { prisma } from '../../../core/db.js';
import { config } from '../../../core/runtime-config.js';
import * as audit from '../audit/audit.service.js';

/**
 * Visibility into the payout engine.
 *
 * The daily ROI run is the single most consequential thing this platform does
 * automatically, and until now nothing in the console said whether it had run,
 * what it paid, or whether it had failed. An operator found out when a member
 * complained.
 *
 * Everything here is derived from `RoiAccrual`, which the job writes as it
 * goes — no extra bookkeeping table, and the figures cannot drift from what was
 * actually paid.
 */

const DAY = 86_400_000;
const utcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export async function overview(days = 14) {
  const cfg = await config();
  const from = new Date(Date.now() - days * DAY);

  const [runs, activeInvestments, lastAccrual, firstAccruable] = await Promise.all([
    prisma.roiAccrual.groupBy({
      by: ['accrualDate'],
      where: { accrualDate: { gte: from } },
      _count: { _all: true },
      _sum: { amount: true, paidAmount: true },
      orderBy: { accrualDate: 'desc' },
    }),
    prisma.investment.count({ where: { status: 'ACTIVE' } }),
    prisma.roiAccrual.findFirst({ orderBy: { accrualDate: 'desc' }, select: { accrualDate: true, createdAt: true } }),
    // The earliest package that could ever have accrued. Before this date there
    // was simply nothing to pay, which is not the same as a missed run.
    prisma.investment.findFirst({
      where: { status: { in: ['ACTIVE', 'CAPPED'] } },
      orderBy: { startedAt: 'asc' },
      select: { startedAt: true },
    }),
  ]);

  const isTradingDay = (d: Date) => cfg.tradingDays.includes(d.getUTCDay() === 0 ? 7 : d.getUTCDay());

  // Walk back day by day so a day the job never ran shows up as a gap rather
  // than simply being absent from the list.
  const today = utcDay(new Date());
  const byDate = new Map(runs.map((r) => [utcDay(r.accrualDate).toISOString().slice(0, 10), r]));
  const timeline: {
    date: string; tradingDay: boolean; ran: boolean;
    investments: number; gross: string; paid: string; withheld: string;
  }[] = [];

  for (let i = 0; i < days; i += 1) {
    const d = new Date(today.getTime() - i * DAY);
    const key = d.toISOString().slice(0, 10);
    const row = byDate.get(key);
    const gross = Number(row?._sum.amount ?? 0);
    const paid = Number(row?._sum.paidAmount ?? 0);
    timeline.push({
      date: key,
      tradingDay: isTradingDay(d),
      ran: !!row,
      investments: row?._count._all ?? 0,
      gross: String(gross),
      paid: String(paid),
      withheld: String(Math.max(0, gross - paid)),
    });
  }

  /**
   * A missed run is a trading day that *should* have paid and did not.
   *
   * A day with no packages to accrue is not a missed run — flagging those would
   * light the screen up red on a platform that simply has no investments yet,
   * and an alert that cries wolf gets ignored when it matters.
   */
  const accruableFrom = firstAccruable ? utcDay(firstAccruable.startedAt) : null;
  const todayKey = today.toISOString().slice(0, 10);
  const missed = accruableFrom
    ? timeline.filter((t) => t.tradingDay && !t.ran && t.date !== todayKey && new Date(t.date) >= accruableFrom)
    : [];

  return {
    activeInvestments,
    /** Null when the platform has never had a package that could accrue. */
    accruableFrom: accruableFrom ? accruableFrom.toISOString().slice(0, 10) : null,
    tradingDays: cfg.tradingDays,
    lastRun: lastAccrual
      ? { date: utcDay(lastAccrual.accrualDate).toISOString().slice(0, 10), at: lastAccrual.createdAt }
      : null,
    missedRuns: missed.map((m) => m.date),
    timeline,
  };
}

/**
 * Run the daily accrual by hand.
 *
 * Safe to press: the job is idempotent per (investment, date), so a day that
 * has already accrued is a no-op rather than a second payout. It runs inline
 * rather than through the queue so the operator sees the result of the thing
 * they just triggered, instead of a job id.
 */
export async function runDailyRoi(adminId: string, forDate: string | undefined, req?: Request) {
  const { runDailyRoi: run } = await import('../../../jobs/daily-roi.job.js');
  const date = forDate ? new Date(forDate) : new Date();
  const result = await run(date);

  await audit.record({
    adminId, action: 'UPDATE', entityType: 'job', entityId: 'daily-roi',
    summary: result.skipped
      ? `Ran daily ROI for ${result.date} — skipped, not a trading day`
      : `Ran daily ROI for ${result.date} — ${result.processed} accruals, ${result.paid} paid, ${result.cappedOut} capped out`,
    after: { ...result }, req,
  });
  return result;
}
