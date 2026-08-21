import type { ActivityEvent, Prisma } from '@prisma/client';
import type { Request } from 'express';
import { prisma } from './db.js';
import { logger } from './logger.js';
import { isSimulating } from '../middleware/request-context.js';

/**
 * The member-facing account trail.
 *
 * Two rules shape this. First, recording activity must never break the thing it
 * is recording — a member's withdrawal does not fail because a log insert did,
 * so every write here is best-effort and swallows its own errors. Second, the
 * reader is the member, not an engineer: `summary` is written to be understood
 * by someone checking whether that sign-in from a new country was them.
 *
 * Rows are never updated or deleted. If a member disputes a payout months
 * later, this is the record, and a record that can be edited is not one.
 */

export interface RecordInput {
  userId: string;
  event: ActivityEvent;
  summary: string;
  meta?: Prisma.InputJsonValue;
  /** Set when an operator acted for the member, so the line says so. */
  actorAdminId?: string;
  req?: Request;
}

const inFlight = new Set<Promise<unknown>>();

/** Waits for every started write to land. Shutdown and tests use this. */
export async function flushActivity() {
  while (inFlight.size) await Promise.allSettled([...inFlight]);
}

export function record(input: RecordInput): void {
  // Half a million rows of modelled activity would bury the real trail.
  if (isSimulating()) return;

  const { req } = input;
  const work = prisma.activityLog
    .create({
      data: {
        userId: input.userId,
        event: input.event,
        summary: input.summary,
        meta: input.meta,
        actorAdminId: input.actorAdminId,
        ip: req?.ip ?? null,
        userAgent: req?.get('user-agent')?.slice(0, 255) ?? null,
      },
    })
    .catch((err: unknown) => {
      // Losing a log line is bad; failing a member's action because of one is
      // worse. It is loud in our logs and invisible to them.
      logger.error({ err, event: input.event, userId: input.userId }, 'activity log write failed');
    });

  inFlight.add(work);
  void work.finally(() => inFlight.delete(work));
}

/** Awaits the write. For tests, and for the rare caller that needs the row. */
export const recordSync = (input: RecordInput) =>
  prisma.activityLog.create({
    data: {
      userId: input.userId,
      event: input.event,
      summary: input.summary,
      meta: input.meta,
      actorAdminId: input.actorAdminId,
      ip: input.req?.ip ?? null,
      userAgent: input.req?.get('user-agent')?.slice(0, 255) ?? null,
    },
  });

export interface ListOptions {
  take?: number;
  skip?: number;
  event?: ActivityEvent;
}

export async function listFor(userId: string, opts: ListOptions = {}) {
  const take = Math.min(Math.max(opts.take ?? 25, 1), 100);
  const where = { userId, ...(opts.event ? { event: opts.event } : {}) };

  const [rows, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      skip: Math.max(opts.skip ?? 0, 0),
      select: {
        id: true, event: true, summary: true, meta: true,
        ip: true, userAgent: true, actorAdminId: true, createdAt: true,
      },
    }),
    prisma.activityLog.count({ where }),
  ]);

  return {
    total,
    rows: rows.map((r) => ({
      ...r,
      // "An operator did this" is the single most important thing a member can
      // learn from this screen, so it is a field rather than something they
      // have to infer from an id.
      byOperator: r.actorAdminId !== null,
      actorAdminId: undefined,
    })),
  };
}

/** Masks a payout address for display: 0x1234…cdef. */
export const maskAddress = (address: string) =>
  address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
