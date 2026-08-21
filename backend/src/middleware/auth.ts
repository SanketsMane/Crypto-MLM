import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../core/db.js';
import { AppError, unauthorized } from '../core/errors.js';
import { currentContext } from './request-context.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      sessionId?: string;
      adminId?: string;
      /** True when a support operator opened this session. */
      readOnlySession?: boolean;
    }
  }
}

/**
 * A valid signature is not enough.
 *
 * An access token proves who signed in, but not that they are still allowed to
 * be here. Blocking a member, or ending a stolen session, has to take effect
 * now — not in fifteen minutes when the token happens to expire. So the
 * session behind the token is checked against the database, with a short cache
 * so it does not cost a query per request. Same trade-off, and same window, as
 * the admin permission cache.
 */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

interface Cached { at: number; ok: boolean }
const CACHE = new Map<string, Cached>();
const TTL_MS = 30_000;

/** Drops a session from the cache so a revocation in this process is instant. */
export const invalidateSession = (sessionId: string) => CACHE.delete(sessionId);
export const clearSessionCache = () => CACHE.clear();

async function sessionIsLive(sessionId: string, userId: string): Promise<boolean> {
  const hit = CACHE.get(sessionId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.ok;

  const [session, user] = await Promise.all([
    prisma.session.findUnique({
      where: { id: sessionId },
      select: { actorId: true, revokedAt: true, expiresAt: true },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { status: true } }),
  ]);

  const ok =
    !!session &&
    session.actorId === userId &&
    !session.revokedAt &&
    session.expiresAt > new Date() &&
    user?.status === 'ACTIVE';

  CACHE.set(sessionId, { at: Date.now(), ok });
  return ok;
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(unauthorized('Missing bearer token'));

  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as jwt.JwtPayload;
  } catch {
    return next(unauthorized('Token expired or invalid'));
  }
  if (payload.typ !== 'access' || !payload.sub) return next(unauthorized());

  const userId = String(payload.sub);
  const sessionId = payload.sid ? String(payload.sid) : null;

  // Tokens minted before sessions existed carry no `sid`. There is no session
  // to check them against, so they are not honoured — the holder signs in again.
  if (!sessionId) return next(unauthorized('Please sign in again'));

  sessionIsLive(sessionId, userId)
    .then((ok) => {
      if (!ok) return next(unauthorized('Session ended. Please sign in again.'));
      req.userId = userId;
      req.sessionId = sessionId;
      req.readOnlySession = payload.ro === true;

      /**
       * A support-opened session reads everything and changes nothing.
       *
       * Enforced here rather than as a separate middleware because this is
       * where the flag becomes known — a guard mounted earlier in the chain
       * runs before authentication and sees nothing, and one mounted per-route
       * is one that eventually gets forgotten on a new money route.
       */
      if (req.readOnlySession && !SAFE_METHODS.has(req.method)) {
        return next(new AppError(
          'This account is open in support view. You can look at anything here, but changes have to be made by the member themselves.',
          403,
          'READ_ONLY_SESSION',
        ));
      }

      // From here on, every log line for this request names who made it.
      const ctx = currentContext();
      if (ctx) { ctx.actorType = 'USER'; ctx.actorId = userId; }

      next();
    })
    .catch(next);
}
