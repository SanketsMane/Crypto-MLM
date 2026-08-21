import type { Request, Response } from 'express';
import { prisma } from '../../core/db.js';
import { connection } from '../../jobs/queue.js';
import { logger } from '../../core/logger.js';

/**
 * Health probes, in the two flavours an orchestrator actually needs.
 *
 * `/health` answers "is this process alive?" — it must stay cheap and must not
 * touch a dependency. A liveness probe that fails when the database blips gets
 * the container killed and restarted, which does nothing for a database problem
 * and turns a brief outage into a crash loop.
 *
 * `/ready` answers "should traffic be sent here?" — that one does check
 * dependencies, because a process which cannot reach Postgres should leave the
 * load balancer rather than serve errors.
 *
 * What was here before was one endpoint returning `{status:'ok'}`
 * unconditionally, which cannot distinguish either case.
 */

const startedAt = Date.now();

const uptime = () => Math.floor((Date.now() - startedAt) / 1000);

/** Liveness. No I/O — if the event loop turns, the process is alive. */
export const live = (_req: Request, res: Response) => {
  res.json({
    success: true,
    status: 'ok',
    uptimeSeconds: uptime(),
    ts: new Date().toISOString(),
  });
};

interface Check { ok: boolean; latencyMs: number; error?: string }

async function timed(name: string, fn: () => Promise<unknown>): Promise<Check> {
  const started = Date.now();
  try {
    await fn();
    return { ok: true, latencyMs: Date.now() - started };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err, check: name }, 'readiness check failed');
    return { ok: false, latencyMs: Date.now() - started, error: message.slice(0, 200) };
  }
}

/**
 * Readiness. Checks what serving a request would actually need.
 *
 * Redis is reported but does NOT fail the probe. It backs the job queue, so
 * Redis being down means payouts are delayed — not that a member cannot read
 * their balance. Pulling the whole API out of rotation for that would turn a
 * background problem into a total outage.
 */
export const ready = async (_req: Request, res: Response) => {
  const [database, redis] = await Promise.all([
    timed('database', () => prisma.$queryRaw`SELECT 1`),
    timed('redis', () => connection.ping()),
  ]);

  const ok = database.ok;
  res.status(ok ? 200 : 503).json({
    success: ok,
    status: ok ? 'ready' : 'not-ready',
    uptimeSeconds: uptime(),
    checks: {
      database,
      // Degraded rather than down — see above.
      redis: { ...redis, required: false },
    },
    ts: new Date().toISOString(),
  });
};
