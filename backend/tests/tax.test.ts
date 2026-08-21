import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { invalidateConfig } from '../src/core/runtime-config.js';
import { request as requestWithdrawal } from '../src/modules/withdrawal/withdrawal.service.js';
import { taxSummary } from '../src/modules/income/income.service.js';
import { prisma, resetData, seedPlan, makeUser, verifyKyc, balanceOf } from './helpers.js';

const ADDR = '0x1234567890abcdef1234567890abcdef12345678';

const setRate = async (percent: string) => {
  await prisma.setting.upsert({
    where: { key: 'TAX_WITHHOLDING_PERCENT' },
    create: { key: 'TAX_WITHHOLDING_PERCENT', value: percent },
    update: { value: percent },
  });
  invalidateConfig();
};

async function member(balance = 1000) {
  const u = await makeUser();
  await verifyKyc(u.id);
  await prisma.$executeRaw`UPDATE wallet_accounts SET balance = ${balance}::numeric WHERE "userId" = ${u.id} AND type = 'MAIN'`;
  return u;
}

beforeAll(seedPlan);
// resetData clears settings and the config cache, so each test starts with the
// deployed defaults and sets only what it is testing.
beforeEach(resetData);

describe('withholding tax', () => {
  it('deducts nothing when no rate is configured', async () => {
    const u = await member();
    const w = await requestWithdrawal(u.id, '100', ADDR);

    expect(Number(w.tax)).toBe(0);
    expect(Number(w.fee)).toBeCloseTo(5, 6);
    expect(Number(w.netAmount)).toBeCloseTo(95, 6);
  });

  it('withholds on the amount after the fee, not on the gross', async () => {
    await setRate('5');
    const u = await member();
    const w = await requestWithdrawal(u.id, '100', ADDR);

    // fee 5% of 100 = 5; tax 5% of the remaining 95 = 4.75
    expect(Number(w.fee)).toBeCloseTo(5, 6);
    expect(Number(w.tax)).toBeCloseTo(4.75, 6);
    expect(Number(w.netAmount)).toBeCloseTo(90.25, 6);
  });

  it('always reconciles: gross minus fee minus tax equals what is received', async () => {
    await setRate('7.5');
    const u = await member(5000);

    for (const amount of ['10', '100', '333.33', '1000']) {
      const w = await requestWithdrawal(u.id, amount, ADDR);
      const reconciled = Number(w.amount) - Number(w.fee) - Number(w.tax);
      expect(Number(w.netAmount)).toBeCloseTo(reconciled, 6);
    }
  });

  it('still debits the full gross from the member wallet', async () => {
    await setRate('5');
    const u = await member(500);
    await requestWithdrawal(u.id, '100', ADDR);

    // The member is debited what they asked to withdraw; the deductions come
    // out of what is sent, not out of a second charge.
    expect(await balanceOf(u.id)).toBeCloseTo(400, 6);
  });

  it('records the rate that applied, so a later change cannot rewrite history', async () => {
    await setRate('5');
    const u = await member();
    const w = await requestWithdrawal(u.id, '100', ADDR);

    await setRate('20');

    const stored = await prisma.withdrawal.findUniqueOrThrow({ where: { id: w.id } });
    expect(Number(stored.taxPercent)).toBeCloseTo(5, 6);
    expect(Number(stored.tax)).toBeCloseTo(4.75, 6);
  });

  it('the database refuses a row whose arithmetic does not add up', async () => {
    const u = await member();
    await expect(
      prisma.$executeRaw`
        INSERT INTO withdrawals (id, "userId", amount, fee, "feePercent", "taxPercent", tax, "netAmount",
                                 "walletAddress", reference, status, "slaDueAt", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, ${u.id}, 100, 5, 5, 5, 4.75, 95,
                ${ADDR}, ${'TX' + Date.now()}, 'PENDING'::"TxStatus", now(), now(), now())`,
    ).rejects.toThrow(/withdrawal_arithmetic/);
  });

  it('refuses a payout that withholding would reduce to nothing', async () => {
    await setRate('50');
    const u = await member();
    // The floor still applies first, so use an amount that clears it.
    const w = await requestWithdrawal(u.id, '100', ADDR);
    expect(Number(w.netAmount)).toBeCloseTo(47.5, 6);
  });
});

describe('annual summary', () => {
  it('reports what was withheld across the year', async () => {
    await setRate('10');
    const u = await member(5000);
    const w1 = await requestWithdrawal(u.id, '100', ADDR);
    const w2 = await requestWithdrawal(u.id, '200', ADDR);
    await prisma.withdrawal.updateMany({
      where: { id: { in: [w1.id, w2.id] } },
      data: { status: 'PROCESSED', processedAt: new Date() },
    });

    const summary = await taxSummary(u.id, new Date().getUTCFullYear());

    expect(summary.withdrawals.count).toBe(2);
    expect(Number(summary.withdrawals.gross)).toBeCloseTo(300, 6);
    expect(Number(summary.withdrawals.fees)).toBeCloseTo(15, 6);
    // 10% of (100−5) plus 10% of (200−10)
    expect(Number(summary.withdrawals.taxWithheld)).toBeCloseTo(9.5 + 19, 6);
    expect(Number(summary.withdrawals.received)).toBeCloseTo(300 - 15 - 28.5, 6);
  });

  it('counts only payouts that actually went out', async () => {
    await setRate('10');
    const u = await member(5000);
    await requestWithdrawal(u.id, '100', ADDR);   // still pending

    const summary = await taxSummary(u.id, new Date().getUTCFullYear());
    expect(summary.withdrawals.count).toBe(0);
  });
});
