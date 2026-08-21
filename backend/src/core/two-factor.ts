import bcrypt from 'bcryptjs';
import { generateSecret, generateURI, verifySync } from 'otplib';
import QRCode from 'qrcode';
import type { ActorType } from '@prisma/client';
import { prisma } from './db.js';
import { AppError, badRequest, unauthorized } from './errors.js';
import { decrypt, encrypt, numericCode } from './crypto.js';
import { logger } from './logger.js';
import { env } from '../config/env.js';

/**
 * Two-factor authentication, TOTP (RFC 6238).
 *
 * TOTP rather than SMS: SIM swap is the standard way accounts holding money are
 * taken, and an SMS second factor is exactly what it defeats. An authenticator
 * app needs the attacker to have the device.
 *
 * Three details that matter more than the algorithm:
 *
 *   • the seed is encrypted at rest, because verifying a code needs it back and
 *     a plaintext column would let a database leak mint valid codes forever
 *   • enrolment is two-step — a secret is not enabled until the member proves
 *     they can generate a code from it, so nobody locks themselves out of an
 *     account by scanning a QR that did not save
 *   • recovery codes exist, because losing a phone is far more common than
 *     losing a password, and without them every lost device becomes an operator
 *     manually disabling 2FA, which is a social-engineering route straight past it
 */

/**
 * One 30-second step either side, so a phone with a slightly off clock still
 * works. otplib 13 expresses this in seconds rather than steps.
 */
const DRIFT_TOLERANCE_SECONDS = 30;
const RECOVERY_CODES = 10;

export interface Enrolment {
  secret: string;
  otpauthUrl: string;
  qrDataUrl: string;
}

/**
 * Generates a candidate secret. It is stored but NOT enabled — `confirm` does
 * that, once the member has proved the app is set up.
 */
export async function beginEnrolment(
  actorType: ActorType,
  actorId: string,
  accountLabel: string,
): Promise<Enrolment> {
  const current = await load(actorType, actorId);
  if (current.enabledAt) throw badRequest('Two-factor authentication is already on');

  const secret = generateSecret();
  const otpauthUrl = generateURI({ secret, label: accountLabel, issuer: env.BRAND_NAME });

  await save(actorType, actorId, { twoFactorSecret: encrypt(secret) });

  return {
    secret,
    otpauthUrl,
    qrDataUrl: await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 240 }),
  };
}

export interface Confirmed {
  recoveryCodes: string[];
}

/** Turns 2FA on, once a code proves the authenticator is working. */
export async function confirmEnrolment(
  actorType: ActorType,
  actorId: string,
  code: string,
): Promise<Confirmed> {
  const current = await load(actorType, actorId);
  if (current.enabledAt) throw badRequest('Two-factor authentication is already on');
  if (!current.secret) throw badRequest('Start setup again — no pending secret was found');

  if (!checkToken(code, current.secret)) {
    throw new AppError('That code is not correct. Check your authenticator app and try again.', 400, 'TWO_FACTOR_INVALID');
  }

  await save(actorType, actorId, { twoFactorEnabledAt: new Date() });
  const recoveryCodes = await issueRecoveryCodes(actorType, actorId);
  return { recoveryCodes };
}

/** Turns 2FA off. The caller is responsible for having re-checked the password. */
export async function disable(actorType: ActorType, actorId: string, code: string) {
  const current = await load(actorType, actorId);
  if (!current.enabledAt) throw badRequest('Two-factor authentication is not on');

  // A code is required to switch it off as well as on. Otherwise anyone who
  // reaches an open session can quietly remove the protection.
  const ok =
    (current.secret && checkToken(code, current.secret)) ||
    (await consumeRecoveryCode(actorType, actorId, code));
  if (!ok) throw new AppError('That code is not correct', 400, 'TWO_FACTOR_INVALID');

  await save(actorType, actorId, { twoFactorSecret: null, twoFactorEnabledAt: null });
  if (actorType === 'USER') {
    await prisma.twoFactorRecoveryCode.deleteMany({ where: { userId: actorId } });
  }
}

/**
 * Checks a code at sign-in. Accepts either a TOTP token or an unused recovery
 * code, and reports which was used so the caller can warn the member.
 */
export async function verifyChallenge(
  actorType: ActorType,
  actorId: string,
  code: string,
): Promise<{ ok: boolean; usedRecoveryCode: boolean }> {
  const current = await load(actorType, actorId);
  if (!current.enabledAt || !current.secret) return { ok: true, usedRecoveryCode: false };

  if (checkToken(code, current.secret)) return { ok: true, usedRecoveryCode: false };
  if (await consumeRecoveryCode(actorType, actorId, code)) {
    return { ok: true, usedRecoveryCode: true };
  }
  return { ok: false, usedRecoveryCode: false };
}

export async function isEnabled(actorType: ActorType, actorId: string) {
  return Boolean((await load(actorType, actorId)).enabledAt);
}

export async function status(actorType: ActorType, actorId: string) {
  const current = await load(actorType, actorId);
  const remaining =
    actorType === 'USER'
      ? await prisma.twoFactorRecoveryCode.count({ where: { userId: actorId, usedAt: null } })
      : 0;
  return {
    enabled: Boolean(current.enabledAt),
    enabledAt: current.enabledAt,
    pendingSetup: Boolean(current.secret && !current.enabledAt),
    recoveryCodesRemaining: remaining,
  };
}

/** Replaces every recovery code. Used after one is spent, or on request. */
export async function regenerateRecoveryCodes(actorType: ActorType, actorId: string, code: string) {
  const current = await load(actorType, actorId);
  if (!current.enabledAt || !current.secret) throw badRequest('Two-factor authentication is not on');
  if (!checkToken(code, current.secret)) {
    throw new AppError('That code is not correct', 400, 'TWO_FACTOR_INVALID');
  }
  return issueRecoveryCodes(actorType, actorId);
}

// ── internals ──

function checkToken(token: string, encryptedSecret: string): boolean {
  const clean = token.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  try {
    return verifySync({
      secret: decrypt(encryptedSecret),
      token: clean,
      epochTolerance: DRIFT_TOLERANCE_SECONDS,
    }).valid;
  } catch (err) {
    // A seed that will not decrypt means the encryption key changed. Failing
    // closed is right, but it must be obvious in the logs why nobody can sign in.
    logger.error({ err }, 'could not decrypt a two-factor secret');
    return false;
  }
}

/** Formatted in groups so they are readable when written down. */
const formatRecovery = () => `${numericCode(5)}-${numericCode(5)}`;

async function issueRecoveryCodes(actorType: ActorType, actorId: string): Promise<string[]> {
  if (actorType !== 'USER') {
    // Admins do not have a recovery-code table; another Super Admin resets them,
    // which is auditable and is the better control for a console account.
    return [];
  }

  const codes = Array.from({ length: RECOVERY_CODES }, formatRecovery);
  await prisma.$transaction(async (tx) => {
    await tx.twoFactorRecoveryCode.deleteMany({ where: { userId: actorId } });
    await tx.twoFactorRecoveryCode.createMany({
      data: await Promise.all(
        codes.map(async (c) => ({ userId: actorId, codeHash: await bcrypt.hash(c, 10) })),
      ),
    });
  });

  // Shown once. There is no endpoint that reads them back — only the hash is kept.
  return codes;
}

async function consumeRecoveryCode(actorType: ActorType, actorId: string, code: string) {
  if (actorType !== 'USER') return false;
  const clean = code.replace(/\s+/g, '');
  if (!/^\d{5}-\d{5}$/.test(clean)) return false;

  const candidates = await prisma.twoFactorRecoveryCode.findMany({
    where: { userId: actorId, usedAt: null },
  });

  for (const candidate of candidates) {
    if (await bcrypt.compare(clean, candidate.codeHash)) {
      // Guarded so the same code cannot be spent twice concurrently.
      const { count } = await prisma.twoFactorRecoveryCode.updateMany({
        where: { id: candidate.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      return count === 1;
    }
  }
  return false;
}

async function load(actorType: ActorType, actorId: string) {
  const row =
    actorType === 'ADMIN'
      ? await prisma.adminUser.findUnique({
          where: { id: actorId },
          select: { twoFactorSecret: true, twoFactorEnabledAt: true },
        })
      : await prisma.user.findUnique({
          where: { id: actorId },
          select: { twoFactorSecret: true, twoFactorEnabledAt: true },
        });
  if (!row) throw unauthorized();
  return { secret: row.twoFactorSecret, enabledAt: row.twoFactorEnabledAt };
}

const save = (actorType: ActorType, actorId: string, data: Record<string, unknown>) =>
  actorType === 'ADMIN'
    ? prisma.adminUser.update({ where: { id: actorId }, data })
    : prisma.user.update({ where: { id: actorId }, data });
