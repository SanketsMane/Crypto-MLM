import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { prisma } from './db.js';
import { logger } from './logger.js';
import { isSimulating } from '../middleware/request-context.js';

/**
 * Error tracking.
 *
 * Structured logs already carry every failure with a correlation id, which is
 * most of the value — but only if somebody is reading them. Nobody reads logs
 * on a quiet Tuesday, and the failures that matter on a money platform are the
 * ones that happen twice a day to one member and never make a graph move.
 *
 * So faults are grouped and counted rather than streamed:
 *
 *   • **One row per fault, not per occurrence.** A broken endpoint hit a
 *     thousand times is one problem. A table with a thousand copies of it is a
 *     table nobody opens.
 *   • **Recording must never break the request.** Every write here is
 *     fire-and-forget and swallows its own errors, exactly like the activity
 *     trail. An error reporter that can itself throw during error handling
 *     turns a 500 into a crash.
 *   • **Alert on new, not on repeat.** The webhook fires the first time a
 *     fingerprint is seen. Firing on every occurrence is how alerting gets
 *     muted, and a muted alert is worse than none because it looks like cover.
 */

export type ErrorSource = 'REQUEST' | 'JOB' | 'UNCAUGHT' | 'UNHANDLED_REJECTION';

export interface CaptureContext {
  source: ErrorSource;
  route?: string;
  method?: string;
  statusCode?: number;
  requestId?: string;
  actorType?: string;
  actorId?: string;
  /** Extra label for job failures — which job it was. */
  job?: string;
}

const inFlight = new Set<Promise<unknown>>();

/** Waits for every started write to land. Shutdown and tests use this. */
export async function flushErrors() {
  while (inFlight.size) await Promise.allSettled([...inFlight]);
}

/**
 * Strips the parts of a message that differ between occurrences of the same
 * fault, so they group instead of producing a new row each time.
 *
 * Without this an error quoting a user id, an amount or a reference produces a
 * distinct fingerprint per member — which is precisely the "thousand rows of
 * one problem" this exists to avoid.
 */
function normalise(message: string): string {
  return message
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>')
    .replace(/\bc[a-z0-9]{24,}\b/gi, '<id>')
    .replace(/\b0x[0-9a-f]{6,}\b/gi, '<hex>')
    .replace(/\b\d+\.\d+\b/g, '<num>')
    .replace(/\b\d{2,}\b/g, '<num>')
    .replace(/'[^']*'/g, "'<v>'")
    .replace(/"[^"]*"/g, '"<v>"')
    .slice(0, 300);
}

/** The first stack frame inside our own code — where the fault actually is. */
function topAppFrame(stack: string | undefined): string {
  if (!stack) return '';
  for (const line of stack.split('\n').slice(1)) {
    if (line.includes('node_modules') || line.includes('node:internal')) continue;
    const m = /\(?([^()\s]+:\d+:\d+)\)?\s*$/.exec(line.trim());
    if (m) return m[1]!.replace(/^.*?[/\\](src[/\\].*)$/, '$1');
  }
  return '';
}

function fingerprintOf(name: string, message: string, stack: string | undefined, ctx: CaptureContext) {
  const parts = [name, normalise(message), topAppFrame(stack), ctx.route ?? '', ctx.job ?? ''];
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32);
}

/**
 * Posts once, when a fingerprint is first seen.
 *
 * Deliberately generic rather than tied to one vendor: any endpoint that
 * accepts JSON works — Sentry through a relay, a Slack incoming webhook, a
 * pager. Configure `ERROR_WEBHOOK_URL` or leave it unset and read the console.
 */
function notifyNew(row: { fingerprint: string; name: string; message: string; route: string | null; source: string }) {
  const url = process.env.ERROR_WEBHOOK_URL;
  if (!url) return;

  const body = JSON.stringify({
    text: `New error on FortuneX: ${row.name} — ${row.message}`,
    fingerprint: row.fingerprint,
    source: row.source,
    route: row.route,
    at: new Date().toISOString(),
  });

  // Short timeout: an unreachable alerting endpoint must not hold a socket open
  // while the platform is already having a bad day.
  const timeout = AbortSignal.timeout(5_000);
  void fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: timeout })
    .catch((err: unknown) => logger.warn({ err }, 'error webhook failed'));
}

export function captureError(err: unknown, ctx: CaptureContext): void {
  // A simulation is allowed to fail loudly in the log without filing a fault
  // against the platform — the run row already records it.
  if (isSimulating()) return;

  const error = err instanceof Error ? err : new Error(String(err));
  const name = error.name || 'Error';
  const message = (error.message || String(err)).slice(0, 1000);
  const stack = error.stack?.slice(0, 8000);
  const fingerprint = fingerprintOf(name, message, stack, ctx);

  const now = new Date();
  const work = prisma.errorEvent
    .upsert({
      where: { fingerprint },
      create: {
        fingerprint,
        source: ctx.source,
        name, message, stack,
        route: ctx.route ?? null,
        method: ctx.method ?? null,
        statusCode: ctx.statusCode ?? null,
        requestId: ctx.requestId ?? null,
        actorType: ctx.actorType ?? null,
        actorId: ctx.actorId ?? null,
        firstSeenAt: now,
        lastSeenAt: now,
      },
      update: {
        count: { increment: 1 },
        lastSeenAt: now,
        // Latest occurrence wins for context, so the details are reproducible.
        message, stack,
        requestId: ctx.requestId ?? null,
        actorType: ctx.actorType ?? null,
        actorId: ctx.actorId ?? null,
        // Seeing it again un-resolves it. A fault marked fixed that recurs is
        // the single most important thing this can tell an operator.
        resolvedAt: null,
        resolvedBy: null,
      },
    })
    .then((row) => {
      if (row.count === 1) notifyNew(row);
    })
    .catch((e: unknown) => {
      logger.error({ err: e, fingerprint }, 'error reporter write failed');
    });

  inFlight.add(work);
  void work.finally(() => inFlight.delete(work));
}

/** Convenience for the request path, which has the context on `req`. */
export function captureRequestError(err: unknown, req: Request, statusCode: number) {
  captureError(err, {
    source: 'REQUEST',
    // The matched route where Express knows it, so `/users/:id` groups as one.
    route: (req.route?.path as string | undefined) ?? req.path,
    method: req.method,
    statusCode,
    requestId: req.requestId,
    actorType: req.adminId ? 'ADMIN' : req.userId ? 'USER' : undefined,
    actorId: req.adminId ?? req.userId ?? undefined,
  });
}

/**
 * Catches what escapes everything else.
 *
 * Nothing was recording these before: an unhandled rejection took the process
 * down — or, worse, did not — and left no trace beyond whatever the supervisor
 * happened to capture on the way out.
 */
export function installProcessHandlers() {
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'uncaught exception');
    captureError(err, { source: 'UNCAUGHT' });
    // Give the write a moment, then go. A process that has thrown past every
    // handler is not in a state to keep serving money operations.
    void flushErrors().finally(() => process.exit(1));
  });

  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'unhandled rejection');
    captureError(reason, { source: 'UNHANDLED_REJECTION' });
  });
}

// ── reading ──────────────────────────────────────────────────────────────────

export async function list(opts: { resolved?: boolean; take?: number } = {}) {
  const take = Math.min(Math.max(opts.take ?? 50, 1), 200);
  return prisma.errorEvent.findMany({
    where: opts.resolved === undefined ? {} : opts.resolved ? { resolvedAt: { not: null } } : { resolvedAt: null },
    orderBy: { lastSeenAt: 'desc' },
    take,
  });
}

export const detail = (id: string) => prisma.errorEvent.findUnique({ where: { id } });

export const resolve = (id: string, adminId: string) =>
  prisma.errorEvent.update({
    where: { id },
    data: { resolvedAt: new Date(), resolvedBy: adminId },
  });

/** Unresolved faults, for the metrics endpoint and the operator dashboard. */
export const unresolvedCount = () => prisma.errorEvent.count({ where: { resolvedAt: null } });
