import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma, resetData, seedPlan, makeUser, balanceOf, verifyKyc } from './helpers.js';
import { purchase } from '../src/modules/investment/investment.service.js';
import { runDailyRoi, isTradingDay } from '../src/jobs/daily-roi.job.js';
import { request as requestWithdrawal } from '../src/modules/withdrawal/withdrawal.service.js';
import { getCapState } from '../src/core/capping.js';

const plan = (amount: string) => prisma.packagePlan.findFirstOrThrow({ where: { amount } });

beforeAll(seedPlan);
beforeEach(resetData);

describe('direct sponsor bonus', () => {
  it('pays 4% / 0.5% / 0.5% up exactly three levels', async () => {
    const a = await makeUser({ funded: 1000 });
    const b = await makeUser({ sponsorId: a.id, funded: 1000 });
    const c = await makeUser({ sponsorId: b.id, funded: 1000 });
    const d = await makeUser({ sponsorId: c.id, funded: 2000 });

    // uplines need capacity of their own before they can be paid
    for (const u of [a, b, c]) await purchase(u.id, (await plan('530')).id);
    const before = { a: await balanceOf(a.id), b: await balanceOf(b.id), c: await balanceOf(c.id) };

    await purchase(d.id, (await plan('1100')).id);

    expect(await balanceOf(c.id) - before.c).toBeCloseTo(44, 6);   // L1 = 4%
    expect(await balanceOf(b.id) - before.b).toBeCloseTo(5.5, 6);  // L2 = 0.5%
    expect(await balanceOf(a.id) - before.a).toBeCloseTo(5.5, 6);  // L3 = 0.5%
  });

  it('pays nothing to an upline with no capacity of their own', async () => {
    const sponsor = await makeUser();                              // never invested
    const buyer = await makeUser({ sponsorId: sponsor.id, funded: 1100 });

    await purchase(buyer.id, (await plan('1100')).id);

    expect(await balanceOf(sponsor.id)).toBe(0);
    const row = await prisma.commission.findFirst({ where: { userId: sponsor.id } });
    expect(Number(row?.amount)).toBeCloseTo(44, 6);   // intended is recorded
    expect(Number(row?.paidAmount)).toBe(0);          // but nothing was paid
  });

  it('stops at level 3 — a fourth-level upline earns nothing', async () => {
    const l4 = await makeUser({ funded: 1000 });
    const l3 = await makeUser({ sponsorId: l4.id, funded: 1000 });
    const l2 = await makeUser({ sponsorId: l3.id, funded: 1000 });
    const l1 = await makeUser({ sponsorId: l2.id, funded: 1000 });
    const buyer = await makeUser({ sponsorId: l1.id, funded: 1100 });
    for (const u of [l4, l3, l2, l1]) await purchase(u.id, (await plan('530')).id);
    const before = await balanceOf(l4.id);

    await purchase(buyer.id, (await plan('1100')).id);

    expect(await balanceOf(l4.id)).toBe(before);
  });
});

describe('earnings cap', () => {
  it('clamps a payout to the remaining headroom and marks the package capped', async () => {
    const u = await makeUser({ funded: 200 });
    const p = await prisma.packagePlan.create({
      data: { name: 'Cap probe', amount: '100', dailyRoiPercent: '200', capPercent: '250', sortOrder: 99 },
    });
    await purchase(u.id, p.id);          // cap limit = 250

    const monday = new Date(Date.UTC(2026, 7, 17));
    await runDailyRoi(monday);           // 200% of 100 = 200 paid
    expect(await balanceOf(u.id)).toBeCloseTo(200, 6);

    await runDailyRoi(new Date(Date.UTC(2026, 7, 18)));  // wants 200, only 50 left
    expect(await balanceOf(u.id)).toBeCloseTo(250, 6);

    const inv = await prisma.investment.findFirstOrThrow({ where: { userId: u.id } });
    expect(inv.status).toBe('CAPPED');

    const state = await getCapState(u.id);
    expect(state.isCapped).toBe(true);
    expect(Number(state.remaining)).toBe(0);
  });

  it('never pays beyond the cap however many runs happen', async () => {
    const u = await makeUser({ funded: 200 });
    const p = await prisma.packagePlan.create({
      data: { name: 'Cap probe 2', amount: '100', dailyRoiPercent: '100', capPercent: '250', sortOrder: 98 },
    });
    await purchase(u.id, p.id);

    for (let d = 17; d <= 21; d++) await runDailyRoi(new Date(Date.UTC(2026, 7, d)));

    expect(await balanceOf(u.id)).toBeCloseTo(250, 6);
  });
});

describe('daily ROI job', () => {
  it('only accrues on the configured trading days', () => {
    const weekdays = [1, 2, 3, 4, 5];
    expect(isTradingDay(new Date(Date.UTC(2026, 7, 17)), weekdays)).toBe(true);   // Monday
    expect(isTradingDay(new Date(Date.UTC(2026, 7, 21)), weekdays)).toBe(true);   // Friday
    expect(isTradingDay(new Date(Date.UTC(2026, 7, 22)), weekdays)).toBe(false);  // Saturday
    expect(isTradingDay(new Date(Date.UTC(2026, 7, 23)), weekdays)).toBe(false);  // Sunday
    // Sunday becomes a trading day if the operator says so — nothing is baked in.
    expect(isTradingDay(new Date(Date.UTC(2026, 7, 23)), [7])).toBe(true);
  });

  it('skips the weekend entirely', async () => {
    const u = await makeUser({ funded: 1100 });
    await purchase(u.id, (await plan('1100')).id);
    const before = await balanceOf(u.id);

    const res = await runDailyRoi(new Date(Date.UTC(2026, 7, 22)));

    expect(res.skipped).toBe(true);
    expect(await balanceOf(u.id)).toBe(before);
  });

  it('pays 0.5% of capital on a trading day', async () => {
    const u = await makeUser({ funded: 1100 });
    await purchase(u.id, (await plan('1100')).id);

    await runDailyRoi(new Date(Date.UTC(2026, 7, 17)));

    expect(await balanceOf(u.id)).toBeCloseTo(5.5, 6);
  });

  it('is a no-op when the same day is replayed', async () => {
    const u = await makeUser({ funded: 1100 });
    await purchase(u.id, (await plan('1100')).id);
    const monday = new Date(Date.UTC(2026, 7, 17));

    await runDailyRoi(monday);
    const after = await balanceOf(u.id);
    const second = await runDailyRoi(monday);

    expect(second.processed).toBe(0);
    expect(await balanceOf(u.id)).toBe(after);
  });

  it('survives two schedulers running the same day at once', async () => {
    const u = await makeUser({ funded: 1100 });
    await purchase(u.id, (await plan('1100')).id);
    const monday = new Date(Date.UTC(2026, 7, 17));

    await Promise.allSettled([runDailyRoi(monday), runDailyRoi(monday)]);

    expect(await balanceOf(u.id)).toBeCloseTo(5.5, 6);
    expect(await prisma.roiAccrual.count({ where: { userId: u.id } })).toBe(1);
  });
});

describe('withdrawals', () => {
  it('applies the 5% fee and debits the gross immediately', async () => {
    const u = await makeUser();
    await verifyKyc(u.id);
    await prisma.$executeRaw`UPDATE wallet_accounts SET balance = 500 WHERE "userId" = ${u.id} AND type = 'MAIN'`;

    const w = await requestWithdrawal(u.id, '100', '0x1234567890abcdef1234567890abcdef12345678', undefined, 'password');

    expect(Number(w.fee)).toBeCloseTo(5, 6);
    expect(Number(w.netAmount)).toBeCloseTo(95, 6);
    expect(await balanceOf(u.id)).toBeCloseTo(400, 6);
  });

  it('enforces the minimum and maximum', async () => {
    const u = await makeUser();
    await verifyKyc(u.id);
    await prisma.$executeRaw`UPDATE wallet_accounts SET balance = 99999 WHERE "userId" = ${u.id} AND type = 'MAIN'`;
    const addr = '0x1234567890abcdef1234567890abcdef12345678';

    await expect(requestWithdrawal(u.id, '5', addr, undefined, 'password')).rejects.toThrow(/Minimum/);
    await expect(requestWithdrawal(u.id, '5001', addr, undefined, 'password')).rejects.toThrow(/Maximum/);
  });

  it('rejects a malformed payout address', async () => {
    const u = await makeUser();
    await verifyKyc(u.id);
    await prisma.$executeRaw`UPDATE wallet_accounts SET balance = 500 WHERE "userId" = ${u.id} AND type = 'MAIN'`;
    await expect(requestWithdrawal(u.id, '100', 'not-an-address', undefined, 'password')).rejects.toThrow(/BEP-20/);
  });

  it('cannot be double-spent by two simultaneous requests', async () => {
    const u = await makeUser();
    await verifyKyc(u.id);
    await prisma.$executeRaw`UPDATE wallet_accounts SET balance = 100 WHERE "userId" = ${u.id} AND type = 'MAIN'`;
    const addr = '0x1234567890abcdef1234567890abcdef12345678';

    const results = await Promise.allSettled([
      requestWithdrawal(u.id, '100', addr, undefined, 'password'),
      requestWithdrawal(u.id, '100', addr, undefined, 'password'),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await balanceOf(u.id)).toBe(0);
  });
});

describe('purchase — service contract', () => {
  /**
   * Two calls to the service are two genuine purchases: a member is allowed to
   * buy the same package twice. Recognising a *repeated submission* is a
   * request-level concern and is proved in tests/idempotency.test.ts.
   */
  it('a member may deliberately buy the same package twice', async () => {
    const u = await makeUser({ funded: 5000 });
    const p = await plan('1100');

    await purchase(u.id, p.id);
    await purchase(u.id, p.id);

    expect(await prisma.investment.count({ where: { userId: u.id } })).toBe(2);
    expect(await balanceOf(u.id, 'FUND')).toBeCloseTo(2800, 6);
  });

  it('refuses a purchase the fund wallet cannot cover', async () => {
    const u = await makeUser({ funded: 100 });
    await expect(purchase(u.id, (await plan('1100')).id)).rejects.toThrow(/[Ii]nsufficient/);
    expect(await prisma.investment.count({ where: { userId: u.id } })).toBe(0);
    expect(await balanceOf(u.id, 'FUND')).toBeCloseTo(100, 6);
  });

  it('refuses a package that is not active', async () => {
    const u = await makeUser({ funded: 5000 });
    const p = await plan('1100');
    await prisma.packagePlan.update({ where: { id: p.id }, data: { isActive: false } });
    await expect(purchase(u.id, p.id)).rejects.toThrow(/not available/);
    await prisma.packagePlan.update({ where: { id: p.id }, data: { isActive: true } });
  });

  it('sells the entry tiers the operator actually published', async () => {
    // Regression: a $50 step rule was applied to fixed package prices at
    // checkout, which made $110 / $270 / $530 unbuyable.
    for (const amount of ['110', '270', '530']) {
      const u = await makeUser({ funded: 5000 });
      await expect(purchase(u.id, (await plan(amount)).id)).resolves.toBeTruthy();
    }
  });
});
