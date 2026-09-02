import { describe, expect, it, beforeAll, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { prisma, resetData, seedPlan, makeUser, balanceOf, verifyKyc } from './helpers.js';
import * as gateway from '../src/core/gateway/gateway.service.js';
import { request as requestWithdrawal, approve } from '../src/modules/withdrawal/withdrawal.service.js';
import { runOpsWatch } from '../src/jobs/ops-watch.job.js';

/**
 * A payout the gateway refuses must give the money back.
 *
 * `payoutOutcome` has always classified `canceled` / `rejected` as failed, and
 * nothing consumed that verdict: the withdrawal stayed PROCESSED, the member
 * stayed debited, no refund was posted, and no dashboard showed it — ops-watch
 * inspected on-chain payouts only and the overdue query filters on PENDING.
 * The member had lost the money and the platform did not know.
 */

const PAYOUT = 'test-payout-key';

beforeAll(async () => {
  process.env.OXAPAY_ENABLED = 'true';
  process.env.OXAPAY_MERCHANT_KEY = 'test-merchant-key';
  process.env.OXAPAY_PAYOUT_KEY = PAYOUT;
  process.env.OXAPAY_CALLBACK_BASE = 'https://example.test';
  await seedPlan();
});

beforeEach(resetData);

const sign = (body: string) => crypto.createHmac('sha512', PAYOUT).update(body).digest('hex');

const payoutBody = (trackId: string, status: string) =>
  JSON.stringify({ track_id: trackId, status, type: 'payout' });

/** A member with an approved withdrawal already handed to the gateway. */
async function approvedPayout(amount = 200) {
  const u = await makeUser();
  await verifyKyc(u.id);
  await prisma.$executeRaw`
    UPDATE wallet_accounts SET balance = 1000 WHERE "userId" = ${u.id} AND type = 'MAIN'`;

  const w = await requestWithdrawal(u.id, String(amount), '0x' + 'a'.repeat(40), undefined, 'password');
  await approve(w.id);

  const trackId = `pay-${Math.random().toString(36).slice(2)}`;
  await prisma.withdrawal.update({
    where: { id: w.id },
    data: { gatewayTrackId: trackId, gatewayStatus: 'accepted' },
  });
  return { user: u, withdrawal: w, trackId, amount };
}

describe('gateway payout failure', () => {
  it('refunds the member in full and marks the withdrawal FAILED', async () => {
    const { user, withdrawal, trackId, amount } = await approvedPayout(200);

    const afterDebit = await balanceOf(user.id, 'MAIN');
    expect(Number(afterDebit)).toBe(800); // 1000 − 200, debited at request time

    const body = payoutBody(trackId, 'rejected');
    const result = await gateway.handleCallback('payout', body, sign(body));
    expect(result.ok).toBe(true);

    // The FULL amount comes back — fee included. The member is no worse off for
    // an approval the platform could not deliver.
    expect(Number(await balanceOf(user.id, 'MAIN'))).toBe(1000);

    const row = await prisma.withdrawal.findUniqueOrThrow({ where: { id: withdrawal.id } });
    expect(row.status).toBe('FAILED');
    expect(row.rejectReason).toMatch(/rejected/i);

    const refund = await prisma.ledgerEntry.findFirstOrThrow({
      where: { userId: user.id, category: 'REFUND' },
    });
    expect(Number(refund.amount)).toBe(amount);
  });

  it('a callback delivered twice refunds exactly once', async () => {
    const { user, trackId } = await approvedPayout(200);

    const body = payoutBody(trackId, 'canceled');
    await gateway.handleCallback('payout', body, sign(body));
    await gateway.handleCallback('payout', body, sign(body));

    expect(Number(await balanceOf(user.id, 'MAIN'))).toBe(1000);
    expect(await prisma.ledgerEntry.count({ where: { userId: user.id, category: 'REFUND' } })).toBe(1);
  });

  it('an unsigned failure callback changes nothing', async () => {
    const { user, withdrawal, trackId } = await approvedPayout(200);

    const body = payoutBody(trackId, 'rejected');
    const result = await gateway.handleCallback('payout', body, 'deadbeef');

    expect(result.ok).toBe(false);
    expect(Number(await balanceOf(user.id, 'MAIN'))).toBe(800);
    expect((await prisma.withdrawal.findUniqueOrThrow({ where: { id: withdrawal.id } })).status)
      .toBe('PROCESSED');
  });

  it('a confirmed payout is left alone', async () => {
    const { user, withdrawal, trackId } = await approvedPayout(200);

    const body = JSON.stringify({ track_id: trackId, status: 'confirmed', type: 'payout', tx_hash: '0xfeed' });
    await gateway.handleCallback('payout', body, sign(body));

    expect(Number(await balanceOf(user.id, 'MAIN'))).toBe(800); // stays debited
    expect((await prisma.withdrawal.findUniqueOrThrow({ where: { id: withdrawal.id } })).status)
      .toBe('PROCESSED');
  });

  it('ops-watch reports a payout stuck at the gateway', async () => {
    const { withdrawal } = await approvedPayout(200);

    // Nothing to report while it is still within the settlement window.
    expect((await runOpsWatch()).stalledGatewayPayouts).toBe(0);

    // Age it past the window: approved, handed over, never confirmed.
    await prisma.withdrawal.update({
      where: { id: withdrawal.id },
      data: { processedAt: new Date(Date.now() - 12 * 3_600_000) },
    });

    expect((await runOpsWatch()).stalledGatewayPayouts).toBe(1);
  });
});
