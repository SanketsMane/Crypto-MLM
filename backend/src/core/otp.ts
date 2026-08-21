import crypto from 'node:crypto';
import type { OtpPurpose, Prisma } from '@prisma/client';
import { prisma } from './db.js';
import { AppError, badRequest } from './errors.js';
import { logger } from './logger.js';
import { numericCode, sha256, timingSafeEqual } from './crypto.js';

/**
 * One-time codes.
 *
 * A six-digit code is only a million guesses, so the entire security of this
 * rests on the limits around it rather than on the code itself:
 *
 *   • five attempts per challenge, then it is burned — not merely rejected,
 *     because an attacker who can retry forever needs no cleverness at all
 *   • a short life, so a code lifted from an old inbox is already dead
 *   • single use; consuming is a guarded UPDATE, so two concurrent submissions
 *     of the same code cannot both succeed
 *   • only the hash is stored, so a database leak yields nothing usable
 *   • issuing is rate limited per email and purpose, so nobody can use us to
 *     flood someone else's inbox
 *
 * The challenge id is returned to the caller and must come back with the code.
 * That binds the code to the flow that started it: a code from a password-reset
 * email cannot be replayed against a withdrawal confirmation.
 */

const MAX_ATTEMPTS = 5;
const ISSUE_WINDOW_MS = 60 * 60_000;
const MAX_PER_WINDOW = 5;
const RESEND_COOLDOWN_MS = 60_000;

export const TTL_MINUTES: Record<OtpPurpose, number> = {
  EMAIL_VERIFICATION: 30,
  PASSWORD_RESET: 15,
  WITHDRAWAL_CONFIRMATION: 10,
  EMAIL_CHANGE: 30,
};

export interface Challenge {
  challengeId: string;
  code: string;
  expiresAt: Date;
  minutes: number;
}

export class OtpError extends AppError {
  constructor(message: string, code = 'OTP_INVALID', status = 400) {
    super(message, status, code);
  }
}

/**
 * Creates a code and returns it to the caller, who is responsible for
 * delivering it. Nothing here sends anything — that keeps the transport
 * (email today, SMS later) out of the security logic.
 */
export async function issue(input: {
  purpose: OtpPurpose;
  email: string;
  userId?: string;
  payload?: Prisma.InputJsonValue;
}): Promise<Challenge> {
  const email = input.email.trim().toLowerCase();
  await assertNotFlooding(email, input.purpose);

  const minutes = TTL_MINUTES[input.purpose];
  const code = numericCode(6);
  const challengeId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + minutes * 60_000);

  // A member starting a new attempt invalidates the previous one, so there is
  // never more than one live code per purpose to guess at.
  await prisma.otpChallenge.updateMany({
    where: { email, purpose: input.purpose, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });

  await prisma.otpChallenge.create({
    data: {
      purpose: input.purpose,
      email,
      userId: input.userId,
      codeHash: sha256(code),
      challengeId,
      expiresAt,
      payload: input.payload,
    },
  });

  return { challengeId, code, expiresAt, minutes };
}

export interface Verified {
  email: string;
  userId: string | null;
  payload: Prisma.JsonValue | null;
}

/**
 * Checks a code and burns it. Returns what the challenge was carrying, so the
 * caller does not have to trust anything the client sent alongside it.
 */
export async function verify(input: {
  purpose: OtpPurpose;
  challengeId: string;
  code: string;
}): Promise<Verified> {
  const code = input.code.trim();
  if (!/^\d{6}$/.test(code)) throw new OtpError('Enter the 6-digit code from your email');

  const challenge = await prisma.otpChallenge.findUnique({
    where: { challengeId: input.challengeId },
  });

  // One message for every failure mode below. Distinguishing "no such
  // challenge" from "wrong code" would tell an attacker which half to work on.
  const reject = () => new OtpError('That code is not valid or has expired');

  if (!challenge || challenge.purpose !== input.purpose) throw reject();
  if (challenge.consumedAt) throw reject();
  if (challenge.expiresAt <= new Date()) throw reject();

  if (challenge.attempts >= MAX_ATTEMPTS) {
    throw new OtpError('Too many incorrect attempts. Request a new code.', 'OTP_ATTEMPTS_EXCEEDED', 429);
  }

  if (!timingSafeEqual(sha256(code), challenge.codeHash)) {
    const { attempts } = await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    });

    if (attempts >= MAX_ATTEMPTS) {
      // Burn it rather than merely refusing: a challenge that stays alive after
      // five wrong guesses is a challenge someone keeps guessing at.
      await prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      });
      logger.warn({ purpose: input.purpose, email: challenge.email }, 'otp challenge burned after repeated failures');
      throw new OtpError('Too many incorrect attempts. Request a new code.', 'OTP_ATTEMPTS_EXCEEDED', 429);
    }

    const left = MAX_ATTEMPTS - attempts;
    throw new OtpError(`That code is not correct. ${left} attempt${left === 1 ? '' : 's'} left.`);
  }

  // Guarded consume — two submissions racing cannot both win.
  const { count } = await prisma.otpChallenge.updateMany({
    where: { id: challenge.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (count === 0) throw reject();

  return { email: challenge.email, userId: challenge.userId, payload: challenge.payload };
}

/**
 * Stops us being used to flood an inbox, and stops a member burning through
 * codes fast enough to matter.
 */
async function assertNotFlooding(email: string, purpose: OtpPurpose) {
  const since = new Date(Date.now() - ISSUE_WINDOW_MS);
  const [recent, last] = await Promise.all([
    prisma.otpChallenge.count({ where: { email, purpose, createdAt: { gte: since } } }),
    prisma.otpChallenge.findFirst({
      where: { email, purpose },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
  ]);

  if (last && Date.now() - last.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - last.createdAt.getTime())) / 1000);
    throw new AppError(
      `Please wait ${wait} second${wait === 1 ? '' : 's'} before requesting another code.`,
      429,
      'OTP_COOLDOWN',
    );
  }

  if (recent >= MAX_PER_WINDOW) {
    throw new AppError(
      'Too many codes requested. Try again in an hour.',
      429,
      'OTP_RATE_LIMITED',
    );
  }
}

/** Drops spent and expired challenges. Runs on the maintenance schedule. */
export async function purgeExpiredOtpChallenges() {
  const { count } = await prisma.otpChallenge.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 24 * 3_600_000) } },
  });
  if (count) logger.info({ count }, 'expired otp challenges purged');
  return count;
}

export const assertEmail = (value: unknown): string => {
  const email = String(value ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest('Enter a valid email address');
  return email;
};
