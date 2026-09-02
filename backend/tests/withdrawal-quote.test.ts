import { describe, expect, it, beforeAll, beforeEach } from 'vitest';
import { prisma, resetData, seedPlan, makeUser, verifyKyc } from './helpers.js';
import { invalidateConfig } from '../src/core/runtime-config.js';
import { quote, request as requestWithdrawal } from '../src/modules/withdrawal/withdrawal.service.js';

/**
 * What the member is quoted is what the member is paid.
 *
 * The withdrawal screen used to derive fee, withholding and net itself in
 * JavaScript floats, rounded half-up for display, while the server derived the
 * same figures in Decimal with ROUND_DOWN. Two implementations of one formula,
 * rounding in opposite directions, and only the browser's answer was ever
 * shown — so the figure the member agreed to was free to disagree with the
 * figure that settled.
 *
 * And a payout address is checked for shape but not for correctness: 40 hex
 * characters passes, so one wrong keystroke sends real money to an address
 * nobody controls. EIP-55 is the test that catches that.
 */

const ADDR = '0x1234567890AbcdEF1234567890aBcdef12345678';

const fundMain = (userId: string, amount: number) =>
  prisma.$executeRaw`UPDATE wallet_accounts SET balance = ${amount} WHERE "userId" = ${userId} AND type = 'MAIN'`;

const setRate = async (key: string, value: string) => {
  await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  invalidateConfig();
};

beforeAll(seedPlan);
beforeEach(resetData);

describe('withdrawal quote', () => {
  it('matches the amounts actually recorded, to the last decimal', async () => {
    // A deliberately awkward amount: 5% of 1234.56 is 61.728, which floats and
    // Decimal round differently once you format it.
    const u = await makeUser();
    await verifyKyc(u.id);
    await fundMain(u.id, 5_000);

    const q = await quote('1234.56');
    // Over the TOTP threshold, so the stronger step-up is what a real client sends.
    const w = await requestWithdrawal(u.id, '1234.56', ADDR, undefined, 'totp');

    expect(w.fee.toString()).toBe(q.fee);
    expect(w.tax.toString()).toBe(q.tax);
    expect(w.netAmount.toString()).toBe(q.net);
  });

  it('agrees with the settled figures once withholding is switched on too', async () => {
    await setRate('TAX_WITHHOLDING_PERCENT', '7.5');

    const u = await makeUser();
    await verifyKyc(u.id);
    await fundMain(u.id, 5_000);

    const q = await quote('999.99');
    const w = await requestWithdrawal(u.id, '999.99', ADDR, undefined, 'password');

    expect(q.taxPercent).toBe(7.5);
    expect(Number(q.tax)).toBeGreaterThan(0);
    expect(w.fee.toString()).toBe(q.fee);
    expect(w.tax.toString()).toBe(q.tax);
    expect(w.netAmount.toString()).toBe(q.net);
  });

  it('holds across a spread of amounts', async () => {
    const u = await makeUser();
    await verifyKyc(u.id);
    await fundMain(u.id, 50_000);

    for (const amount of ['10', '10.01', '33.33', '100', '787.77', '4999.99']) {
      const q = await quote(amount);
      // `totp` throughout: it satisfies the step-up tier at every amount.
      const w = await requestWithdrawal(u.id, amount, ADDR, undefined, 'totp');
      expect(`${amount}: ${w.netAmount.toString()}`).toBe(`${amount}: ${q.net}`);
    }
  });

  it('refuses a quote for a non-positive amount', async () => {
    await expect(quote('0')).rejects.toThrow(/positive/i);
    await expect(quote('-5')).rejects.toThrow(/positive/i);
  });
});

describe('payout address validation', () => {
  const valid = async () => {
    const u = await makeUser();
    await verifyKyc(u.id);
    await fundMain(u.id, 1_000);
    return u;
  };

  it('accepts a correctly checksummed address and stores that form', async () => {
    const u = await valid();
    const w = await requestWithdrawal(u.id, '100', ADDR, undefined, 'password');
    expect(w.walletAddress).toBe(ADDR);
  });

  it('accepts an all-lowercase address, which carries no checksum to check', async () => {
    const u = await valid();
    const w = await requestWithdrawal(u.id, '100', ADDR.toLowerCase(), undefined, 'password');
    // Stored in its checksummed form, so the operator sees a canonical address.
    expect(w.walletAddress).toBe(ADDR);
  });

  it('refuses a mixed-case address whose checksum does not match', async () => {
    const u = await valid();
    // One character's case flipped — still 40 hex characters, so the old regex
    // waved it through and the money would have gone nowhere recoverable.
    const typo = '0x1234567890AbcdEF1234567890aBcdef12345679';
    await expect(requestWithdrawal(u.id, '100', typo, undefined, 'password'))
      .rejects.toThrow(/checksum/i);
  });

  it('still refuses anything that is not an address at all', async () => {
    const u = await valid();
    await expect(requestWithdrawal(u.id, '100', 'my-wallet', undefined, 'password'))
      .rejects.toThrow(/Invalid BEP-20/);
    await expect(requestWithdrawal(u.id, '100', '0x1234', undefined, 'password'))
      .rejects.toThrow(/Invalid BEP-20/);
  });
});
