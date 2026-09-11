import { prisma } from '../db.js';
import { money } from '../money.js';
import { logger } from '../logger.js';
import { badRequest, notFound, AppError } from '../errors.js';
import { env } from '../../config/env.js';
import * as oxapay from './oxapay.js';
import * as nowpayments from './nowpayments.js';
import * as deposits from '../../modules/deposit/deposit.service.js';
import * as activity from '../activity.js';
import { notifyAdmins, notifyMember } from '../notify.js';
import * as withdrawals from '../../modules/withdrawal/withdrawal.service.js';

/**
 * The bridge between OxaPay and our ledger.
 *
 * Two rules hold everything here together:
 *
 *  1. A callback is evidence, not instruction. It is recorded first, verified,
 *     then matched against a record WE created. Nothing is credited because a
 *     payload said so — only because an invoice we raised was paid.
 *
 *  2. Amounts come from our own record, never from the callback. A gateway that
 *     is compromised, or a payload that is replayed with an edited figure, must
 *     not be able to choose how much a member is credited.
 */

const callbackUrl = (kind: 'payment' | 'payout') => {
  const base = env.OXAPAY_CALLBACK_BASE?.replace(/\/$/, '');
  if (!base) throw new AppError('OXAPAY_CALLBACK_BASE is not set', 503, 'GATEWAY_UNAVAILABLE');
  return `${base}/api/v1/gateway/oxapay/${kind}`;
};

/* ── money in ─────────────────────────────────────────────────────────────── */

/**
 * Raise an invoice for a member's deposit.
 *
 * The deposit row is created first and its id becomes the gateway's
 * `order_id`, so the callback can find it without trusting anything else in
 * the payload. If the gateway then refuses, the row is removed rather than
 * left as a phantom PENDING deposit an operator would later have to explain.
 */
/**
 * Which checkout raises the invoice.
 *
 * Named outright by `DEPOSIT_GATEWAY`; inferred when unset so a deployment with
 * one provider configured needs nothing. With BOTH configured and neither named
 * this refuses rather than picking — the same reasoning as the payout rail. The
 * consequence here is milder than a double payout, but a member sent to a
 * checkout whose callbacks the other provider's verifier will reject pays real
 * money into a deposit that can never be credited.
 */
export type DepositGateway = 'nowpayments' | 'oxapay';

export function depositGateway(): { provider: DepositGateway | null; reasons: string[] } {
  const now = nowpayments.state();
  const oxa = oxapay.gatewayState();
  const named = process.env.DEPOSIT_GATEWAY?.trim().toLowerCase();

  if (named === 'nowpayments') {
    return now.canCharge
      ? { provider: 'nowpayments', reasons: [] }
      : { provider: null, reasons: now.reasons };
  }
  if (named === 'oxapay') {
    return oxa.canCharge
      ? { provider: 'oxapay', reasons: [] }
      : { provider: null, reasons: oxa.reasons };
  }

  if (now.canCharge && oxa.canCharge) {
    return {
      provider: null,
      reasons: ['Both NOWPayments and OxaPay are configured and DEPOSIT_GATEWAY does not say which to use.'],
    };
  }
  if (now.canCharge) return { provider: 'nowpayments', reasons: [] };
  if (oxa.canCharge) return { provider: 'oxapay', reasons: [] };
  return { provider: null, reasons: [...now.reasons, ...oxa.reasons] };
}

/** Public origin a gateway calls back to. */
const nowCallbackUrl = () => {
  const base = (env.NOWPAYMENTS_CALLBACK_BASE || env.WEB_URL || '').replace(/\/$/, '');
  if (!base) throw new AppError('NOWPAYMENTS_CALLBACK_BASE is not set', 503, 'GATEWAY_UNAVAILABLE');
  return `${base}/api/v1/gateway/nowpayments/ipn`;
};

export async function startDeposit(userId: string, amount: string, email?: string) {
  const chosen = depositGateway();
  if (!chosen.provider) {
    throw new AppError(
      `Card and crypto deposits are unavailable right now (${chosen.reasons.join('; ')})`,
      503, 'GATEWAY_UNAVAILABLE',
    );
  }

  const value = money(amount);
  if (value.lte(0)) throw badRequest('Amount must be positive');

  const deposit = await deposits.create(userId, value.toString());

  try {
    const invoice = chosen.provider === 'nowpayments'
      ? await nowpayments.createInvoice({
          amount: Number(value.toString()),
          orderId: deposit.id,
          callbackUrl: nowCallbackUrl(),
          returnUrl: env.WEB_URL ? `${env.WEB_URL}/wallet` : undefined,
          description: `FortuneX deposit ${deposit.reference}`,
        }).then((i) => ({ ...i, expiresAt: null as Date | null }))
      : await oxapay.createInvoice({
          amount: Number(value.toString()),
          orderId: deposit.id,
          callbackUrl: callbackUrl('payment'),
          returnUrl: env.WEB_URL ? `${env.WEB_URL}/wallet` : undefined,
          email,
          description: `FortuneX deposit ${deposit.reference}`,
        });

    return prisma.deposit.update({
      where: { id: deposit.id },
      data: {
        gatewayTrackId: invoice.trackId,
        gatewayStatus: 'new',
        paymentUrl: invoice.paymentUrl,
        expiresAt: invoice.expiresAt,
      },
    });
  } catch (err) {
    // No invoice means nothing can ever pay this row.
    await prisma.deposit.delete({ where: { id: deposit.id } }).catch(() => undefined);
    throw err;
  }
}

/* ── money out ────────────────────────────────────────────────────────────── */

/**
 * Hand an approved withdrawal to the gateway.
 *
 * Called after the withdrawal has already been marked PROCESSED, so a gateway
 * failure leaves an approved-but-unsent payout for an operator to retry rather
 * than silently reversing a decision they made.
 */
export async function sendPayout(withdrawalId: string) {
  const state = oxapay.gatewayState();
  if (!state.canPay) {
    logger.warn({ withdrawalId, reasons: state.reasons }, 'payout gateway unavailable — staying manual');
    return null;
  }

  const w = await prisma.withdrawal.findUnique({ where: { id: withdrawalId } });
  if (!w) throw notFound('Withdrawal not found');
  if (w.gatewayTrackId) return w; // already handed over

  const handle = await oxapay.createPayout({
    address: w.walletAddress,
    amount: Number(w.netAmount.toString()),
    currency: 'USDT',
    network: w.network === 'BEP20' ? 'BSC' : undefined,
    callbackUrl: callbackUrl('payout'),
    description: `FortuneX withdrawal ${w.reference}`,
  });

  return prisma.withdrawal.update({
    where: { id: withdrawalId },
    data: { gatewayTrackId: handle.trackId, gatewayStatus: handle.status },
  });
}

/* ── callbacks ────────────────────────────────────────────────────────────── */

export interface CallbackResult {
  ok: boolean;
  applied: boolean;
  reason: string;
}

/**
 * Handle one webhook.
 *
 * Records it whatever happens — including when the signature fails, because a
 * run of failed verifications is the only warning that someone is probing the
 * endpoint.
 */
export async function handleCallback(
  kind: oxapay.CallbackType,
  raw: Buffer | string,
  signature: string | undefined,
): Promise<CallbackResult> {
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8'));
  } catch {
    await record(kind, 'unparseable', 'unknown', false, { raw: String(raw).slice(0, 2000) }, false);
    return { ok: false, applied: false, reason: 'malformed body' };
  }

  const trackId = String(payload.track_id ?? '');
  const status = String(payload.status ?? '');
  const verified = oxapay.verifySignature(raw, signature, kind);

  if (!verified) {
    await record(kind, status, trackId, false, payload, false);
    logger.warn({ kind, trackId }, 'gateway callback failed signature verification');
    return { ok: false, applied: false, reason: 'bad signature' };
  }

  const applied = kind === 'payment'
    ? await applyPayment(trackId, status, payload, oxapay.paymentOutcome(status))
    : await applyPayout(trackId, status, payload);

  await record(kind, status, trackId, true, payload, applied);
  return { ok: true, applied, reason: applied ? 'applied' : 'no change' };
}

const record = (
  kind: string, status: string, trackId: string,
  verified: boolean, payload: unknown, applied: boolean,
) =>
  prisma.gatewayEvent.create({
    data: { kind, status, trackId, verified, applied, payload: payload as never },
  }).catch((cause) => { logger.error({ cause }, 'could not record gateway event'); });

/**
 * The outcome is passed in rather than derived here.
 *
 * Two gateways describe the same journey with different words — OxaPay says
 * `paid`, NOWPayments says `finished` — and only the provider module knows
 * which of its own statuses mean the money is actually ours. Mapping them here
 * would put that knowledge in the one place that must stay provider-agnostic,
 * and the failure mode is crediting a wallet on a status that can still fail.
 */
type PaymentOutcome = 'paid' | 'underpaid' | 'dead' | 'pending';

async function applyPayment(
  trackId: string,
  status: string,
  payload: Record<string, unknown>,
  outcome: PaymentOutcome,
): Promise<boolean> {
  if (!trackId) return false;

  const deposit = await prisma.deposit.findUnique({ where: { gatewayTrackId: trackId } });
  if (!deposit) {
    logger.warn({ trackId }, 'payment callback for an unknown invoice');
    return false;
  }

  await prisma.deposit.update({ where: { id: deposit.id }, data: { gatewayStatus: status } });

  switch (outcome) {
    case 'paid': {
      if (deposit.status === 'PROCESSED') return false; // replay
      const txHash = firstTxHash(payload);
      if (txHash) {
        await prisma.deposit.update({ where: { id: deposit.id }, data: { txHash } }).catch(() => undefined);
      }
      /* Credited from OUR record. The callback says it was paid; it does not
         get to say how much. */
      await deposits.confirm(deposit.id);
      return true;
    }
    case 'underpaid': {
      // Deliberately not credited: an operator decides, because the shortfall
      // and the fee split are a judgement call.
      notifyMember({
        userId: deposit.userId,
        type: 'deposit.rejected',
        dedupeKey: `deposit-underpaid:${deposit.id}`,
        title: 'Deposit was short',
        body: `Your payment for $${deposit.amount.toString()} arrived short of the invoice. Support will be in touch.`,
        meta: { depositId: deposit.id },
      });
      activity.record({
        userId: deposit.userId, event: 'DEPOSIT_CREATED',
        summary: `Deposit of $${deposit.amount.toString()} was underpaid and is awaiting review`,
      });
      return true;
    }
    case 'dead':
      return true; // status stored; nothing to credit
    default:
      return false; // new / waiting / paying
  }
}

async function applyPayout(trackId: string, status: string, payload: Record<string, unknown>): Promise<boolean> {
  if (!trackId) return false;

  const w = await prisma.withdrawal.findUnique({ where: { gatewayTrackId: trackId } });
  if (!w) {
    logger.warn({ trackId }, 'payout callback for an unknown payout');
    return false;
  }

  const txHash = typeof payload.tx_hash === 'string' ? payload.tx_hash : undefined;
  await prisma.withdrawal.update({
    where: { id: w.id },
    data: { gatewayStatus: status, ...(txHash ? { txHash } : {}) },
  });

  const outcome = oxapay.payoutOutcome(status);

  if (outcome === 'confirmed' && txHash) {
    notifyMember({
      userId: w.userId,
      type: 'withdrawal.sent',
      dedupeKey: `withdrawal-onchain:${w.id}`,
      title: 'Withdrawal sent',
      body: `$${w.netAmount.toString()} has been sent. Transaction ${txHash.slice(0, 10)}…`,
      meta: { withdrawalId: w.id, txHash },
    });
    return true;
  }

  /**
   * The gateway refused to send it.
   *
   * `payoutOutcome` has always computed this, and until now nothing consumed
   * it: the withdrawal stayed PROCESSED, the member stayed debited and no
   * alert fired anywhere. `ops-watch` inspects on-chain payouts only, and the
   * overdue query filters on PENDING, so a payout stuck this way was invisible
   * to every dashboard the operator has. The member had lost the money and the
   * platform did not know.
   */
  if (outcome === 'failed') {
    const reason = `Gateway reported the payout as ${status}`;
    const refunded = await withdrawals.markPayoutFailed(w.id, reason);

    // Null means a duplicate callback — the first one already refunded it.
    if (refunded) {
      logger.error(
        { withdrawalId: w.id, reference: w.reference, status, amount: w.amount.toString() },
        'gateway payout failed — member refunded in full',
      );

      notifyMember({
        userId: w.userId,
        type: 'withdrawal.rejected',
        dedupeKey: `withdrawal-gwfail:${w.id}`,
        title: 'Withdrawal could not be sent',
        body: `Your $${w.amount.toString()} withdrawal could not be delivered by the payment provider, `
            + 'and the full amount has been returned to your wallet. You can request it again, '
            + 'or contact support if it keeps happening.',
        meta: { withdrawalId: w.id, amount: w.amount.toString(), reason },
      });

      notifyAdmins({
        type: 'system.payout_failed',
        dedupeKey: `gateway-payout-failed:${w.id}`,
        title: `Gateway payout failed — $${w.amount.toString()} refunded`,
        body: `${w.reference} came back as ${status}. The member has been refunded in full. `
            + 'Check the gateway account before approving further payouts.',
        meta: { withdrawalId: w.id, status, amount: w.amount.toString() },
      });
    }
  }

  return true;
}

/** OxaPay reports one or more transactions per invoice; the first is enough. */
function firstTxHash(payload: Record<string, unknown>): string | undefined {
  const txs = payload.txs;
  if (!Array.isArray(txs) || !txs.length) return undefined;
  const hash = (txs[0] as Record<string, unknown>)?.tx_hash;
  return typeof hash === 'string' ? hash : undefined;
}

/* ── NOWPayments IPN ──────────────────────────────────────────────────────── */

/**
 * Handle one NOWPayments callback.
 *
 * Takes the PARSED body, not the raw bytes — the opposite of the OxaPay path
 * above, and not an oversight. NOWPayments re-serialises the JSON with sorted
 * keys before signing, so the raw bytes are the one thing that will never
 * reproduce their signature.
 *
 * Everything else is the same contract: recorded whatever happens (a run of
 * failed verifications is the only warning that someone is probing the
 * endpoint), matched against an invoice WE raised, and credited from OUR
 * recorded amount rather than from anything the payload claims.
 */
export async function handleNowPaymentsIpn(
  body: unknown,
  signature: string | undefined,
): Promise<CallbackResult> {
  const payload = (body ?? {}) as Record<string, unknown>;

  /* `invoice_id` is what we stored as the track id when the invoice was raised;
     `payment_id` identifies an individual attempt against it. Preferring the
     invoice means a member who starts over on the same invoice still lands on
     the same deposit row. */
  const trackId = String(payload.invoice_id ?? payload.payment_id ?? '');
  const status = String(payload.payment_status ?? '');

  if (!nowpayments.verifySignature(payload, signature)) {
    await record('nowpayments', status, trackId, false, payload, false);
    logger.warn({ trackId }, 'nowpayments callback failed signature verification');
    return { ok: false, applied: false, reason: 'bad signature' };
  }

  const applied = await applyPayment(
    trackId, status, payload, nowpayments.paymentOutcome(status),
  );
  await record('nowpayments', status, trackId, true, payload, applied);
  return { ok: true, applied, reason: applied ? 'applied' : 'no change' };
}
