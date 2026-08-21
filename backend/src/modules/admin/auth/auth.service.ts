import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Request } from 'express';
import { prisma } from '../../../core/db.js';
import { unauthorized } from '../../../core/errors.js';
import * as sessions from '../../../core/sessions.js';
import * as twoFactor from '../../../core/two-factor.js';
import * as audit from '../audit/audit.service.js';
import { notifyAdmins } from '../../../core/notify.js';
import { env } from '../../../config/env.js';
import { assertNotLocked, recordFailure, recordSuccess } from '../../../core/login-attempts.js';

export async function login(email: string, password: string, req?: Request) {
  const admin = await prisma.adminUser.findUnique({
    where: { email },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  if (!admin || !admin.isActive) throw unauthorized('Invalid credentials');

  // An admin console is the highest-value target on the platform, so the
  // lockout applies here at least as strictly as it does to members.
  assertNotLocked(admin);
  if (!(await bcrypt.compare(password, admin.passwordHash))) {
    await recordFailure('ADMIN', admin);
    throw unauthorized('Invalid credentials');
  }

  await recordSuccess('ADMIN', admin);

  // The console is the highest-value target on the platform. With a second
  // factor enrolled the password alone gets no session — only a ticket good for
  // one thing, for five minutes.
  if (admin.twoFactorEnabledAt) {
    return {
      twoFactorRequired: true as const,
      challengeToken: issueTicket(admin.id),
      admin: null,
      accessToken: null,
      refreshToken: null,
    };
  }

  await prisma.adminUser.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
  const tokens = await sessions.issue('ADMIN', admin.id, req);

  return {
    twoFactorRequired: false as const,
    admin: publicAdmin(admin),
    ...tokens,
  };
}

const publicAdmin = (a: {
  id: string; email: string; name: string;
  role: { id: string; name: string; slug: string; level: number;
          permissions: { permission: { key: string } }[] };
}) => ({
  id: a.id, email: a.email, name: a.name,
  role: { id: a.role.id, name: a.role.name, slug: a.role.slug, level: a.role.level },
  permissions: a.role.permissions.map((p) => p.permission.key),
});

/**
 * The between-steps ticket.
 *
 * Not an access token: it authorises exactly one endpoint, carries its own
 * type, and expires in five minutes. A password that has not yet met its second
 * factor must not open anything.
 */
const TICKET_TTL = '5m';

const issueTicket = (adminId: string) =>
  jwt.sign({ sub: adminId, typ: 'admin-2fa' }, env.JWT_ACCESS_SECRET, { expiresIn: TICKET_TTL });

export async function completeTwoFactor(challengeToken: string, code: string, req?: Request) {
  let adminId: string;
  try {
    const payload = jwt.verify(challengeToken, env.JWT_ACCESS_SECRET) as jwt.JwtPayload;
    if (payload.typ !== 'admin-2fa' || !payload.sub) throw new Error('wrong type');
    adminId = String(payload.sub);
  } catch {
    throw unauthorized('That sign-in attempt expired. Start again.');
  }

  const admin = await prisma.adminUser.findUnique({
    where: { id: adminId },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  if (!admin || !admin.isActive) throw unauthorized();
  assertNotLocked(admin);

  const result = await twoFactor.verifyChallenge('ADMIN', adminId, code);
  if (!result.ok) {
    // Wrong second factors count towards the lockout too, or the code is six
    // digits with unlimited guesses.
    await recordFailure('ADMIN', admin);
    throw unauthorized('That code is not correct');
  }

  await recordSuccess('ADMIN', admin);
  await prisma.adminUser.update({ where: { id: adminId }, data: { lastLoginAt: new Date() } });
  const tokens = await sessions.issue('ADMIN', adminId, req);

  return { twoFactorRequired: false as const, admin: publicAdmin(admin), ...tokens };
}

// ── enrolment, from inside the console ──

/**
 * Every state change re-checks the password. An open console is not proof of
 * identity for this: a borrowed laptop must not be able to turn the protection
 * off, or turn it on and lock the real operator out.
 */
async function assertPassword(adminId: string, password: string) {
  const admin = await prisma.adminUser.findUnique({
    where: { id: adminId },
    select: { passwordHash: true, email: true },
  });
  if (!admin) throw unauthorized();
  if (!(await bcrypt.compare(password, admin.passwordHash))) {
    throw unauthorized('Your password is not correct');
  }
  return admin;
}

export const twoFactorStatus = (adminId: string) => twoFactor.status('ADMIN', adminId);

export async function beginTwoFactor(adminId: string, password: string) {
  const admin = await assertPassword(adminId, password);
  return twoFactor.beginEnrolment('ADMIN', adminId, admin.email);
}

export async function confirmTwoFactor(adminId: string, code: string, req?: Request) {
  await twoFactor.confirmEnrolment('ADMIN', adminId, code);
  const admin = await prisma.adminUser.findUniqueOrThrow({
    where: { id: adminId },
    select: { email: true },
  });

  await audit.record({
    adminId, action: 'UPDATE', entityType: 'admin', entityId: adminId,
    summary: `${admin.email} turned on two-factor authentication`, req,
  });
  return { enabled: true };
}

export async function disableTwoFactor(adminId: string, password: string, code: string, req?: Request) {
  const admin = await assertPassword(adminId, password);
  await twoFactor.disable('ADMIN', adminId, code);

  // Removing a second factor from a console account is exactly the sort of
  // change that must be visible to everyone else afterwards.
  await audit.record({
    adminId, action: 'UPDATE', entityType: 'admin', entityId: adminId,
    summary: `${admin.email} turned OFF two-factor authentication`, req,
  });
  notifyAdmins({
    type: 'system.admin_changed',
    title: 'An operator turned off two-factor',
    body: `${admin.email} removed the second factor from their console account.`,
    exceptAdminId: adminId,
  });
  return { enabled: false };
}

export const refresh = (token: string, req?: Request) => sessions.rotate(token, req);

export const logout = (token: string) => sessions.revoke(token);

export const activeSessions = (adminId: string) => sessions.listFor('ADMIN', adminId);

export const endSession = (adminId: string, sessionId: string) =>
  sessions.revokeById('ADMIN', adminId, sessionId);

export async function me(adminId: string) {
  const a = await prisma.adminUser.findUnique({
    where: { id: adminId },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  if (!a) throw unauthorized();
  return {
    id: a.id, email: a.email, name: a.name, lastLoginAt: a.lastLoginAt,
    role: { id: a.role.id, name: a.role.name, slug: a.role.slug, level: a.role.level },
    permissions: a.role.permissions.map((p) => p.permission.key),
  };
}
