import { describe, expect, it, beforeEach } from 'vitest';
import { prisma } from '../src/core/db.js';
import * as withdrawal from '../src/modules/withdrawal/withdrawal.service.js';
import { resetData, seedPlan, makeUser, balanceOf } from './helpers.js';

/**
 * Concurrency on the way out.
 *
 * A withdrawal is decided once. Two operators opening the same queue and
 * clicking at the same moment must not produce two refunds or two payouts —
 * and the idempotency middleware does not help here, because each operator
 * sends a different key.
 */

async function pendingWithdrawal(amount = 100) {
  const u = await makeUser();
  await prisma.$executeRaw`
    UPDATE wallet_accounts SET balance = 1000 WHERE "userId" = ${u.id} AND type = 'MAIN'`;
  const w = await withdrawal.request(u.id, String(amount), '0x' + 'a'.repeat(40), undefined, 'password');
  return { user: u, w };
}

beforeEach(async () => {
  await resetData();
  await seedPlan();
  await prisma.setting.deleteMany({});
  // verification off, so these tests are about concurrency and nothing else
  await prisma.setting.create({ data: { key: 'KYC_REQUIRED_FOR_WITHDRAWAL', value: 'false' } });
  const { invalidateConfig } = await import('../src/core/runtime-config.js');
  invalidateConfig();
});

describe('rejecting twice', () => {
  it('refunds once, even when two rejections land together', async () => {
    const { user, w } = await pendingWithdrawal(100);
    const before = await balanceOf(user.id, 'MAIN'); // already debited

    const results = await Promise.allSettled([
      withdrawal.reject(w.id, 'first'),
      withdrawal.reject(w.id, 'second'),
    ]);

    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const after = await balanceOf(user.id, 'MAIN');

    expect(ok).toBe(1);                    // exactly one may win
    expect(after).toBeCloseTo(before + 100, 6); // refunded once, not twice

    const refunds = await prisma.ledgerEntry.count({
      where: { userId: user.id, category: 'REFUND' },
    });
    expect(refunds).toBe(1);
  });
});

describe('approving twice', () => {
  it('processes once, even when two approvals land together', async () => {
    const { w } = await pendingWithdrawal(100);

    const results = await Promise.allSettled([
      withdrawal.approve(w.id, '0xhash1'),
      withdrawal.approve(w.id, '0xhash2'),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled').length).toBe(1);
    const after = await prisma.withdrawal.findUniqueOrThrow({ where: { id: w.id } });
    expect(after.status).toBe('PROCESSED');
  });

  it('cannot approve one that was already rejected', async () => {
    const { w } = await pendingWithdrawal(100);
    await withdrawal.reject(w.id, 'no');
    await expect(withdrawal.approve(w.id)).rejects.toThrow(/not pending/i);
  });

  it('cannot reject one that was already processed', async () => {
    const { w } = await pendingWithdrawal(100);
    await withdrawal.approve(w.id);
    await expect(withdrawal.reject(w.id, 'late')).rejects.toThrow(/not pending/i);
  });
});
