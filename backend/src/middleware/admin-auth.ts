import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../core/db.js';
import { forbidden, unauthorized } from '../core/errors.js';
import { config } from '../core/runtime-config.js';
import { allowed } from '../core/ip-allowlist.js';
import { logger } from '../core/logger.js';
import { currentContext } from './request-context.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: {
        id: string;
        roleId: string;
        roleSlug: string;
        roleLevel: number;
        permissions: Set<string>;
      };
    }
  }
}

interface Cached { at: number; value: NonNullable<Request['admin']> }
const CACHE = new Map<string, Cached>();
const TTL_MS = 30_000;

/**
 * Permissions are read from the database, not from the token, so revoking a
 * grant takes effect within 30 seconds rather than whenever the token expires.
 * A short cache keeps that from costing a query on every request.
 */
async function loadAdmin(adminId: string) {
  const hit = CACHE.get(adminId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const admin = await prisma.adminUser.findUnique({
    where: { id: adminId },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  if (!admin || !admin.isActive) return null;

  const value = {
    id: admin.id,
    roleId: admin.roleId,
    roleSlug: admin.role.slug,
    roleLevel: admin.role.level,
    permissions: new Set(admin.role.permissions.map((rp) => rp.permission.key)),
  };
  CACHE.set(adminId, { at: Date.now(), value });
  return value;
}

/** Drop a cached grant set immediately after a role or admin change. */
export const invalidateAdmin = (adminId?: string) =>
  adminId ? CACHE.delete(adminId) : CACHE.clear();

/** Drop cached session verdicts — used by tests and by in-process revocation. */
export const clearAdminSessionCache = () => SESSIONS.clear();

/**
 * Is the session behind this token still live?
 *
 * Deactivating an admin, resetting their password, or ending a stolen session
 * has to take effect immediately. Cached for the same 30 seconds as the grant
 * set above, for the same reason.
 */
interface SessionCached { at: number; ok: boolean }
const SESSIONS = new Map<string, SessionCached>();

async function adminSessionIsLive(sessionId: string, adminId: string): Promise<boolean> {
  const hit = SESSIONS.get(sessionId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.ok;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { actorType: true, actorId: true, revokedAt: true, expiresAt: true },
  });
  const ok =
    !!session &&
    session.actorType === 'ADMIN' &&
    session.actorId === adminId &&
    !session.revokedAt &&
    session.expiresAt > new Date();

  SESSIONS.set(sessionId, { at: Date.now(), ok });
  return ok;
}

export async function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  /**
   * Network restriction, before anything else.
   *
   * Checked ahead of the token so a request from outside the allowlist never
   * reaches the authentication path at all — there is nothing to brute-force
   * from an address that cannot get a reply.
   */
  const cfg = await config();
  if (!allowed(req.ip, cfg.adminIpAllowlist)) {
    logger.warn({ ip: req.ip, path: req.path }, 'admin request refused — address not on the allowlist');
    return next(forbidden('The admin console is not available from this network'));
  }

  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(unauthorized('Missing bearer token'));

  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as jwt.JwtPayload;
  } catch {
    return next(unauthorized('Token expired or invalid'));
  }

  try {
    if (payload.typ !== 'admin' || !payload.sub) return next(forbidden('Admin access required'));

    // Tokens minted before sessions existed carry no `sid` and cannot be
    // checked against anything, so they are not honoured.
    const sessionId = payload.sid ? String(payload.sid) : null;
    if (!sessionId) return next(unauthorized('Please sign in again'));

    const adminId = String(payload.sub);
    if (!(await adminSessionIsLive(sessionId, adminId))) {
      return next(unauthorized('Session ended. Please sign in again.'));
    }

    /**
     * Idle timeout.
     *
     * A console left open on an unattended machine stays signed in for the full
     * token life otherwise. Measured from the session's last use, which is
     * stamped below on every authenticated request.
     */
    if (cfg.adminIdleTimeoutMinutes > 0) {
      const session = await prisma.session.findUnique({
        where: { id: sessionId },
        select: { lastUsedAt: true, createdAt: true },
      });
      const since = session?.lastUsedAt ?? session?.createdAt;
      if (since && Date.now() - since.getTime() > cfg.adminIdleTimeoutMinutes * 60_000) {
        await prisma.session.updateMany({
          where: { id: sessionId, revokedAt: null },
          data: { revokedAt: new Date(), revokedReason: 'IDLE_TIMEOUT' },
        });
        SESSIONS.delete(sessionId);
        return next(unauthorized('Signed out after a period of inactivity. Please sign in again.'));
      }
    }

    const admin = await loadAdmin(adminId);
    if (!admin) return next(unauthorized('Account is inactive'));

    req.admin = admin;
    req.adminId = admin.id;
    req.sessionId = sessionId;

    // Admin actions are the ones most likely to be reconstructed later.
    const ctx = currentContext();
    if (ctx) { ctx.actorType = 'ADMIN'; ctx.actorId = admin.id; }

    // Stamped off the request path — the idle clock must not cost the caller a
    // write it has to wait for.
    void prisma.session
      .updateMany({ where: { id: sessionId, revokedAt: null }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);

    next();
  } catch (err) {
    next(err);
  }
}

/** Gate a route on a capability key, never on a role name. */
export const can =
  (...required: string[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    const admin = req.admin;
    if (!admin) return next(unauthorized());
    const missing = required.filter((k) => !admin.permissions.has(k));
    if (missing.length) return next(forbidden(`Missing permission: ${missing.join(', ')}`));
    next();
  };

/**
 * Seniority guard. An operator may only act on roles strictly less senior than
 * their own, so a manager cannot edit the owner role or grant themselves more.
 */
export const outranks = (actorLevel: number, targetLevel: number) => actorLevel < targetLevel;
