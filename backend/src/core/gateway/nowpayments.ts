import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { logger } from '../logger.js';
import { AppError } from '../errors.js';

/**
 * NOWPayments — crypto checkout.
 *
 * Contract (api.nowpayments.io/v1, verified against a live account):
 *   GET  /status                       health, unauthenticated
 *   POST /invoice   header `x-api-key` → id, invoice_url
 *   GET  /payment/{id}                 → payment_status
 *   IPN: POST JSON, header `x-nowpayments-sig`
 *
 * The signature is the part that differs from every other gateway here, and
 * getting it wrong fails in the dangerous direction. OxaPay signs the RAW
 * request body, so that integration keeps the exact bytes. NOWPayments does
 * NOT: it re-serialises the JSON with its keys SORTED and signs that. Hashing
 * the raw body against a NOWPayments callback therefore never matches, and the
 * obvious "fix" — skipping verification because it always fails — is how a
 * forged callback credits a wallet.
 */

const BASE = 'https://api.nowpayments.io/v1';

export interface NowPaymentsState {
  canCharge: boolean;
  reasons: string[];
}

/* Read at call time, not captured at import: a gateway key is the secret most
   likely to be rotated in a hurry, and a process that snapshotted it at boot
   keeps using the old one until someone remembers to restart. */
const readKey = (name: string, fallback?: string) => (process.env[name] ?? fallback ?? '').trim();
const readFlag = (name: string, fallback: boolean) => {
  const raw = process.env[name];
  return raw === undefined ? fallback : /^(1|true|yes|on)$/i.test(raw.trim());
};

export function state(): NowPaymentsState {
  const apiKey = readKey('NOWPAYMENTS_API_KEY', env.NOWPAYMENTS_API_KEY);
  const ipnSecret = readKey('NOWPAYMENTS_IPN_SECRET', env.NOWPAYMENTS_IPN_SECRET);
  const enabled = readFlag('NOWPAYMENTS_ENABLED', env.NOWPAYMENTS_ENABLED);

  const reasons: string[] = [];
  if (!enabled) reasons.push('NOWPAYMENTS_ENABLED is off');
  if (!apiKey) reasons.push('NOWPAYMENTS_API_KEY is not set — invoices cannot be raised');
  /**
   * No IPN secret means no way to tell a real callback from an invented one.
   * Charging without it would take the member's money and then have no
   * trustworthy way to learn it arrived, so this disables charging outright
   * rather than degrading to "credit whatever posts to the URL".
   */
  if (!ipnSecret) reasons.push('NOWPAYMENTS_IPN_SECRET is not set — callbacks cannot be verified');

  return { canCharge: Boolean(enabled && apiKey && ipnSecret), reasons };
}

async function call<T>(path: string, init: { method: 'GET' | 'POST'; body?: unknown }): Promise<T> {
  const apiKey = readKey('NOWPAYMENTS_API_KEY', env.NOWPAYMENTS_API_KEY);
  if (!apiKey) throw new AppError('Payment gateway is not configured', 503, 'GATEWAY_UNAVAILABLE');

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: init.method,
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: init.body ? JSON.stringify(init.body) : undefined,
      // A gateway that hangs must not hold a request open indefinitely.
      signal: AbortSignal.timeout(20_000),
    });
  } catch (cause) {
    logger.error({ path, cause }, 'nowpayments request failed');
    throw new AppError('The payment gateway did not respond. Try again shortly.', 502, 'GATEWAY_UNREACHABLE');
  }

  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const detail = String(payload.message ?? payload.error ?? `HTTP ${res.status}`);
    // The key must never reach a log line or an error surface.
    logger.error({ path, status: res.status, detail }, 'nowpayments rejected the request');
    throw new AppError(`Payment gateway error: ${detail}`, 502, 'GATEWAY_ERROR');
  }
  return payload as T;
}

export interface Invoice {
  trackId: string;
  paymentUrl: string;
}

/**
 * Raise an invoice the member can pay in any supported coin.
 *
 * `order_id` carries our own deposit id, which is what lets the callback find
 * the record again without trusting anything else in the payload.
 */
export async function createInvoice(input: {
  amount: number;
  orderId: string;
  callbackUrl: string;
  returnUrl?: string;
  description?: string;
}): Promise<Invoice> {
  const data = await call<{ id: string | number; invoice_url: string }>('/invoice', {
    method: 'POST',
    body: {
      price_amount: input.amount,
      price_currency: 'usd',
      order_id: input.orderId,
      order_description: input.description ?? 'FortuneX deposit',
      ipn_callback_url: input.callbackUrl,
      ...(input.returnUrl ? { success_url: input.returnUrl, cancel_url: input.returnUrl } : {}),
    },
  });

  return { trackId: String(data.id), paymentUrl: data.invoice_url };
}

/* ── IPN ──────────────────────────────────────────────────────────────────── */

/**
 * Deterministic JSON with keys sorted at every level.
 *
 * This must reproduce, byte for byte, what NOWPayments hashed on their side.
 * Object key order in JS is insertion order, so the same data parsed from a
 * different byte order would otherwise produce a different string and a
 * signature that never matches.
 */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src).sort()) out[key] = canonical(src[key]);
    return out;
  }
  return value;
}

/**
 * Verify a callback actually came from NOWPayments.
 *
 * Compared with `timingSafeEqual` so the check cannot be probed a byte at a
 * time, and length is checked first because `timingSafeEqual` throws on a
 * mismatch rather than returning false.
 */
export function verifySignature(body: unknown, header: string | undefined): boolean {
  if (!header) return false;
  const secret = readKey('NOWPAYMENTS_IPN_SECRET', env.NOWPAYMENTS_IPN_SECRET);
  if (!secret) return false;

  const expected = crypto
    .createHmac('sha512', secret)
    .update(JSON.stringify(canonical(body)))
    .digest('hex');

  const given = header.trim().toLowerCase();
  if (given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(given, 'utf8'));
}

/**
 * Payment statuses.
 *
 * `finished` is the only one that means the money is ours. `confirming` and
 * `sending` look encouraging and are not — crediting on either would pay out
 * against a transaction that can still fail.
 */
export const paymentOutcome = (status: string): 'paid' | 'underpaid' | 'dead' | 'pending' =>
  status === 'finished' ? 'paid'
  : status === 'partially_paid' ? 'underpaid'
  : ['failed', 'refunded', 'expired'].includes(status) ? 'dead'
  : 'pending';

/* ── treasury ─────────────────────────────────────────────────────────────── */

/**
 * What NOWPayments is holding for us.
 *
 * Their balance endpoint is IP-restricted: it answers 403 ENDPOINT_NOT_ALLOWED
 * from any address not on the account's whitelist, and names the address it saw.
 * That is a configuration step in their dashboard, not a credential problem, so
 * it is reported as such rather than surfacing as a generic failure an operator
 * would waste time treating as a broken key.
 */
export async function accountBalance(): Promise<Record<string, number>> {
  const apiKey = readKey('NOWPAYMENTS_API_KEY', env.NOWPAYMENTS_API_KEY);
  if (!apiKey) throw new AppError('NOWPAYMENTS_API_KEY is not set', 503, 'GATEWAY_UNAVAILABLE');

  const res = await fetch(`${BASE}/balance`, {
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    signal: AbortSignal.timeout(15_000),
  });
  const payload = (await res.json().catch(() => ({}))) as {
    balances?: Record<string, { amount?: number }>;
    code?: string;
    message?: string;
  };

  if (!res.ok) {
    if (res.status === 403 || payload.code === 'ENDPOINT_NOT_ALLOWED') {
      throw new AppError(
        `NOWPayments refuses balance reads from this server's address. Add it to the IP whitelist in their dashboard. (${payload.message ?? 'no detail'})`,
        503, 'GATEWAY_IP_NOT_WHITELISTED',
      );
    }
    throw new AppError(payload.message ?? `HTTP ${res.status}`, 502, 'GATEWAY_ERROR');
  }

  const out: Record<string, number> = {};
  for (const [coin, v] of Object.entries(payload.balances ?? {})) {
    out[coin.toUpperCase()] = Number(v?.amount ?? 0);
  }
  return out;
}
