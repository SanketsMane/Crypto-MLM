import rateLimit, { ipKeyGenerator, type Store } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { env } from '../config/env.js';
import { connection } from '../jobs/queue.js';
import { logger } from '../core/logger.js';

/**
 * Every request in the suite comes from one address, so a shared budget makes
 * unrelated tests interfere: enough calls in a minute and the next file's
 * requests are refused before they reach anything, which showed up as a
 * failed-login lockout test that never locked because its attempts never
 * arrived. Rate limiting is a production behaviour and belongs in its own test,
 * not silently applied to every other one.
 */
const isTest = env.NODE_ENV === 'test';

/**
 * Counters live in Redis, not in this process.
 *
 * Both limiters used express-rate-limit's default in-memory store, which keeps
 * its counters per container and drops them on restart. Scaled to N replicas
 * that turns a 10-per-15-minutes login limit into 10xN, spread across replicas
 * by the load balancer, and a rolling deploy resets every counter mid-attack.
 * The per-account lockout in core/login-attempts.ts was doing the real work;
 * the IP limiter in front of registration, password reset and OTP was not
 * enforcing what it appeared to.
 *
 * The API process already holds this connection — the health probe reads it —
 * so this adds no new dependency and no new failure mode. If the store cannot
 * be attached the limiter falls back to per-process counters rather than
 * refusing traffic: degraded throttling is bad, a platform that will not serve
 * is worse.
 */
function sharedStore(prefix: string): Store | undefined {
  if (isTest) return undefined;
  try {
    return new RedisStore({
      prefix,
      sendCommand: (command: string, ...args: string[]) =>
        connection.call(command, ...args) as Promise<never>,
    });
  } catch (err) {
    logger.error({ err, prefix }, 'could not attach the Redis rate-limit store — falling back to per-process counters');
    return undefined;
  }
}

/** Keyed per IP — a global key would let one client lock out everyone. */
/**
 * Requests per minute per address.
 *
 * Configurable because the right number is deployment-specific: behind a proxy
 * that NATs an office to one address, 120 is low, and an end-to-end suite
 * driving a browser trips it in seconds. The default is unchanged.
 */
const PER_MINUTE = Number(process.env.RATE_LIMIT_PER_MINUTE) || 120;

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: PER_MINUTE,
  skip: () => isTest,
  store: sharedStore('rl:api:'),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

/**
 * Sign-in, registration, password reset and OTP.
 *
 * Active outside production too. This used to skip everywhere but production,
 * which meant the control guarding these endpoints was never exercised before
 * the one environment where being wrong costs something — and left staging
 * unthrottled on the public internet. Local development is the only place that
 * genuinely needs the exemption, so it is the only place that keeps it.
 */
/**
 * Per address, but only for callers we cannot name.
 *
 * Ten attempts per address per quarter hour is right for a browser and wrong
 * for a phone: carrier-grade NAT puts thousands of subscribers behind one
 * public address, so on a mobile launch one member's mistyped password spends
 * the budget for everyone else on that carrier. It presents as "login is
 * broken" for a whole region and is close to impossible to reproduce in an
 * office.
 *
 * Two changes make it safe for an app. A caller who is already signed in —
 * step-up, change password — is keyed by their member id, so they can never
 * spend anyone else's budget. Everyone else still shares an address key, but
 * the ceiling is raised and configurable, because the control that actually
 * stops credential stuffing is the per-account lockout in
 * core/login-attempts.ts, which counts the account rather than the address and
 * is unaffected by a botnet spreading itself thinly across IPs.
 */
const AUTH_PER_WINDOW = Number(process.env.RATE_LIMIT_AUTH_PER_WINDOW) || 60;

export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: AUTH_PER_WINDOW,
  skip: () => isTest || env.NODE_ENV === 'development',
  store: sharedStore('rl:auth:'),
  // `ipKeyGenerator` rather than req.ip: it collapses an IPv6 address to its
  // /64 prefix, so a client cannot walk its own subnet for a fresh budget.
  keyGenerator: (req) => (req.userId ? `u:${req.userId}` : ipKeyGenerator(req.ip ?? '')),
  message: { success: false, error: { message: 'Too many attempts, try again later' } },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});
