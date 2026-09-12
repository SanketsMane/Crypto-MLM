import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  WEB_URL: z.string().default('http://localhost:3000'),

  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default('redis://localhost:6390'),

  JWT_ACCESS_SECRET: z.string().min(8),
  JWT_REFRESH_SECRET: z.string().min(8),
  JWT_ACCESS_TTL: z.string().default('15m'),

  /**
   * How many reverse proxies sit in front of this process.
   *
   * 0 means none — the socket address is the client. 1 means one proxy, so the
   * last entry in X-Forwarded-For is the client. Getting this wrong is not
   * cosmetic: too low and every request appears to come from the proxy, which
   * makes the rate limiter throttle all members together, fills the audit log
   * with one address, and reduces the admin IP allowlist to allow-all or
   * deny-all. Too high and a client can prepend a forged address and defeat
   * the allowlist outright.
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),

  /// Encrypts secrets that must be read back — TOTP seeds, the hot wallet key.
  ENCRYPTION_KEY: z.string().min(16).default('dev-encryption-key-not-for-production'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  DAILY_ROI_PERCENT: z.coerce.number().default(0.5),
  CAP_PASSIVE_PERCENT: z.coerce.number().default(250),
  CAP_ACTIVE_PERCENT: z.coerce.number().default(300),
  WITHDRAW_FEE_PERCENT: z.coerce.number().default(5),
  WITHDRAW_MIN: z.coerce.number().default(10),
  WITHDRAW_MAX: z.coerce.number().default(5000),
  /// ISO weekday numbers that accrue ROI. 1=Mon … 5=Fri (FortuneX: Mon–Fri only).
  TRADING_DAYS: z.string().default('1,2,3,4,5'),

  /// Outbound mail. With no host set, mail is logged rather than sent, so a
  /// developer machine exercises the same flows without an SMTP server.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().default('FortuneX <no-reply@fortunex.local>'),
  BRAND_NAME: z.string().default('FortuneX'),

  /// On-chain settlement (BNB Smart Chain, USDT BEP-20).
  ///
  /// Everything here is optional and the whole subsystem stays OFF unless it is
  /// configured. That is deliberate: a half-configured chain integration that
  /// starts anyway is how test money becomes real money.
  /* ── OxaPay payment gateway ──────────────────────────────────────────
     Two keys, deliberately separate: the merchant key authorises money
     coming IN, the payout key money going OUT. A compromise of one must not
     grant the other. */
  OXAPAY_ENABLED: z.coerce.boolean().default(false),
  OXAPAY_MERCHANT_KEY: z.string().optional(),
  OXAPAY_PAYOUT_KEY: z.string().optional(),
  /** Sandbox raises test invoices that never move real funds. */
  OXAPAY_SANDBOX: z.coerce.boolean().default(false),
  /** Public origin OxaPay calls back to. Must be reachable from the internet. */
  OXAPAY_CALLBACK_BASE: z.string().optional(),

  /* ── NOWPayments ─────────────────────────────────────────────────────
     An alternative crypto checkout. Unlike OxaPay there is one API key for
     charging, plus a separate IPN secret used ONLY to verify callbacks —
     it never authorises anything, so it is not interchangeable with the
     API key and must not be substituted for it. */
  NOWPAYMENTS_ENABLED: z.coerce.boolean().default(false),
  NOWPAYMENTS_API_KEY: z.string().optional(),
  NOWPAYMENTS_IPN_SECRET: z.string().optional(),
  /** Public origin NOWPayments calls back to. Falls back to WEB_URL. */
  NOWPAYMENTS_CALLBACK_BASE: z.string().optional(),

  /**
   * Which rail sends an approved withdrawal: 'chain', 'gateway' or 'manual'.
   *
   * Optional, and inferred when unset — a deployment with only one rail
   * configured needs nothing here. It exists for the case where BOTH the hot
   * wallet and the gateway can send, which is otherwise ambiguous and used to
   * pay the member twice. See core/payout-rail.ts.
   */
  PAYOUT_RAIL: z.enum(['chain', 'gateway', 'manual']).optional(),

  CHAIN_ENABLED: z.coerce.boolean().default(false),
  CHAIN_RPC_URL: z.string().optional(),
  CHAIN_ID: z.coerce.number().default(56),
  /// USDT on BSC mainnet. Override for testnet.
  CHAIN_TOKEN_ADDRESS: z.string().default('0x55d398326f99059fF775485246999027B3197955'),
  CHAIN_TOKEN_DECIMALS: z.coerce.number().default(18),
  /// Extended public key. Derives deposit addresses WITHOUT any private key
  /// being present in the watching process.
  CHAIN_DEPOSIT_XPUB: z.string().optional(),
  /// Hot wallet key for outbound payouts. Encrypted at rest; supply the
  /// ciphertext, not the raw key.
  CHAIN_PAYOUT_KEY: z.string().optional(),
  /// Blocks to wait before a deposit is credited. BSC reorgs are shallow but
  /// real; 15 is the usual exchange figure.
  CHAIN_CONFIRMATIONS: z.coerce.number().default(15),
  /// Blocks per scan. BSC RPC providers commonly cap eth_getLogs at 1000–5000.
  CHAIN_SCAN_BATCH: z.coerce.number().default(500),
  /// Ignore dust so the ledger is not filled with rounding.
  CHAIN_MIN_DEPOSIT: z.coerce.number().default(1),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment:', z.treeifyError(parsed.error));
  process.exit(1);
}

const isProd = parsed.data.NODE_ENV === 'production';

/**
 * Production refuses to start on a placeholder secret.
 *
 * Signing keys are the whole of the authentication system: anyone who knows one
 * can mint a token for any account. A checked-in default is public knowledge,
 * and the failure is silent — everything works perfectly right up until someone
 * signs in as an admin they invented. So it is a boot failure, not a warning,
 * because a warning in a log nobody is reading is the same as nothing.
 */
if (isProd) {
  const secrets: Array<[string, string]> = [
    ['JWT_ACCESS_SECRET', parsed.data.JWT_ACCESS_SECRET],
    ['JWT_REFRESH_SECRET', parsed.data.JWT_REFRESH_SECRET],
    ['ENCRYPTION_KEY', parsed.data.ENCRYPTION_KEY],
  ];
  const weak = secrets.filter(
    ([, v]) => /change[-_ ]?me|^secret$|^changeme$|test-|not-for-production/i.test(v) || v.length < 32,
  );

  if (weak.length) {
    console.error(
      `Refusing to start: ${weak.map(([k]) => k).join(', ')} ` +
      'must be set to a unique random value of at least 32 characters. ' +
      'Generate one with:  openssl rand -base64 48',
    );
    process.exit(1);
  }

  if (parsed.data.JWT_ACCESS_SECRET === parsed.data.JWT_REFRESH_SECRET) {
    console.error('Refusing to start: JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ.');
    process.exit(1);
  }
}

export const env = {
  ...parsed.data,
  tradingDays: parsed.data.TRADING_DAYS.split(',').map((d) => Number(d.trim())),
  isProd,
};
