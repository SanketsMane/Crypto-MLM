import { describe, expect, it, beforeAll, beforeEach } from 'vitest';
import { prisma, resetData, seedPlan, makeUser } from './helpers.js';
import { invalidateConfig } from '../src/core/runtime-config.js';
import { request as requestWithdrawal } from '../src/modules/withdrawal/withdrawal.service.js';

/**
 * The verification threshold is cumulative.
 *
 * It used to weigh the single request in hand against `KYC_REQUIRED_ABOVE`,
 * with no rolling total behind it. With the threshold at $1,000 an unverified
 * member could withdraw $999 five times in an hour and move $4,995 without
 * ever submitting a document. That is structuring, and it is precisely the
 * pattern a threshold exists to catch.
 */

const ADDR = '0x' + 'b'.repeat(40);

const fundMain = (userId: string, amount: number) =>
  prisma.$executeRaw`UPDATE wallet_accounts SET balance = ${amount} WHERE "userId" = ${userId} AND type = 'MAIN'`;

const setThreshold = async (value: number) => {
  await prisma.setting.upsert({
    where: { key: 'KYC_REQUIRED_ABOVE' },
    create: { key: 'KYC_REQUIRED_ABOVE', value: String(value) },
    update: { value: String(value) },
  });
  invalidateConfig();
};

const approveKyc = (userId: string) =>
  prisma.kycSubmission.create({
    data: { userId, fullName: 'A', documentNo: 'X', countryCode: 'IN', status: 'APPROVED' },
  });

beforeAll(seedPlan);
beforeEach(resetData);

describe('unverified withdrawal threshold', () => {
  it('adds up repeated sub-threshold withdrawals and stops the one that crosses', async () => {
    await setThreshold(1_000);
    const u = await makeUser();
    await fundMain(u.id, 5_000);

    // Four at $300 — $1,200 in total, so the fourth is the one that crosses.
    await expect(requestWithdrawal(u.id, '300', ADDR, undefined, 'password')).resolves.toBeTruthy(); // 300
    await expect(requestWithdrawal(u.id, '300', ADDR, undefined, 'password')).resolves.toBeTruthy(); // 600
    await expect(requestWithdrawal(u.id, '300', ADDR, undefined, 'password')).resolves.toBeTruthy(); // 900
    await expect(requestWithdrawal(u.id, '300', ADDR, undefined, 'password')).rejects.toThrow(/Verify your identity/); // 1200

    // Three got through, and the fourth moved nothing.
    expect(await prisma.withdrawal.count({ where: { userId: u.id } })).toBe(3);
  });

  it('lands exactly on the threshold without tripping it', async () => {
    await setThreshold(1_000);
    const u = await makeUser();
    await fundMain(u.id, 5_000);

    await expect(requestWithdrawal(u.id, '600', ADDR, undefined, 'password')).resolves.toBeTruthy();
    await expect(requestWithdrawal(u.id, '400', ADDR, undefined, 'password')).resolves.toBeTruthy(); // exactly 1,000
    // $10 is the minimum withdrawal, so this is the smallest request that can cross.
    await expect(requestWithdrawal(u.id, '10', ADDR, undefined, 'password')).rejects.toThrow(/Verify your identity/);
  });

  it('does not count refunded requests against the member', async () => {
    await setThreshold(1_000);
    const u = await makeUser();
    await fundMain(u.id, 5_000);

    const first = await requestWithdrawal(u.id, '900', ADDR, undefined, 'password');

    // Rejected means the money came back, so no value left the platform and it
    // must not consume the member's unverified allowance.
    await prisma.withdrawal.update({ where: { id: first.id }, data: { status: 'REJECTED' } });

    await expect(requestWithdrawal(u.id, '900', ADDR, undefined, 'password')).resolves.toBeTruthy();
  });

  it('stops applying once the member is verified', async () => {
    await setThreshold(1_000);
    const u = await makeUser();
    await fundMain(u.id, 5_000);
    await approveKyc(u.id);

    await expect(requestWithdrawal(u.id, '900', ADDR, undefined, 'password')).resolves.toBeTruthy();
    await expect(requestWithdrawal(u.id, '900', ADDR, undefined, 'password')).resolves.toBeTruthy();
    await expect(requestWithdrawal(u.id, '900', ADDR, undefined, 'password')).resolves.toBeTruthy();
  });

  it('verifies everyone when no threshold is set — the safe default', async () => {
    const u = await makeUser();
    await fundMain(u.id, 5_000);
    await expect(requestWithdrawal(u.id, '10', ADDR, undefined, 'password')).rejects.toThrow(/Verify your identity/);
  });
});
