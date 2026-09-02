import { describe, expect, it, beforeAll, beforeEach } from 'vitest';
import { prisma, resetData, seedPlan, makeUser, balanceOf } from './helpers.js';
import { purchase } from '../src/modules/investment/investment.service.js';
import { catchUpDailyRoi, runDailyRoi } from '../src/jobs/daily-roi.job.js';

/**
 * A missed trading day must still be paid.
 *
 * The scheduler called `runDailyRoi()` with no argument, which accrues exactly
 * one day — today. `lastAccrualDate` was stamped on every investment and read
 * by nothing. Any weekday the worker was down therefore erased that day's
 * 0.5% permanently for every active investment, along with the generation
 * bonuses paid on it, with nothing anywhere recording that it had happened.
 */

const plan = (amount: string) => prisma.packagePlan.findFirstOrThrow({ where: { amount } });

// A Monday–Friday run of trading days in a settled past week.
const MON = new Date(Date.UTC(2026, 7, 17));
const TUE = new Date(Date.UTC(2026, 7, 18));
const WED = new Date(Date.UTC(2026, 7, 19));
const THU = new Date(Date.UTC(2026, 7, 20));
const FRI = new Date(Date.UTC(2026, 7, 21));
const SAT = new Date(Date.UTC(2026, 7, 22));

beforeAll(seedPlan);
beforeEach(resetData);

const SUN = new Date(Date.UTC(2026, 7, 16)); // the day before the run below

/**
 * A member holding one $1,100 package at 0.5% — $5.50 a trading day.
 *
 * `startedAt` is backdated because these tests accrue historical dates, and
 * catch-up deliberately will not pay an investment for a day that predates it.
 * A fixture that purchases "now" and then replays August would be testing a
 * situation that cannot occur.
 */
async function invested(startedAt: Date = SUN) {
  const u = await makeUser({ funded: 2_000 });
  await purchase(u.id, (await plan('1100')).id);
  await prisma.investment.updateMany({ where: { userId: u.id }, data: { startedAt } });
  return u;
}

const DAILY = 5.5;

describe('daily ROI catch-up', () => {
  it('pays every trading day missed while the worker was down', async () => {
    const u = await invested();

    // Monday ran, then the worker was down Tuesday, Wednesday and Thursday.
    await runDailyRoi(MON);
    expect(await balanceOf(u.id)).toBeCloseTo(DAILY, 6);

    const result = await catchUpDailyRoi(THU);

    expect(result.days.map((d) => d.date)).toEqual(['2026-08-18', '2026-08-19', '2026-08-20']);
    expect(await balanceOf(u.id)).toBeCloseTo(DAILY * 4, 6);
    expect(await prisma.roiAccrual.count({ where: { userId: u.id } })).toBe(4);
  });

  it('is idempotent — running it again pays nothing further', async () => {
    const u = await invested();
    await runDailyRoi(MON);
    await catchUpDailyRoi(THU);

    const before = await balanceOf(u.id);
    const again = await catchUpDailyRoi(THU);

    expect(await balanceOf(u.id)).toBeCloseTo(Number(before), 6);
    expect(again.days.every((d) => d.processed === 0)).toBe(true);
  });

  it('skips the weekend', async () => {
    const u = await invested();
    await runDailyRoi(THU);

    // Thursday → Saturday. Friday is the only trading day in between.
    const result = await catchUpDailyRoi(SAT);

    expect(result.days.filter((d) => !d.skipped).map((d) => d.date)).toEqual(['2026-08-21']);
    expect(await balanceOf(u.id)).toBeCloseTo(DAILY * 2, 6);
  });

  it('does not backdate an investment opened during the outage', async () => {
    /**
     * The trap in replaying past days: the single-date engine accrues every
     * ACTIVE investment for whatever date it is handed, so a naive catch-up
     * would pay an investment for days before it existed. Catch-up passes
     * `existingOnly`, which is what this holds.
     */
    const early = await invested();
    await runDailyRoi(MON);

    const late = await invested(WED); // opened mid-outage, on the Wednesday

    await catchUpDailyRoi(FRI);

    // The early member gets Tue–Fri; the late one only Thu and Fri.
    expect(await prisma.roiAccrual.count({ where: { userId: early.id } })).toBe(5);

    const lateDays = await prisma.roiAccrual.findMany({
      where: { userId: late.id }, select: { accrualDate: true }, orderBy: { accrualDate: 'asc' },
    });
    expect(lateDays.map((r) => r.accrualDate.toISOString().slice(0, 10))).toEqual(['2026-08-20', '2026-08-21']);
  });

  it('refuses to backdate beyond the window, and names the days it would not pay', async () => {
    const u = await invested();
    await runDailyRoi(MON);

    // Two months later. Paying every trading day between would be the wrong
    // response to what is almost certainly a restore or a clock problem.
    const result = await catchUpDailyRoi(new Date(Date.UTC(2026, 9, 20)), 5);

    expect(result.days).toHaveLength(5);
    expect(result.skippedBeyondWindow.length).toBeGreaterThan(20);
    expect(await prisma.roiAccrual.count({ where: { userId: u.id } })).toBe(6); // Monday + 5
  });

  it('a fresh platform with no history just runs today', async () => {
    await invested();
    const result = await catchUpDailyRoi(TUE);
    expect(result.days).toHaveLength(1);
    expect(result.days[0].date).toBe('2026-08-18');
  });
});
