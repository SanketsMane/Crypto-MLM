import type { ActorType, NotificationCategory, Prisma } from '@prisma/client';
import { prisma } from './db.js';
import { logger } from './logger.js';
import { isSimulating } from '../middleware/request-context.js';
import {
  adminSpec, memberSpec,
  type AdminNotificationType, type MemberNotificationType,
} from '../modules/notification/catalogue.js';

/**
 * Notification delivery.
 *
 * Two rules govern everything here.
 *
 * **Notifying must never break what it is notifying about.** A withdrawal does
 * not fail because a notification insert did. Every function below swallows its
 * own errors and logs loudly; nothing throws into a money path.
 *
 * **The same event must not notify twice.** Money paths retry, jobs overlap,
 * webhooks arrive again. `dedupeKey` is a unique column, so a second attempt
 * loses at the database rather than relying on anyone remembering to check.
 * Callers are expected to pass one derived from the event — a withdrawal id, a
 * deposit id, a date — not from the time of call.
 */

export interface NotifyMemberInput {
  userId: string;
  type: MemberNotificationType;
  title: string;
  body: string;
  /** Unique per real-world event. Without one, repeats are possible. */
  dedupeKey?: string;
  link?: string;
  meta?: Prisma.InputJsonValue;
  expiresAt?: Date;
}

/**
 * Deliveries started but not yet finished.
 *
 * Fire-and-forget is right for the caller — a withdrawal must not wait on a
 * notification insert — but "nobody is waiting" is not the same as "nobody
 * ever needs to". A process shutting down should finish what it started rather
 * than losing it, and a test that truncates tables must not race a write that
 * is still in flight.
 */
const inFlight = new Set<Promise<unknown>>();

function track(work: Promise<unknown>) {
  inFlight.add(work);
  void work.finally(() => inFlight.delete(work));
}

/** Waits for every started delivery to finish. Shutdown and tests use this. */
export async function flushNotifications() {
  while (inFlight.size) {
    await Promise.allSettled([...inFlight]);
  }
}

/** Tells one member something. Fire-and-forget. */
export function notifyMember(input: NotifyMemberInput): void {
  track(
    deliverMember(input).catch((err: unknown) => {
      logger.error({ err, type: input.type, userId: input.userId }, 'member notification failed');
    }),
  );
}

/** Awaits delivery. For tests, and callers that need the row. */
export async function deliverMember(input: NotifyMemberInput) {
  // A modelled member is not a person to tell.
  if (isSimulating()) return null;

  const spec = memberSpec(input.type);

  // Security notices are not a preference. Everything else can be silenced.
  if (!spec.alwaysDeliver && !(await wants('USER', input.userId, spec.category))) {
    return null;
  }

  return create({
    type: input.type,
    category: spec.category,
    severity: spec.severity,
    title: input.title,
    body: input.body,
    link: input.link ?? spec.link,
    meta: input.meta,
    dedupeKey: input.dedupeKey,
    expiresAt: input.expiresAt,
    recipients: [{ actorType: 'USER' as const, actorId: input.userId }],
  });
}

export interface NotifyAdminsInput {
  type: AdminNotificationType;
  title: string;
  body: string;
  dedupeKey?: string;
  link?: string;
  meta?: Prisma.InputJsonValue;
  expiresAt?: Date;
  /** Skip this admin — the one who caused it does not need telling. */
  exceptAdminId?: string;
}

/**
 * Tells whichever operators can act on it.
 *
 * Routing is by capability, not by role name: a new role that can approve
 * withdrawals starts getting withdrawal alerts with nothing to remember, and an
 * operator who loses the permission stops getting them.
 */
export function notifyAdmins(input: NotifyAdminsInput): void {
  track(
    deliverAdmins(input).catch((err: unknown) => {
      logger.error({ err, type: input.type }, 'admin notification failed');
    }),
  );
}

export async function deliverAdmins(input: NotifyAdminsInput) {
  // Nor is a simulated deposit an operator queue that needs working.
  if (isSimulating()) return null;

  const spec = adminSpec(input.type);
  const admins = await adminsWith(spec.permission);
  const targets = admins.filter((id) => id !== input.exceptAdminId);

  if (!targets.length) {
    // Worth saying out loud: an alert nobody can see is a gap in the rota, not
    // a quiet success.
    logger.warn(
      { type: input.type, permission: spec.permission },
      'no active admin holds the permission for this alert — nobody will see it',
    );
    return null;
  }

  return create({
    type: input.type,
    category: spec.category,
    severity: spec.severity,
    title: input.title,
    body: input.body,
    link: input.link ?? spec.link,
    meta: input.meta,
    dedupeKey: input.dedupeKey,
    expiresAt: input.expiresAt,
    recipients: targets.map((actorId) => ({ actorType: 'ADMIN' as const, actorId })),
  });
}

// ── internals ──

interface CreateInput {
  type: string;
  category: NotificationCategory;
  severity: 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL';
  title: string;
  body: string;
  link?: string;
  meta?: Prisma.InputJsonValue;
  dedupeKey?: string;
  expiresAt?: Date;
  recipients: { actorType: ActorType; actorId: string }[];
}

async function create(input: CreateInput) {
  try {
    return await prisma.notification.create({
      data: {
        type: input.type,
        category: input.category,
        severity: input.severity,
        title: input.title,
        body: input.body,
        link: input.link,
        meta: input.meta,
        dedupeKey: input.dedupeKey,
        expiresAt: input.expiresAt,
        recipients: { create: input.recipients },
      },
    });
  } catch (err) {
    // The unique dedupeKey losing a race is the expected outcome of a retry,
    // not a failure worth logging as one.
    if (isDuplicate(err)) {
      logger.debug({ type: input.type, dedupeKey: input.dedupeKey }, 'notification already sent');
      return null;
    }
    throw err;
  }
}

const isDuplicate = (err: unknown) =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';

/**
 * Active admins holding a permission.
 *
 * Read fresh each time rather than cached: routing an alert to someone whose
 * access was revoked thirty seconds ago is exactly the mistake a cache makes.
 */
async function adminsWith(permission: string): Promise<string[]> {
  const rows = await prisma.adminUser.findMany({
    where: {
      isActive: true,
      role: { permissions: { some: { permission: { key: permission } } } },
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** Absent preference means yes — a member who never opened settings still hears. */
async function wants(actorType: ActorType, actorId: string, category: NotificationCategory) {
  const pref = await prisma.notificationPreference.findUnique({
    where: { actorType_actorId_category: { actorType, actorId, category } },
    select: { inApp: true },
  });
  return pref?.inApp ?? true;
}

/** Drops read and expired notifications that nobody needs any more. */
export async function purgeOldNotifications() {
  const cutoff = new Date(Date.now() - 90 * 24 * 3_600_000);

  const [expired, stale] = await Promise.all([
    prisma.notification.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
    // Ninety days of history, but only for things that were actually read.
    // An unread alert is never swept out from under someone.
    prisma.notification.deleteMany({
      where: {
        createdAt: { lt: cutoff },
        recipients: { every: { readAt: { not: null } } },
      },
    }),
  ]);

  const count = expired.count + stale.count;
  if (count) logger.info({ count }, 'old notifications purged');
  return count;
}
