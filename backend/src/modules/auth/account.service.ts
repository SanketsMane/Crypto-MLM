import bcrypt from 'bcryptjs';
import type { Request } from 'express';
import { prisma } from '../../core/db.js';
import { badRequest, notFound, unauthorized } from '../../core/errors.js';
import * as activity from '../../core/activity.js';
import { notifyMember } from '../../core/notify.js';
import * as otp from '../../core/otp.js';
import * as sessions from '../../core/sessions.js';
import { send, sendQuietly } from '../../core/email/mailer.js';
import * as templates from '../../core/email/templates.js';
import { env } from '../../config/env.js';

/**
 * Email verification, password reset, and password change.
 *
 * The theme running through all three: an attacker who reaches one of these
 * endpoints must not learn anything from the response. Requesting a reset for
 * an address that has no account returns exactly what a real one returns, so
 * the endpoint cannot be used to find out who banks here.
 */

const MIN_PASSWORD = 8;

function assertStrongPassword(password: string) {
  if (password.length < MIN_PASSWORD) {
    throw badRequest(`Password must be at least ${MIN_PASSWORD} characters`);
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    throw badRequest('Password must contain an uppercase letter, a lowercase letter and a number');
  }
}

// ── email verification ──

export async function sendVerification(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, emailVerifiedAt: true },
  });
  if (!user) throw notFound('User not found');
  if (user.emailVerifiedAt) throw badRequest('Your email is already verified');

  const challenge = await otp.issue({
    purpose: 'EMAIL_VERIFICATION',
    email: user.email,
    userId,
  });

  const result = await send(
    templates.verifyEmail({ to: user.email, code: challenge.code, minutes: challenge.minutes }),
  );
  // The member is waiting on this one, so a delivery failure is theirs to know
  // about rather than something to discover when no email arrives.
  if (!result.ok) throw badRequest('We could not send the email. Please try again shortly.');

  return { challengeId: challenge.challengeId, expiresAt: challenge.expiresAt };
}

export async function confirmVerification(userId: string, challengeId: string, code: string, req?: Request) {
  const verified = await otp.verify({ purpose: 'EMAIL_VERIFICATION', challengeId, code });
  if (verified.userId !== userId) throw unauthorized('That code belongs to a different account');

  await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  activity.record({ userId, event: 'EMAIL_VERIFIED', summary: 'Email address verified', req });
  return { verified: true };
}

// ── password reset (not signed in) ──

/**
 * Always reports success.
 *
 * Whether an address has an account here is not something an anonymous caller
 * gets to find out — for a platform holding money, that list is worth having.
 */
export async function requestPasswordReset(rawEmail: string) {
  const email = otp.assertEmail(rawEmail);
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });

  if (user) {
    const challenge = await otp.issue({ purpose: 'PASSWORD_RESET', email, userId: user.id });
    sendQuietly(
      templates.resetPassword({ to: email, code: challenge.code, minutes: challenge.minutes }),
    );
    return { challengeId: challenge.challengeId, sent: true as const };
  }

  // No account: return a well-formed challenge id that will never verify, so
  // the shape and timing of the response give nothing away.
  return { challengeId: crypto.randomUUID(), sent: true as const };
}

export async function resetPassword(input: {
  challengeId: string; code: string; newPassword: string; req?: Request;
}) {
  assertStrongPassword(input.newPassword);
  const verified = await otp.verify({
    purpose: 'PASSWORD_RESET',
    challengeId: input.challengeId,
    code: input.code,
  });
  if (!verified.userId) throw unauthorized('That code is not valid');

  await applyNewPassword(verified.userId, input.newPassword, 'PASSWORD_RESET', input.req);
  return { ok: true };
}

// ── password change (signed in) ──

export async function changePassword(input: {
  userId: string; currentPassword: string; newPassword: string; req?: Request;
}) {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { passwordHash: true },
  });
  if (!user) throw notFound('User not found');

  // Knowing the current password is what separates this from an attacker who
  // walked up to an unlocked laptop.
  if (!(await bcrypt.compare(input.currentPassword, user.passwordHash))) {
    throw unauthorized('Your current password is not correct');
  }
  assertStrongPassword(input.newPassword);
  if (input.currentPassword === input.newPassword) {
    throw badRequest('Choose a password you have not used before');
  }

  await applyNewPassword(input.userId, input.newPassword, 'PASSWORD_CHANGED', input.req);
  return { ok: true };
}

/**
 * The shared tail of both paths.
 *
 * Every session ends. The usual reason someone changes a password is that they
 * think somebody else has it, and leaving that person signed in defeats the
 * entire exercise.
 */
async function applyNewPassword(
  userId: string,
  newPassword: string,
  reason: string,
  req?: Request,
) {
  const passwordHash = await bcrypt.hash(newPassword, 12);
  const user = await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
    select: { email: true },
  });

  await sessions.revokeAllFor('USER', userId, reason);
  activity.record({
    userId, event: 'PASSWORD_CHANGED', req,
    summary: 'Password changed — all devices were signed out',
  });
  notifyMember({
    userId,
    type: 'security.password_changed',
    title: 'Your password was changed',
    body: 'Every device has been signed out. If this was not you, reset your password now and contact support.',
  });
  sendQuietly(templates.passwordChanged({ to: user.email, when: new Date() }));
}

export const webUrl = () => env.WEB_URL;
