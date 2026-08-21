import crypto from 'node:crypto';
import type { ActorType } from '@prisma/client';
import type { Request } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from './db.js';
import { unauthorized } from './errors.js';
import { logger } from './logger.js';
import { env } from '../config/env.js';

/**
 * Sessions: refresh tokens that can actually be revoked.
 *
 * The access token stays a short-lived JWT — stateless verification is the
 * point of it, and 15 minutes bounds the damage. The refresh token is the one
 * that matters: it lives for 30 days, and as a bare JWT it was unrevocable.
 * Blocking an account did nothing to it, a leak could not be contained, and
 * nobody could see or end a session.
 *
 * So the refresh token is now a 32-byte random secret, stored only as a
 * SHA-256 digest. Refreshing rotates it: the presented token is retired and a
 * successor issued into the same family. Presenting a retired token means two
 * parties hold tokens from one chain, which is theft, and the whole family is
 * revoked. Reads are by digest, so the raw token never touches the database.
 */

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

const REFRESH_TTL_MS = ttlToMs(env.JWT_REFRESH_TTL, 30 * 24 * 3_600_000);

const hash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const secret = () => crypto.randomBytes(32).toString('base64url');

const signAccess = (actorType: ActorType, actorId: string, sessionId: string, readOnly = false) =>
  jwt.sign(
    {
      sub: actorId,
      typ: actorType === 'ADMIN' ? 'admin' : 'access',
      sid: sessionId,
      // Carried in the token as well as the row, so the read-only guard does
      // not need a database read on every request to know.
      ...(readOnly ? { ro: true } : {}),
    },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'] },
  );

/** Where the request came from — recorded so a member can recognise a session. */
export const originOf = (req?: Request) => ({
  userAgent: req?.get('user-agent')?.slice(0, 255) ?? null,
  ip: req?.ip ?? null,
});

/** Starts a new session. Called on a successful sign-in. */
export interface IssueOptions {
  /**
   * Set when a support operator opened this session. The session is marked
   * read-only and money-moving routes refuse it — an operator can look at an
   * account, never act on it.
   */
  impersonatedBy?: string;
  /** Overrides the refresh lifetime. Impersonation gets minutes, not days. */
  ttlMinutes?: number;
}

export async function issue(
  actorType: ActorType,
  actorId: string,
  req?: Request,
  opts: IssueOptions = {},
): Promise<TokenPair> {
  const token = secret();
  const familyId = crypto.randomUUID();
  const ttl = opts.ttlMinutes ? opts.ttlMinutes * 60_000 : REFRESH_TTL_MS;

  const session = await prisma.session.create({
    data: {
      actorType,
      actorId,
      familyId,
      tokenHash: hash(token),
      expiresAt: new Date(Date.now() + ttl),
      impersonatedBy: opts.impersonatedBy,
      ...originOf(req),
    },
  });

  return {
    accessToken: signAccess(actorType, actorId, session.id, Boolean(opts.impersonatedBy)),
    refreshToken: token,
    expiresIn: ttlToMs(env.JWT_ACCESS_TTL, 900_000) / 1000,
  };
}

/**
 * Exchanges a refresh token for a new pair, retiring the one presented.
 *
 * Anything other than "this is the live token of an unexpired session" is
 * treated as hostile, because in normal operation it cannot happen.
 */
export async function rotate(token: string, req?: Request): Promise<TokenPair> {
  if (!token) throw unauthorized('Invalid refresh token');

  const existing = await prisma.session.findUnique({ where: { tokenHash: hash(token) } });
  if (!existing) throw unauthorized('Invalid refresh token');

  if (existing.revokedAt) {
    // A retired token came back. The real client has already moved on to its
    // successor, so whoever sent this is holding a copy. We cannot tell which
    // party is legitimate, so the entire chain goes.
    await revokeFamily(existing.familyId, 'REFRESH_TOKEN_REUSED');
    logger.warn(
      { actorType: existing.actorType, actorId: existing.actorId, familyId: existing.familyId },
      'refresh token reuse detected — session family revoked',
    );
    throw unauthorized('Session ended for security reasons. Please sign in again.');
  }

  if (existing.expiresAt <= new Date()) {
    throw unauthorized('Session expired. Please sign in again.');
  }

  const next = secret();
  const created = await prisma.$transaction(async (tx) => {
    // Retire the presented token first. If two refreshes race, the second
    // finds it already revoked and trips the reuse path — which is correct.
    const { count } = await tx.session.updateMany({
      where: { id: existing.id, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'ROTATED', lastUsedAt: new Date() },
    });
    if (count === 0) throw unauthorized('Invalid refresh token');

    return tx.session.create({
      data: {
        actorType: existing.actorType,
        actorId: existing.actorId,
        familyId: existing.familyId,
        tokenHash: hash(next),
        expiresAt: existing.expiresAt, // rotation does not extend the lifetime
        // A rotated impersonation session stays an impersonation session.
        impersonatedBy: existing.impersonatedBy,
        ...originOf(req),
      },
    });
  });

  return {
    accessToken: signAccess(created.actorType, created.actorId, created.id, created.impersonatedBy !== null),
    refreshToken: next,
    expiresIn: ttlToMs(env.JWT_ACCESS_TTL, 900_000) / 1000,
  };
}

/** Who a refresh token belongs to, so a sign-out can be attributed. */
export async function ownerOf(token: string): Promise<string | null> {
  const row = await prisma.session.findUnique({
    where: { tokenHash: hash(token) },
    select: { actorType: true, actorId: true },
  });
  return row?.actorType === 'USER' ? row.actorId : null;
}

/** Ends one session — a sign-out on this device. */
export async function revoke(token: string, reason = 'LOGOUT') {
  await prisma.session.updateMany({
    where: { tokenHash: hash(token), revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
}

export async function revokeFamily(familyId: string, reason: string) {
  await prisma.session.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
}

/**
 * Ends every session for an account. Called on sign-out-everywhere, on a
 * password change, and whenever an admin blocks or suspends a member — a block
 * that leaves the member's tokens working is not a block.
 */
export async function revokeAllFor(actorType: ActorType, actorId: string, reason: string) {
  const { count } = await prisma.session.updateMany({
    where: { actorType, actorId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
  if (count) logger.info({ actorType, actorId, count, reason }, 'sessions revoked');
  return count;
}

/** Sessions a member can see and end from their security settings. */
export async function listFor(actorType: ActorType, actorId: string) {
  const rows = await prisma.session.findMany({
    where: { actorType, actorId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, userAgent: true, ip: true, createdAt: true, lastUsedAt: true, expiresAt: true },
  });
  return rows;
}

export async function revokeById(actorType: ActorType, actorId: string, sessionId: string) {
  const { count } = await prisma.session.updateMany({
    where: { id: sessionId, actorType, actorId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: 'REVOKED_BY_USER' },
  });
  if (!count) throw unauthorized('Session not found');
}

/** Drops rows past their expiry. Runs on the maintenance schedule. */
export async function purgeExpiredSessions() {
  const { count } = await prisma.session.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 7 * 24 * 3_600_000) } },
  });
  if (count) logger.info({ count }, 'expired sessions purged');
  return count;
}

/** "15m" / "30d" / "3600" → milliseconds. */
function ttlToMs(ttl: string, fallback: number): number {
  const m = /^(\d+)([smhd])?$/.exec(ttl.trim());
  if (!m) return fallback;
  const n = Number(m[1]);
  const unit = m[2] ?? 's';
  const factor = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit] ?? 1_000;
  return n * factor;
}
