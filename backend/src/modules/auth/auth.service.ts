import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Request } from 'express';
import { prisma } from '../../core/db.js';
import * as sessions from '../../core/sessions.js';
import { assertNotLocked, recordFailure, recordSuccess } from '../../core/login-attempts.js';
import * as activity from '../../core/activity.js';
import { notifyAdmins, notifyMember } from '../../core/notify.js';
import * as twoFactor from '../../core/two-factor.js';
import { CURRENT_VERSIONS } from '../privacy/privacy.service.js';
import { ensureWallets } from '../../core/ledger.js';
import { buildPath } from '../../core/tree.js';
import { findPlacement, place } from '../../core/binary.js';
import { userCode } from '../../core/reference.js';
import { badRequest, conflict, notFound, unauthorized } from '../../core/errors.js';
import { env } from '../../config/env.js';
import { config } from '../../core/runtime-config.js';
import type { RegisterInput, LoginInput } from './auth.validation.js';

export type TokenPair = sessions.TokenPair;

export async function register(input: RegisterInput, req?: Request) {
  const cfg = await config();
  if (!cfg.registrationOpen) throw badRequest('Registration is currently closed');

  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw conflict('An account with that email already exists');

  let sponsor: { id: string; path: string; depth: number } | null = null;
  if (input.sponsorCode) {
    sponsor = await prisma.user.findUnique({
      where: { userCode: input.sponsorCode },
      select: { id: true, path: true, depth: true },
    });
    if (!sponsor) throw badRequest('Sponsor code not found');
  }

  const passwordHash = await bcrypt.hash(input.password, 12);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        userCode: userCode(),
        email: input.email,
        phone: input.phone,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        walletAddress: input.walletAddress,
        sponsorId: sponsor?.id,
        path: sponsor ? buildPath(sponsor.path, sponsor.id) : '',
        depth: sponsor ? sponsor.depth + 1 : 0,
        status: 'ACTIVE',
      },
    });

    await ensureWallets(created.id, tx);
    await tx.teamVolume.create({ data: { userId: created.id } });

    /* Binary needs a second decision at signup: sponsorship says who
       introduced you, placement says where you sit for payout. Under unilevel
       there is nothing to decide, so these columns stay empty. */
    if (sponsor && (await config()).planStructure === 'BINARY') {
      const slot = await findPlacement(sponsor.id, tx);
      if (slot) await place(created.id, slot, tx);
    }

    if (sponsor) {
      await tx.$executeRaw`
        UPDATE users SET "directCount" = "directCount" + 1 WHERE id = ${sponsor.id}`;
    }
    return created;
  });

  /**
   * Signing up is acceptance.
   *
   * The registration form says so, so the record has to exist from the first
   * moment — a platform that cannot show which version of its terms a member
   * agreed to at signup has no record worth having.
   */
  await prisma.consentRecord.createMany({
    data: (Object.keys(CURRENT_VERSIONS) as (keyof typeof CURRENT_VERSIONS)[]).map((document) => ({
      userId: user.id,
      document,
      version: CURRENT_VERSIONS[document],
      ip: req?.ip ?? null,
      userAgent: req?.get('user-agent')?.slice(0, 255) ?? null,
    })),
    skipDuplicates: true,
  });

  activity.record({ userId: user.id, event: 'SIGNED_IN', summary: 'Account created', req });

  const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.userCode;

  if (sponsor) {
    notifyMember({
      userId: sponsor.id,
      type: 'referral.joined',
      dedupeKey: `referral:${user.id}`,
      title: 'New direct referral',
      body: `${displayName} joined using your referral link.`,
      meta: { userId: user.id, userCode: user.userCode },
    });
  }

  notifyAdmins({
    type: 'ops.member_registered',
    dedupeKey: `registered:${user.id}`,
    title: 'New member registered',
    body: `${displayName} (${user.userCode}) created an account.`,
    link: `/admin/users/${user.id}`,
    meta: { userId: user.id },
  });
  return {
    twoFactorRequired: false as const,
    user: publicUser(user),
    tokens: await sessions.issue('USER', user.id, req),
  };
}

export async function login(input: LoginInput, req?: Request) {
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: input.emailOrCode }, { userCode: input.emailOrCode }] },
  });
  // The same message for an unknown account and a wrong password, so the
  // response cannot be used to enumerate who has an account here.
  if (!user) throw unauthorized('Invalid credentials');

  assertNotLocked(user);

  if (!(await bcrypt.compare(input.password, user.passwordHash))) {
    activity.record({
      userId: user.id, event: 'SIGN_IN_FAILED', req,
      summary: 'Failed sign-in attempt — wrong password',
    });
    await recordFailure('USER', user);
    throw unauthorized('Invalid credentials');
  }
  if (user.status === 'BLOCKED' || user.status === 'SUSPENDED') {
    throw unauthorized('This account is not active');
  }

  await recordSuccess('USER', user);

  // The password was right, but with 2FA on it is only half the credential.
  // No session is created here — the caller comes back with a code.
  if (user.twoFactorEnabledAt) {
    return {
      twoFactorRequired: true as const,
      challengeToken: issueTwoFactorTicket(user.id),
      user: null,
      tokens: null,
    };
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  activity.record({ userId: user.id, event: 'SIGNED_IN', summary: 'Signed in', req });
  await noticeNewDevice(user.id, req);
  return {
    twoFactorRequired: false as const,
    user: publicUser(user),
    tokens: await sessions.issue('USER', user.id, req),
  };
}

/**
 * The second step of sign-in.
 *
 * Between the two steps the client holds a short-lived ticket rather than a
 * session. It is deliberately not an access token: it authorises exactly one
 * thing, expires in five minutes, and is useless against any other endpoint.
 */
const TWO_FACTOR_TICKET_TTL = '5m';

const issueTwoFactorTicket = (userId: string) =>
  jwt.sign({ sub: userId, typ: '2fa' }, env.JWT_ACCESS_SECRET, {
    expiresIn: TWO_FACTOR_TICKET_TTL,
  });

export async function completeTwoFactor(challengeToken: string, code: string, req?: Request) {
  let userId: string;
  try {
    const payload = jwt.verify(challengeToken, env.JWT_ACCESS_SECRET) as jwt.JwtPayload;
    if (payload.typ !== '2fa' || !payload.sub) throw new Error('wrong type');
    userId = String(payload.sub);
  } catch {
    throw unauthorized('That sign-in attempt expired. Start again.');
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw unauthorized();
  assertNotLocked(user);

  const result = await twoFactor.verifyChallenge('USER', userId, code);
  if (!result.ok) {
    activity.record({
      userId, event: 'SIGN_IN_FAILED', req,
      summary: 'Failed sign-in attempt — wrong two-factor code',
    });
    // Wrong second factors count towards the lockout too. Otherwise the code is
    // six digits with unlimited guesses.
    await recordFailure('USER', user);
    throw unauthorized('That code is not correct');
  }

  await recordSuccess('USER', user);
  await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });

  if (result.usedRecoveryCode) {
    activity.record({
      userId, event: 'TWO_FACTOR_RECOVERY_USED', req,
      summary: 'Signed in with a recovery code — that code has now been used up',
    });
    notifyMember({
      userId,
      type: 'security.recovery_used',
      title: 'A recovery code was used',
      body: 'Someone signed in with one of your two-factor recovery codes. That code no longer works. If this was not you, change your password immediately.',
    });
  } else {
    activity.record({ userId, event: 'SIGNED_IN', summary: 'Signed in', req });
  }

  await noticeNewDevice(userId, req);
  return {
    twoFactorRequired: false as const,
    user: publicUser(user),
    tokens: await sessions.issue('USER', userId, req),
    usedRecoveryCode: result.usedRecoveryCode,
  };
}

/**
 * Flags a sign-in from somewhere this account has not been seen before.
 *
 * "You signed in" on every sign-in is noise nobody reads. "You signed in from a
 * device we have not seen" is the one line that catches a stolen password — so
 * only the unfamiliar case is worth a notification.
 */
async function noticeNewDevice(userId: string, req?: Request) {
  const userAgent = req?.get('user-agent')?.slice(0, 255);
  const ip = req?.ip;
  if (!userAgent && !ip) return;

  const seenBefore = await prisma.session.findFirst({
    where: { actorType: 'USER', actorId: userId, OR: [{ userAgent }, { ip }] },
    select: { id: true },
  });
  if (seenBefore) return;

  notifyMember({
    userId,
    type: 'security.new_device',
    title: 'Sign-in from a new device',
    body: `Someone signed in from ${ip ?? 'an unknown address'}. If this was not you, change your password and end the session from your security settings.`,
    meta: { ip, userAgent },
  });
}

export const refresh = (token: string, req?: Request) => sessions.rotate(token, req);

export async function logout(token: string, req?: Request) {
  const userId = await sessions.ownerOf(token);
  await sessions.revoke(token);
  if (userId) activity.record({ userId, event: 'SIGNED_OUT', summary: 'Signed out', req });
}

export async function logoutEverywhere(userId: string, req?: Request) {
  const count = await sessions.revokeAllFor('USER', userId, 'LOGOUT_ALL');
  activity.record({
    userId, event: 'SESSION_REVOKED', req,
    summary: `Signed out of all devices — ${count} session${count === 1 ? '' : 's'} ended`,
  });
  return count;
}

export const activeSessions = (userId: string) => sessions.listFor('USER', userId);

export async function endSession(userId: string, sessionId: string, req?: Request) {
  await sessions.revokeById('USER', userId, sessionId);
  activity.record({ userId, event: 'SESSION_REVOKED', summary: 'Ended a session from security settings', req });
}

export const publicUser = (u: {
  id: string; userCode: string; email: string; firstName: string;
  lastName: string | null; status: string; affiliateMode: string; walletAddress: string | null;
}) => ({
  id: u.id, userCode: u.userCode, email: u.email,
  firstName: u.firstName, lastName: u.lastName,
  status: u.status, affiliateMode: u.affiliateMode, walletAddress: u.walletAddress,
});

export const me = async (userId: string) => {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    include: { currentRank: { select: { code: true, name: true } } },
  });
  if (!u) throw unauthorized();
  return {
    ...publicUser(u),
    totalInvested: u.totalInvested.toString(),
    totalEarned: u.totalEarned.toString(),
    directCount: u.directCount,
    // Surfaced so the account page can prompt for verification — password
    // resets and withdrawal codes both land at this address.
    emailVerifiedAt: u.emailVerifiedAt,
    twoFactorEnabled: u.twoFactorEnabledAt !== null,
    rank: u.currentRank,
    sponsorId: u.sponsorId,
    createdAt: u.createdAt,
  };
};

export const activityTrail = (userId: string, opts: activity.ListOptions) =>
  activity.listFor(userId, opts);

/**
 * Confirm a referral code before someone registers under it.
 *
 * A sponsor code is meant to be shared — it travels in referral links and is
 * quoted in messages — so confirming one is not a disclosure. What it prevents
 * is worse: a member mistyping a code and landing permanently in the wrong
 * upline, which cannot be corrected afterwards because every commission
 * depends on placement.
 *
 * Only a display name comes back. Nothing about the account's balances,
 * network or activity is exposed, and a suspended or blocked account is
 * reported as not found so it cannot be used to recruit.
 */
export async function lookupSponsor(code: string) {
  const sponsor = await prisma.user.findUnique({
    where: { userCode: code.trim().toUpperCase() },
    select: { userCode: true, firstName: true, lastName: true, status: true },
  });

  if (!sponsor || (sponsor.status !== 'ACTIVE' && sponsor.status !== 'PENDING')) {
    throw notFound('That sponsor code does not match an account');
  }

  // First name plus a last initial: enough to recognise the person who
  // invited you, not enough to build a directory from.
  const initial = sponsor.lastName?.trim()?.[0];
  return {
    userCode: sponsor.userCode,
    name: [sponsor.firstName, initial ? `${initial}.` : null].filter(Boolean).join(' '),
  };
}
