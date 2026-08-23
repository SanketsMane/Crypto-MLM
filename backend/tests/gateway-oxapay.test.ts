import { describe, expect, it, beforeEach, beforeAll } from 'vitest';
import crypto from 'node:crypto';
import { prisma } from '../src/core/db.js';
import * as oxapay from '../src/core/gateway/oxapay.js';
import * as gateway from '../src/core/gateway/gateway.service.js';
import * as deposits from '../src/modules/deposit/deposit.service.js';
import { resetData, makeUser, balanceOf } from './helpers.js';

/**
 * The payment gateway.
 *
 * A webhook endpoint is the one part of the platform that is unauthenticated
 * and credits money, so the signature check is the whole security boundary.
 * These tests hold that boundary and the replay behaviour behind it.
 */

const MERCHANT = 'test-merchant-key';
const PAYOUT = 'test-payout-key';

beforeAll(() => {
  process.env.OXAPAY_ENABLED = 'true';
  process.env.OXAPAY_MERCHANT_KEY = MERCHANT;
  process.env.OXAPAY_PAYOUT_KEY = PAYOUT;
  process.env.OXAPAY_CALLBACK_BASE = 'https://example.test';
});

const sign = (body: string, key: string) =>
  crypto.createHmac('sha512', key).update(body).digest('hex');

/** A deposit that already has an invoice against it. */
async function invoiced(amount = 500, trackId = `trk-${Math.random().toString(36).slice(2)}`) {
  const u = await makeUser();
  const dep = await deposits.create(u.id, String(amount));
  await prisma.deposit.update({
    where: { id: dep.id },
    data: { gatewayTrackId: trackId, gatewayStatus: 'waiting', paymentUrl: 'https://pay.test/x' },
  });
  return { user: u, deposit: dep, trackId };
}

const paymentBody = (trackId: string, status: string, amount = 500) => JSON.stringify({
  track_id: trackId, status, type: 'payment', amount, currency: 'USD',
  txs: [{ tx_hash: '0xabc123', network: 'BSC', confirmations: 12 }],
});

beforeEach(async () => { await resetData(); });

describe('signature verification', () => {
  it('accepts a correctly signed payload', () => {
    const body = paymentBody('t1', 'paid');
    expect(oxapay.verifySignature(body, sign(body, MERCHANT), 'payment')).toBe(true);
  });

  it('rejects a payload signed with the wrong key', () => {
    const body = paymentBody('t1', 'paid');
    expect(oxapay.verifySignature(body, sign(body, 'not-the-key'), 'payment')).toBe(false);
  });

  it('rejects a payment signed with the PAYOUT key', () => {
    // the two credentials must not be interchangeable
    const body = paymentBody('t1', 'paid');
    expect(oxapay.verifySignature(body, sign(body, PAYOUT), 'payment')).toBe(false);
  });

  it('rejects a tampered body', () => {
    const body = paymentBody('t1', 'paid', 500);
    const sig = sign(body, MERCHANT);
    const tampered = paymentBody('t1', 'paid', 500_000);
    expect(oxapay.verifySignature(tampered, sig, 'payment')).toBe(false);
  });

  it('rejects a missing or malformed header', () => {
    const body = paymentBody('t1', 'paid');
    expect(oxapay.verifySignature(body, undefined, 'payment')).toBe(false);
    expect(oxapay.verifySignature(body, '', 'payment')).toBe(false);
    expect(oxapay.verifySignature(body, 'deadbeef', 'payment')).toBe(false);
  });
});

describe('status mapping', () => {
  it('treats only paid and manual_accept as money received', () => {
    expect(oxapay.paymentOutcome('paid')).toBe('paid');
    expect(oxapay.paymentOutcome('manual_accept')).toBe('paid');
    expect(oxapay.paymentOutcome('underpaid')).toBe('underpaid');
    expect(oxapay.paymentOutcome('expired')).toBe('dead');
    for (const s of ['new', 'waiting', 'paying']) expect(oxapay.paymentOutcome(s)).toBe('pending');
  });

  it('treats only confirmed as a completed payout', () => {
    expect(oxapay.payoutOutcome('confirmed')).toBe('confirmed');
    expect(oxapay.payoutOutcome('rejected')).toBe('failed');
    expect(oxapay.payoutOutcome('canceled')).toBe('failed');
    for (const s of ['processing', 'pending', 'confirming']) expect(oxapay.payoutOutcome(s)).toBe('pending');
  });
});

describe('handling a payment callback', () => {
  it('credits the fund wallet when the invoice is paid', async () => {
    const { user, trackId } = await invoiced(500);
    const body = paymentBody(trackId, 'paid');

    const r = await gateway.handleCallback('payment', body, sign(body, MERCHANT));
    expect(r.ok).toBe(true);
    expect(await balanceOf(user.id, 'FUND')).toBeCloseTo(500, 6);
  });

  it('credits nothing when the signature is wrong', async () => {
    const { user, trackId } = await invoiced(500);
    const body = paymentBody(trackId, 'paid');

    const r = await gateway.handleCallback('payment', body, sign(body, 'forged'));
    expect(r.ok).toBe(false);
    expect(await balanceOf(user.id, 'FUND')).toBeCloseTo(0, 6);
  });

  it('credits once when the same callback is replayed', async () => {
    const { user, trackId } = await invoiced(500);
    const body = paymentBody(trackId, 'paid');
    const sig = sign(body, MERCHANT);

    await gateway.handleCallback('payment', body, sig);
    await gateway.handleCallback('payment', body, sig);
    await gateway.handleCallback('payment', body, sig);

    expect(await balanceOf(user.id, 'FUND')).toBeCloseTo(500, 6);
    expect(await prisma.ledgerEntry.count({ where: { userId: user.id, category: 'DEPOSIT' } })).toBe(1);
  });

  it('ignores the amount in the payload and credits our own figure', async () => {
    const { user, trackId } = await invoiced(500);
    // a forged-but-correctly-signed payload claiming far more
    const body = paymentBody(trackId, 'paid', 999_999);

    await gateway.handleCallback('payment', body, sign(body, MERCHANT));
    expect(await balanceOf(user.id, 'FUND')).toBeCloseTo(500, 6);
  });

  it('does not credit while the invoice is still being paid', async () => {
    const { user, trackId } = await invoiced(500);
    for (const s of ['new', 'waiting', 'paying']) {
      const body = paymentBody(trackId, s);
      await gateway.handleCallback('payment', body, sign(body, MERCHANT));
    }
    expect(await balanceOf(user.id, 'FUND')).toBeCloseTo(0, 6);
  });

  it('does not credit an underpaid invoice', async () => {
    const { user, trackId } = await invoiced(500);
    const body = paymentBody(trackId, 'underpaid');
    await gateway.handleCallback('payment', body, sign(body, MERCHANT));
    expect(await balanceOf(user.id, 'FUND')).toBeCloseTo(0, 6);
  });

  it('ignores a callback for an invoice we never raised', async () => {
    const body = paymentBody('never-seen', 'paid');
    const r = await gateway.handleCallback('payment', body, sign(body, MERCHANT));
    expect(r.applied).toBe(false);
  });
});

describe('the event log', () => {
  it('records the callback even when the signature fails', async () => {
    const { trackId } = await invoiced(500);
    const body = paymentBody(trackId, 'paid');
    await gateway.handleCallback('payment', body, sign(body, 'forged'));

    const ev = await prisma.gatewayEvent.findFirst({ where: { trackId }, orderBy: { createdAt: 'desc' } });
    expect(ev).not.toBeNull();
    expect(ev!.verified).toBe(false);
    expect(ev!.applied).toBe(false);
  });

  it('records a malformed body without throwing', async () => {
    const r = await gateway.handleCallback('payment', 'not json at all', 'x');
    expect(r.ok).toBe(false);
    expect(await prisma.gatewayEvent.count({ where: { status: 'unparseable' } })).toBe(1);
  });
});
