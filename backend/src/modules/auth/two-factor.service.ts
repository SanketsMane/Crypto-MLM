import bcrypt from 'bcryptjs';
import type { Request } from 'express';
import { prisma } from '../../core/db.js';
import { notFound, unauthorized } from '../../core/errors.js';
import * as activity from '../../core/activity.js';
import { notifyMember } from '../../core/notify.js';
import * as core from '../../core/two-factor.js';
import { sendQuietly } from '../../core/email/mailer.js';
import * as templates from '../../core/email/templates.js';

/**
 * Member-facing two-factor management.
 *
 * Every state change here re-checks the password. An open session is not proof
 * of identity for this: a borrowed laptop should not be able to turn the
 * protection off, or turn it on and lock the real owner out.
 */

async function assertPassword(userId: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true, email: true },
  });
  if (!user) throw notFound('User not found');
  if (!(await bcrypt.compare(password, user.passwordHash))) {
    throw unauthorized('Your password is not correct');
  }
  return user;
}

export const status = (userId: string) => core.status('USER', userId);

export async function begin(userId: string, password: string) {
  await assertPassword(userId, password);
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true },
  });
  const enrolment = await core.beginEnrolment('USER', userId, user.email);

  // The secret is returned alongside the QR so a member on a desktop
  // authenticator, or one whose camera will not focus, can still enrol.
  return {
    secret: enrolment.secret,
    otpauthUrl: enrolment.otpauthUrl,
    qrDataUrl: enrolment.qrDataUrl,
  };
}

export async function confirm(userId: string, code: string, req?: Request) {
  const { recoveryCodes } = await core.confirmEnrolment('USER', userId, code);
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true },
  });

  activity.record({
    userId, event: 'TWO_FACTOR_ENABLED', req,
    summary: 'Two-factor authentication turned on',
  });
  notifyMember({
    userId,
    type: 'security.two_factor_on',
    title: 'Two-factor authentication is on',
    body: 'Signing in now needs a code from your authenticator app as well as your password.',
  });
  sendQuietly(templates.twoFactorChanged({ to: user.email, enabled: true, when: new Date() }));

  // Shown exactly once — only hashes are stored, so there is no way to display
  // them again later.
  return { recoveryCodes };
}

export async function disable(userId: string, password: string, code: string, req?: Request) {
  const user = await assertPassword(userId, password);
  await core.disable('USER', userId, code);

  activity.record({
    userId, event: 'TWO_FACTOR_DISABLED', req,
    summary: 'Two-factor authentication turned off',
  });
  notifyMember({
    userId,
    type: 'security.two_factor_off',
    title: 'Two-factor authentication was turned off',
    body: 'Your password alone now signs you in. If this was not you, contact support immediately.',
  });
  sendQuietly(templates.twoFactorChanged({ to: user.email, enabled: false, when: new Date() }));
  return { ok: true };
}

export async function regenerate(userId: string, password: string, code: string) {
  await assertPassword(userId, password);
  const recoveryCodes = await core.regenerateRecoveryCodes('USER', userId, code);
  return { recoveryCodes };
}
