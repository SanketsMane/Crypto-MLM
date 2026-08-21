import type { ActorType, NotificationCategory, Prisma } from '@prisma/client';
import { prisma } from '../../core/db.js';
import { badRequest, notFound } from '../../core/errors.js';
import { CATEGORY_LABELS } from './catalogue.js';

/**
 * Reading and managing notifications.
 *
 * Every operation is scoped by `(actorType, actorId)` in the WHERE clause
 * rather than fetched-then-checked. A notification belonging to another member
 * should not be reachable even by id, and the way to guarantee that is to make
 * the query incapable of returning it.
 */

export interface ListOptions {
  take?: number;
  cursor?: string;
  category?: NotificationCategory;
  unreadOnly?: boolean;
  /** Archived are hidden by default but remain retrievable. */
  includeArchived?: boolean;
}

export interface NotificationView {
  id: string;
  type: string;
  category: NotificationCategory;
  severity: string;
  title: string;
  body: string;
  link: string | null;
  meta: Prisma.JsonValue | null;
  read: boolean;
  archived: boolean;
  createdAt: Date;
}

export async function list(actorType: ActorType, actorId: string, opts: ListOptions = {}) {
  const take = Math.min(Math.max(opts.take ?? 20, 1), 50);

  const where: Prisma.NotificationRecipientWhereInput = {
    actorType,
    actorId,
    ...(opts.unreadOnly ? { readAt: null } : {}),
    ...(opts.includeArchived ? {} : { archivedAt: null }),
    ...(opts.category ? { notification: { category: opts.category } } : {}),
  };

  const rows = await prisma.notificationRecipient.findMany({
    where,
    // Ordered by the event, not by the recipient row, so a fan-out to twenty
    // operators appears at the same point in all twenty lists.
    orderBy: { notification: { createdAt: 'desc' } },
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    include: { notification: true },
  });

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;

  return {
    rows: page.map(toView),
    nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
  };
}

const toView = (r: {
  id: string; readAt: Date | null; archivedAt: Date | null;
  notification: {
    type: string; category: NotificationCategory; severity: string;
    title: string; body: string; link: string | null;
    meta: Prisma.JsonValue; createdAt: Date;
  };
}): NotificationView => ({
  // The recipient row's id is the handle, because that is what read state
  // hangs off — the same notification has a different id for each reader.
  id: r.id,
  type: r.notification.type,
  category: r.notification.category,
  severity: r.notification.severity,
  title: r.notification.title,
  body: r.notification.body,
  link: r.notification.link,
  meta: r.notification.meta,
  read: r.readAt !== null,
  archived: r.archivedAt !== null,
  createdAt: r.notification.createdAt,
});

/**
 * The number on the bell, plus a breakdown.
 *
 * One query. This is polled by every open tab, so it has to stay cheap — the
 * partial index on (actorType, actorId, readAt) is what makes it so.
 */
export async function summary(actorType: ActorType, actorId: string) {
  const grouped = await prisma.notificationRecipient.groupBy({
    by: ['notificationId'],
    where: { actorType, actorId, readAt: null, archivedAt: null },
    _count: true,
  });

  if (!grouped.length) {
    return { unread: 0, byCategory: {} as Record<string, number>, hasCritical: false };
  }

  const notifications = await prisma.notification.findMany({
    where: { id: { in: grouped.map((g) => g.notificationId) } },
    select: { category: true, severity: true },
  });

  const byCategory: Record<string, number> = {};
  let hasCritical = false;
  for (const n of notifications) {
    byCategory[n.category] = (byCategory[n.category] ?? 0) + 1;
    if (n.severity === 'CRITICAL') hasCritical = true;
  }

  return { unread: notifications.length, byCategory, hasCritical };
}

export async function markRead(actorType: ActorType, actorId: string, ids: string[]) {
  if (!ids.length) throw badRequest('No notifications given');
  const { count } = await prisma.notificationRecipient.updateMany({
    where: { id: { in: ids }, actorType, actorId, readAt: null },
    data: { readAt: new Date() },
  });
  return { updated: count };
}

export async function markUnread(actorType: ActorType, actorId: string, id: string) {
  const { count } = await prisma.notificationRecipient.updateMany({
    where: { id, actorType, actorId },
    data: { readAt: null },
  });
  if (!count) throw notFound('Notification not found');
  return { updated: count };
}

/**
 * Mark everything read, optionally within one category.
 *
 * Scoped to unread rows so the timestamp records when each was actually read,
 * rather than restamping things read last week.
 */
export async function markAllRead(
  actorType: ActorType,
  actorId: string,
  category?: NotificationCategory,
) {
  const { count } = await prisma.notificationRecipient.updateMany({
    where: {
      actorType,
      actorId,
      readAt: null,
      archivedAt: null,
      ...(category ? { notification: { category } } : {}),
    },
    data: { readAt: new Date() },
  });
  return { updated: count };
}

export async function archive(actorType: ActorType, actorId: string, ids: string[]) {
  if (!ids.length) throw badRequest('No notifications given');
  const now = new Date();
  const { count } = await prisma.notificationRecipient.updateMany({
    where: { id: { in: ids }, actorType, actorId, archivedAt: null },
    // Dismissing implies having seen it, so it counts as read too — otherwise
    // the bell keeps a number for something already cleared off the list.
    data: { archivedAt: now, readAt: now },
  });
  return { updated: count };
}

export async function restore(actorType: ActorType, actorId: string, id: string) {
  const { count } = await prisma.notificationRecipient.updateMany({
    where: { id, actorType, actorId },
    data: { archivedAt: null },
  });
  if (!count) throw notFound('Notification not found');
  return { updated: count };
}

/** Clears everything already read. Unread notices are deliberately left alone. */
export async function clearRead(actorType: ActorType, actorId: string) {
  const now = new Date();
  const { count } = await prisma.notificationRecipient.updateMany({
    where: { actorType, actorId, readAt: { not: null }, archivedAt: null },
    data: { archivedAt: now },
  });
  return { updated: count };
}

// ── preferences ──

export async function preferences(actorType: ActorType, actorId: string) {
  const stored = await prisma.notificationPreference.findMany({
    where: { actorType, actorId },
  });
  const byCategory = new Map(stored.map((p) => [p.category, p]));

  return (Object.keys(CATEGORY_LABELS) as NotificationCategory[]).map((category) => {
    const pref = byCategory.get(category);
    return {
      category,
      label: CATEGORY_LABELS[category],
      // Absent means on.
      inApp: pref?.inApp ?? true,
      email: pref?.email ?? true,
      // Being told your payout address changed is not a preference.
      locked: category === 'SECURITY',
    };
  });
}

export async function setPreference(
  actorType: ActorType,
  actorId: string,
  category: NotificationCategory,
  values: { inApp?: boolean; email?: boolean },
) {
  if (category === 'SECURITY') {
    throw badRequest('Security notifications cannot be turned off');
  }

  await prisma.notificationPreference.upsert({
    where: { actorType_actorId_category: { actorType, actorId, category } },
    create: { actorType, actorId, category, inApp: values.inApp ?? true, email: values.email ?? true },
    update: {
      ...(values.inApp !== undefined ? { inApp: values.inApp } : {}),
      ...(values.email !== undefined ? { email: values.email } : {}),
    },
  });
  return preferences(actorType, actorId);
}
