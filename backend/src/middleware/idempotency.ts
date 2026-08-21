import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { ActorType } from '@prisma/client';
import { prisma } from '../core/db.js';
import { AppError, badRequest, unauthorized } from '../core/errors.js';
import { logger } from '../core/logger.js';

/**
 * Idempotency for money-mutating endpoints.
 *
 * The ledger refuses a replayed *payout* because every entry carries a unique
 * reference. It cannot refuse a replayed *request*: a double-clicked Invest
 * button produces two separate intents, each generating its own reference, and
 * both look entirely legitimate on the way in. The member is simply charged
 * twice. That was reproducible — see tests/compensation.test.ts.
 *
 * So the intent itself has to be unique. The client sends an `Idempotency-Key`
 * with the submission and keeps it across retries; the first request through
 * claims the key and runs, and anything arriving afterwards with the same key
 * is answered from the stored response instead of executing again.
 *
 * Semantics, chosen to match what payment processors do:
 *
 *   first request      → claim the key, run the handler, store the 2xx response
 *   replay, completed  → 200/201 with the stored body + `Idempotency-Replayed: true`
 *   replay, in flight  → 409, because we do not yet know the outcome to return
 *   same key, new body → 422; the client has a bug and must not be served a
 *                        cached response belonging to a different request
 *   handler failed     → the key is released, so a genuine retry can proceed
 *
 * Keys are scoped per actor, so no caller can ever read another's response.
 */

const TTL_HOURS = 24;
const HEADER = 'idempotency-key';

const hashBody = (body: unknown) =>
  crypto.createHash('sha256').update(JSON.stringify(body ?? {})).digest('hex');

/** A key must be client-generated and unguessable — a UUID, or anything like one. */
const VALID_KEY = /^[A-Za-z0-9._~-]{16,255}$/;

export function idempotent(req: Request, res: Response, next: NextFunction) {
  // Member routes authenticate as a user, admin routes as an admin; either is a
  // valid actor, and the key namespace keeps the two apart.
  const actorType: ActorType = req.adminId ? 'ADMIN' : 'USER';
  const actorId = req.adminId ?? req.userId;
  if (!actorId) return next(unauthorized());

  const key = req.header(HEADER)?.trim();
  if (!key) {
    return next(
      new AppError(
        'This request moves money and requires an Idempotency-Key header.',
        400,
        'IDEMPOTENCY_KEY_REQUIRED',
      ),
    );
  }
  if (!VALID_KEY.test(key)) {
    return next(badRequest('Idempotency-Key must be 16–255 characters of [A-Za-z0-9._~-]'));
  }

  const endpoint = `${req.method} ${req.baseUrl}${req.route?.path ?? req.path}`;
  const requestHash = hashBody(req.body);

  void run(req, res, next, { actorType, actorId, key, endpoint, requestHash });
}

interface Claim {
  actorType: ActorType;
  actorId: string;
  key: string;
  endpoint: string;
  requestHash: string;
}

async function run(req: Request, res: Response, next: NextFunction, claim: Claim) {
  const { actorType, actorId, key, endpoint, requestHash } = claim;
  const where = { actorType_actorId_key: { actorType, actorId, key } };
  const expiresAt = new Date(Date.now() + TTL_HOURS * 3_600_000);

  // Claiming the key IS the lock: the unique index on (actorType, actorId, key)
  // means exactly one concurrent request can win this insert.
  let claimed = false;
  try {
    await prisma.idempotencyKey.create({
      data: { actorType, actorId, key, endpoint, requestHash, expiresAt },
    });
    claimed = true;
  } catch {
    claimed = false;
  }

  if (!claimed) {
    const existing = await prisma.idempotencyKey.findUnique({ where });

    // Expired between the failed insert and this read — let it through fresh.
    if (!existing) return next();

    if (existing.requestHash !== requestHash || existing.endpoint !== endpoint) {
      return next(
        new AppError(
          'This Idempotency-Key was already used for a different request.',
          422,
          'IDEMPOTENCY_KEY_REUSED',
        ),
      );
    }

    if (existing.status === 'IN_FLIGHT') {
      return next(
        new AppError(
          'An identical request is already being processed. Retry in a moment.',
          409,
          'IDEMPOTENCY_IN_FLIGHT',
        ),
      );
    }

    logger.info({ actorType, actorId, key, endpoint }, 'idempotent replay served from store');
    res.setHeader('Idempotency-Replayed', 'true');
    return res.status(existing.statusCode ?? 200).json(existing.response);
  }

  // We own the key. Capture whatever the handler sends so a replay can repeat it.
  const originalJson = res.json.bind(res);
  let settled = false;

  res.json = (body: unknown) => {
    if (settled) return res;
    settled = true;

    const statusCode = res.statusCode;
    const finish =
      statusCode >= 200 && statusCode < 300
        ? prisma.idempotencyKey.update({
            where,
            data: { status: 'COMPLETED', statusCode, response: body as object },
          })
        : // A failed attempt must not be cached — the member has to be able to
          // fix the problem and submit the very same intent again.
          prisma.idempotencyKey.delete({ where });

    /**
     * The response waits for the record to land.
     *
     * Sending first and recording after leaves a window where the key still
     * reads IN_FLIGHT even though the work is done — so a client that retries
     * the moment it sees a timeout gets a spurious 409 instead of the answer we
     * already have. The window is small, which is exactly what makes it the
     * kind of bug that only appears under load.
     *
     * `finally` rather than `then`: if recording fails the member's purchase
     * still succeeded, and failing their request over a bookkeeping error would
     * be strictly worse. It is logged loudly instead.
     */
    void finish
      .catch((err: unknown) => logger.error({ err, actorId, key }, 'idempotency finalise failed'))
      .finally(() => originalJson(body));

    return res;
  };

  // If the handler throws, the error handler responds without touching res.json,
  // so release the key here too.
  res.on('finish', () => {
    if (settled) return;
    settled = true;
    prisma.idempotencyKey.delete({ where }).catch(() => undefined);
  });

  next();
}

/** Drops keys past their TTL. Runs on the maintenance schedule. */
export async function purgeExpiredIdempotencyKeys() {
  const { count } = await prisma.idempotencyKey.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  if (count) logger.info({ count }, 'expired idempotency keys purged');
  return count;
}
