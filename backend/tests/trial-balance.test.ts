import { describe, expect, it, beforeAll, beforeEach } from 'vitest';
import { prisma, resetData, seedPlan, makeUser } from './helpers.js';
import { purchase } from '../src/modules/investment/investment.service.js';
import { runDailyRoi } from '../src/jobs/daily-roi.job.js';
import { runTrialBalance } from '../src/jobs/trial-balance.job.js';
import { post } from '../src/core/ledger.js';
import { money } from '../src/core/money.js';

/**
 * The books have to balance, and something has to check.
 *
 * Every ledger entry records the balance it produced, so drift is detectable
 * by construction — and nothing ever looked. A balance moved without an entry,
 * or an entry written without the balance moving, would have sat undiscovered
 * until a member disputed a figure.
 *
 * These tests do the one thing that makes a reconciliation job trustworthy:
 * they break the books deliberately and check that it notices.
 */

const plan = (amount: string) => prisma.packagePlan.findFirstOrThrow({ where: { amount } });

beforeAll(seedPlan);
beforeEach(resetData);

/**
 * A funded member whose balance the ledger can actually account for.
 *
 * `makeUser({ funded })` sets the balance with a bare UPDATE and writes no
 * entry — fine for every other test, and exactly the drift this job is built
 * to report. So these tests deposit through the ledger instead, which is what
 * a real deposit does.
 */
async function funded(amount: number, opts: { sponsorId?: string } = {}) {
  const u = await makeUser(opts);
  await post({
    userId: u.id, walletType: 'FUND', direction: 'CREDIT', category: 'DEPOSIT',
    amount: money(amount), reference: `TB-FUND-${u.id}`, description: 'Deposit',
  });
  return u;
}

/** A member with real movement behind them: deposit, purchase, ROI, commission. */
async function active() {
  const sponsor = await funded(2_000);
  await purchase(sponsor.id, (await plan('1100')).id);

  const buyer = await funded(2_000, { sponsorId: sponsor.id });
  await purchase(buyer.id, (await plan('1100')).id);

  await runDailyRoi(new Date(Date.UTC(2026, 7, 17)));
  return { sponsor, buyer };
}

describe('trial balance', () => {
  it('passes on a platform whose money only ever moved through the ledger', async () => {
    await active();

    const result = await runTrialBalance();

    expect(result.drifted).toEqual([]);
    expect(result.totalDrift).toBe('0.00000000');
    expect(result.walletsChecked).toBeGreaterThan(0);
  });

  it('catches a balance credited without a ledger entry', async () => {
    const { buyer } = await active();

    // Exactly the shape of the bug this job exists to find: money appears in a
    // wallet with nothing in the ledger to explain it.
    await prisma.$executeRaw`
      UPDATE wallet_accounts SET balance = balance + 250
       WHERE "userId" = ${buyer.id} AND type = 'MAIN'`;

    const result = await runTrialBalance();

    expect(result.drifted).toHaveLength(1);
    expect(result.drifted[0].userId).toBe(buyer.id);
    expect(result.drifted[0].walletType).toBe('MAIN');
    expect(Number(result.drifted[0].difference)).toBeCloseTo(250, 6);
  });

  it('catches a balance quietly reduced behind the ledger', async () => {
    const { buyer } = await active();

    // FUND, not MAIN: the buyer's MAIN holds only a day of ROI, and the
    // `wallet_balance_non_negative` CHECK constraint rightly refuses to let a
    // test drive it below zero.
    await prisma.$executeRaw`
      UPDATE wallet_accounts SET balance = balance - 10
       WHERE "userId" = ${buyer.id} AND type = 'FUND'`;

    const result = await runTrialBalance();

    expect(result.drifted).toHaveLength(1);
    expect(Number(result.drifted[0].difference)).toBeCloseTo(-10, 6);
    expect(Number(result.totalDrift)).toBeCloseTo(10, 6);
  });

  it('catches a tampered running balance even when the totals still add up', async () => {
    const { buyer } = await active();

    // The sum of entries is untouched, but the newest entry now claims a
    // balance the wallet does not hold. A total-only check would miss this.
    const newest = await prisma.ledgerEntry.findFirstOrThrow({
      where: { userId: buyer.id }, orderBy: { createdAt: 'desc' },
    });
    await prisma.$executeRaw`
      UPDATE ledger_entries SET "balanceAfter" = "balanceAfter" + 5 WHERE id = ${newest.id}`;

    const result = await runTrialBalance();
    expect(result.drifted.length).toBeGreaterThanOrEqual(1);
  });

  it('does not report a brand new wallet that has never been used', async () => {
    await makeUser(); // three empty wallets, no entries
    const result = await runTrialBalance();
    expect(result.drifted).toEqual([]);
  });

  it('stays clean after a normal standalone credit', async () => {
    const u = await makeUser();
    await post({
      userId: u.id, walletType: 'MAIN', direction: 'CREDIT', category: 'ADJUSTMENT',
      amount: money(42.5), reference: `adj-${Date.now()}`, description: 'test',
    });

    expect((await runTrialBalance()).drifted).toEqual([]);
  });
});
