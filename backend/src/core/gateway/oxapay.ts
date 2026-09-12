import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { logger } from '../logger.js';
import { AppError } from '../errors.js';
import { SWITCHES_ALL_ON, type GatewaySwitches } from './switches.js';

/**
 * OxaPay — the crypto payment gateway.
 *
 * Two separate credentials, and they are not interchangeable: the merchant key
 * signs and authorises *incoming* payments, the payout key *outgoing* ones. A
 * webhook is verified against whichever one matches the callback type, so a
 * leaked merchant key still cannot forge a payout confirmation.
 *
 * Contract (api.oxapay.com/v1, verified against the published reference):
 *   POST /payment/invoice   header `merchant_api_key`  → data.track_id, data.payment_url
 *   POST /payout            header `payout_api_key`    → data.track_id, data.status
 *   webhook: POST JSON, header `HMAC` = hex HMAC-SHA512 of the RAW body,
 *            keyed by merchant key (payments) or payout key (payouts);
 *            must be answered 200 with the body `ok`.
 */

const BASE = 'https://api.oxapay.com/v1';

export interface GatewayState {
  /** Invoices can be raised. */
  canCharge: boolean;
  /** Payouts can be sent. */
  canPay: boolean;
  sandbox: boolean;
  reasons: string[];
}

/**
 * Credentials are read at call time, not captured at import.
 *
 * Two reasons. A gateway key is the one secret most likely to be rotated in a
 * hurry — after a leak, or when moving from sandbox to live — and a process
 * that snapshotted it at boot keeps using the old one until someone remembers
 * to restart. And it keeps the module honest under test, where the keys are
 * set per case rather than baked into the environment.
 */
const readKey = (name: string, fallback?: string) => (process.env[name] ?? fallback ?? '').trim();
const readFlag = (name: string, fallback: boolean) => {
  const raw = process.env[name];
  return raw === undefined ? fallback : /^(1|true|yes|on)$/i.test(raw.trim());
};

/**
 * `switches` is passed in rather than read here.
 *
 * The credentials are environment state and readable synchronously; the
 * operator switches live in the database and are not. Taking them as an
 * argument keeps this function callable with nothing behind it — at boot, or
 * in a test — and leaves exactly one place (gateway.service) responsible for
 * fetching the live values.
 */
export function gatewayState(switches: GatewaySwitches = SWITCHES_ALL_ON): GatewayState {
  const merchant = readKey('OXAPAY_MERCHANT_KEY', env.OXAPAY_MERCHANT_KEY);
  const payout = readKey('OXAPAY_PAYOUT_KEY', env.OXAPAY_PAYOUT_KEY);
  const enabled = readFlag('OXAPAY_ENABLED', env.OXAPAY_ENABLED);

  const reasons: string[] = [];
  if (!enabled) reasons.push('OXAPAY_ENABLED is off');
  if (!merchant) reasons.push('OXAPAY_MERCHANT_KEY is not set — invoices cannot be raised');
  if (!payout) reasons.push('OXAPAY_PAYOUT_KEY is not set — payouts stay manual');

  /* Reported separately from the environment reasons above. An operator who
     turned a rail off in the console needs to see that decision named back to
     them, not a line about a variable they never touched. */
  if (enabled && merchant && !switches.oxapayDeposits) {
    reasons.push('OxaPay deposits are switched off in the console');
  }
  if (enabled && payout && !switches.oxapayPayouts) {
    reasons.push('OxaPay payouts are switched off in the console');
  }

  return {
    canCharge: Boolean(enabled && merchant && switches.oxapayDeposits),
    canPay: Boolean(enabled && payout && switches.oxapayPayouts),
    sandbox: readFlag('OXAPAY_SANDBOX', env.OXAPAY_SANDBOX),
    reasons,
  };
}

const keys = () => ({
  merchant: readKey('OXAPAY_MERCHANT_KEY', env.OXAPAY_MERCHANT_KEY),
  payout: readKey('OXAPAY_PAYOUT_KEY', env.OXAPAY_PAYOUT_KEY),
});

/** Every OxaPay response is this envelope. */
interface Envelope<T> {
  data?: T;
  message?: string;
  error?: { type?: string; key?: string; message?: string } | null;
  status?: number;
  version?: string;
}

async function call<T>(path: string, header: 'merchant_api_key' | 'payout_api_key', body: unknown): Promise<T> {
  const key = header === 'merchant_api_key' ? keys().merchant : keys().payout;
  if (!key) throw new AppError('Payment gateway is not configured', 503, 'GATEWAY_UNAVAILABLE');

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [header]: key },
      body: JSON.stringify(body),
      // A gateway that hangs must not hold a request open indefinitely.
      signal: AbortSignal.timeout(20_000),
    });
  } catch (cause) {
    logger.error({ path, cause }, 'oxapay request failed');
    throw new AppError('The payment gateway did not respond. Try again shortly.', 502, 'GATEWAY_UNREACHABLE');
  }

  const payload = (await res.json().catch(() => ({}))) as Envelope<T>;

  /**
   * An EMPTY `error` object means success.
   *
   * OxaPay sends `"error": {}` on a perfectly good response, and `{}` is
   * truthy — so testing `payload.error` alone rejected every successful call
   * and reported the failure as `Operation completed successfully!`, which is
   * the message OxaPay puts in `message` when nothing is wrong. It reads as a
   * gateway fault and is in fact our own check. Only an error carrying actual
   * detail counts as one.
   */
  // `!payload.data` stays inside the condition so the compiler can narrow
  // `payload.data` to non-undefined on the way out.
  const described = Boolean(payload.error && Object.keys(payload.error).length > 0);

  if (!res.ok || described || !payload.data) {
    const detail = payload.error?.message ?? payload.message ?? `HTTP ${res.status}`;
    // The key must never reach a log line or an error surface.
    logger.error({ path, status: res.status, detail }, 'oxapay rejected the request');
    throw new AppError(`Payment gateway error: ${detail}`, 502, 'GATEWAY_ERROR');
  }
  return payload.data;
}

export interface Invoice {
  trackId: string;
  paymentUrl: string;
  expiresAt: Date | null;
}

/**
 * Raise an invoice the member can pay in any supported coin.
 *
 * `order_id` carries our own deposit id, which is what lets the webhook find
 * the record again without trusting anything else in the payload.
 */
export async function createInvoice(input: {
  amount: number;
  orderId: string;
  callbackUrl: string;
  returnUrl?: string;
  email?: string;
  description?: string;
  lifetimeMinutes?: number;
}): Promise<Invoice> {
  const data = await call<{ track_id: string | number; payment_url: string; expired_at?: number }>(
    '/payment/invoice',
    'merchant_api_key',
    {
      amount: input.amount,
      currency: 'USD',
      lifetime: input.lifetimeMinutes ?? 60,
      // The member should receive the full amount they intended to deposit, so
      // the gateway fee is charged on top rather than shaved off the credit.
      fee_paid_by_payer: 1,
      callback_url: input.callbackUrl,
      ...(input.returnUrl ? { return_url: input.returnUrl } : {}),
      ...(input.email ? { email: input.email } : {}),
      order_id: input.orderId,
      description: input.description ?? 'FortuneX deposit',
      ...(readFlag('OXAPAY_SANDBOX', env.OXAPAY_SANDBOX) ? { sandbox: true } : {}),
    },
  );

  return {
    trackId: String(data.track_id),
    paymentUrl: data.payment_url,
    expiresAt: data.expired_at ? new Date(data.expired_at * 1000) : null,
  };
}

export interface PayoutHandle {
  trackId: string;
  status: string;
}

/** Send a member their money. */
export async function createPayout(input: {
  address: string;
  amount: number;
  currency: string;
  network?: string;
  callbackUrl: string;
  description?: string;
}): Promise<PayoutHandle> {
  const data = await call<{ track_id: string | number; status: string }>(
    '/payout',
    'payout_api_key',
    {
      address: input.address,
      currency: input.currency,
      amount: input.amount,
      ...(input.network ? { network: input.network } : {}),
      callback_url: input.callbackUrl,
      description: input.description ?? 'FortuneX withdrawal',
    },
  );
  return { trackId: String(data.track_id), status: data.status };
}

/* ── webhooks ─────────────────────────────────────────────────────────────── */

export type CallbackType = 'payment' | 'payout';

/**
 * Verify a callback actually came from OxaPay.
 *
 * Hashed over the RAW body, because that is what was signed — see the note on
 * `keepRaw` in app.ts. Compared with `timingSafeEqual` so the check cannot be
 * probed a byte at a time, and length is checked first because
 * `timingSafeEqual` throws on a mismatch rather than returning false.
 */
export function verifySignature(raw: Buffer | string, header: string | undefined, type: CallbackType): boolean {
  if (!header) return false;
  const key = type === 'payout' ? keys().payout : keys().merchant;
  if (!key) return false;

  const expected = crypto.createHmac('sha512', key).update(raw).digest('hex');
  const given = header.trim().toLowerCase();
  if (given.length !== expected.length) return false;

  return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(given, 'utf8'));
}

/** Statuses that mean the money is really ours. */
const PAID = new Set(['paid', 'manual_accept']);
/** Statuses that end the invoice without payment. */
const DEAD = new Set(['expired', 'refunded', 'refunding']);

export const paymentOutcome = (status: string): 'paid' | 'underpaid' | 'dead' | 'pending' =>
  PAID.has(status) ? 'paid'
  : status === 'underpaid' ? 'underpaid'
  : DEAD.has(status) ? 'dead'
  : 'pending';

/** Payout statuses. `confirmed` is the only one that means it landed. */
export const payoutOutcome = (status: string): 'confirmed' | 'failed' | 'pending' =>
  status === 'confirmed' ? 'confirmed'
  : ['canceled', 'cancelled', 'rejected'].includes(status) ? 'failed'
  : 'pending';

/* ── treasury ─────────────────────────────────────────────────────────────── */

/**
 * What OxaPay is actually holding for us.
 *
 * Read with the GENERAL key, not the merchant key — OxaPay scopes its three
 * keys to different endpoints, and balance sits under `general`. The merchant
 * key returns 401 here, which looks like a bad credential rather than the wrong
 * one being used.
 */
export async function accountBalance(): Promise<Record<string, number>> {
  const key = readKey('OXAPAY_GENERAL_KEY', env.OXAPAY_GENERAL_KEY);
  if (!key) throw new AppError('OXAPAY_GENERAL_KEY is not set', 503, 'GATEWAY_UNAVAILABLE');

  const res = await fetch(`${BASE}/general/account/balance`, {
    headers: { 'Content-Type': 'application/json', general_api_key: key },
    signal: AbortSignal.timeout(15_000),
  });
  const payload = (await res.json().catch(() => ({}))) as { data?: Record<string, number>; message?: string };
  if (!res.ok) throw new AppError(payload.message ?? `HTTP ${res.status}`, 502, 'GATEWAY_ERROR');
  return payload.data ?? {};
}
