import type { ActorType } from '@prisma/client';
import { prisma } from './db.js';
import { AppError } from './errors.js';
import { logger } from './logger.js';

/**
 * Per-account lockout.
 *
 * The auth routes are already rate limited, but that limit is per IP, and
 * credential stuffing is run from botnets precisely so that no single IP ever
 * looks busy. The account is the thing under attack, so the account is what
 * counts and what locks.
 *
 * The window is deliberately short. This exists to make an online guessing
 * attack uneconomic, not to let anyone lock a member out of their own money by
 * guessing wrong on purpose — five minutes of delay costs an attacker
 * everything and a real member almost nothing.
 */

const MAX_ATTEMPTS = 5;
const LOCK_MS = 5 * 60_000;
const MAX_LOCK_MS = 60 * 60_000;

export class AccountLockedError extends AppError {
  constructor(until: Date) {
    const minutes = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60_000));
    super(
      `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      429,
      'ACCOUNT_LOCKED',
    );
  }
}

interface Attemptable {
  id: string;
  failedLoginCount: number;
  lockedUntil: Date | null;
}

/** Throws if the account is inside a lock window. Call before checking the password. */
export function assertNotLocked(account: Attemptable) {
  if (account.lockedUntil && account.lockedUntil > new Date()) {
    throw new AccountLockedError(account.lockedUntil);
  }
}

/**
 * Records a failed attempt and locks once the threshold is crossed. The lock
 * window doubles with each further failure so a persistent attacker backs off
 * fast, capped so a member is never locked out for long.
 */
export async function recordFailure(actorType: ActorType, account: Attemptable) {
  const attempts = account.failedLoginCount + 1;
  if (attempts < MAX_ATTEMPTS) {
    await update(actorType, account.id, { failedLoginCount: attempts });
    return;
  }

  const over = attempts - MAX_ATTEMPTS;
  const lockMs = Math.min(LOCK_MS * 2 ** over, MAX_LOCK_MS);
  const lockedUntil = new Date(Date.now() + lockMs);
  await update(actorType, account.id, { failedLoginCount: attempts, lockedUntil });

  logger.warn(
    { actorType, actorId: account.id, attempts, lockedUntil },
    'account locked after repeated failed sign-ins',
  );
  throw new AccountLockedError(lockedUntil);
}

/** Clears the counter. Call on a successful sign-in. */
export async function recordSuccess(actorType: ActorType, account: Attemptable) {
  if (account.failedLoginCount === 0 && !account.lockedUntil) return;
  await update(actorType, account.id, { failedLoginCount: 0, lockedUntil: null });
}

const update = (actorType: ActorType, id: string, data: Record<string, unknown>) =>
  actorType === 'ADMIN'
    ? prisma.adminUser.update({ where: { id }, data })
    : prisma.user.update({ where: { id }, data });
