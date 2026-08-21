import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

/**
 * Every request in the suite comes from one address, so a shared budget makes
 * unrelated tests interfere: enough calls in a minute and the next file's
 * requests are refused before they reach anything, which showed up as a
 * failed-login lockout test that never locked because its attempts never
 * arrived. Rate limiting is a production behaviour and belongs in its own test,
 * not silently applied to every other one.
 */
const isTest = env.NODE_ENV === 'test';

/** Keyed per IP — a global key would let one client lock out everyone. */
export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  skip: () => isTest,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  // Local development would otherwise lock you out while trying things.
  skip: () => !env.isProd,
  message: { success: false, error: { message: 'Too many attempts, try again later' } },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});
