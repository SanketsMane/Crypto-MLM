import type { Prisma, TicketStatus } from '@prisma/client';
import type { Request } from 'express';
import { prisma } from '../../../core/db.js';
import { badRequest, notFound } from '../../../core/errors.js';
import type { TicketCategory, TicketPriority } from '@prisma/client';
import * as audit from '../audit/audit.service.js';
import { notifyMember } from '../../../core/notify.js';

/**
 * Operator side of support.
 *
 * The customer half has been live since the platform shipped — members could
 * open tickets and reply, and `support.service.reply()` already accepted an
 * `isStaff` flag. What was missing was any way for an operator to see the
 * queue, so tickets accumulated with nobody able to answer them.
 *
 * "Awaiting reply" is derived rather than stored: a ticket needs attention when
 * it is OPEN and its most recent message came from the member. That avoids a
 * schema migration for a flag the data already implies.
 */

const lastMessage = { orderBy: { createdAt: 'desc' as const }, take: 1 };

export interface TicketListOpts {
  take: number;
  skip: number;
  status?: TicketStatus;
  /** Only tickets whose latest message is from the member. */
  awaiting?: boolean;
  q?: string;
}

export async function list(opts: TicketListOpts) {
  const where: Prisma.SupportTicketWhereInput = {
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.q
      ? {
          OR: [
            { subject: { contains: opts.q, mode: 'insensitive' } },
            { user: { email: { contains: opts.q, mode: 'insensitive' } } },
            { user: { userCode: { contains: opts.q.toUpperCase() } } },
          ],
        }
      : {}),
  };

  const [rows, total, open, awaitingAll] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      // Urgency first, then age. Sorting a support queue by recency alone means
      // "my withdrawal is missing" waits behind "how do I change my name".
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      take: opts.take, skip: opts.skip,
      include: {
        user: { select: { id: true, userCode: true, email: true, status: true } },
        messages: lastMessage,
        _count: { select: { messages: true } },
      },
    }),
    prisma.supportTicket.count({ where }),
    prisma.supportTicket.count({ where: { status: 'OPEN' } }),
    prisma.supportTicket.findMany({
      where: { status: 'OPEN' },
      select: { id: true, messages: { ...lastMessage, select: { isStaff: true } } },
    }),
  ]);

  const awaitingIds = new Set(
    awaitingAll.filter((t) => t.messages[0] && !t.messages[0].isStaff).map((t) => t.id),
  );

  const mapped = rows.map((t) => {
    const last = t.messages[0];
    return {
      id: t.id,
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      category: t.category,
      assignedTo: t.assignedTo,
      user: t.user,
      messageCount: t._count.messages,
      awaitingReply: awaitingIds.has(t.id),
      lastMessage: last
        ? { body: last.body.slice(0, 160), isStaff: last.isStaff, createdAt: last.createdAt }
        : null,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  });

  return {
    total,
    openCount: open,
    awaitingCount: awaitingIds.size,
    rows: opts.awaiting ? mapped.filter((t) => t.awaitingReply) : mapped,
  };
}

/** One thread, plus enough about the member to answer without leaving the page. */
export async function detail(id: string) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true, userCode: true, email: true, phone: true, status: true,
          firstName: true, lastName: true, affiliateMode: true,
          totalInvested: true, totalEarned: true, createdAt: true,
          currentRank: { select: { name: true } },
        },
      },
      messages: {
        orderBy: { createdAt: 'asc' },
        include: { attachments: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true } } },
      },
    },
  });
  if (!ticket) throw notFound('Ticket not found');

  // Name the staff authors, so a thread does not read as an anonymous voice.
  const staffIds = [...new Set(ticket.messages.filter((m) => m.isStaff && m.authorId).map((m) => m.authorId!))];
  const staff = staffIds.length
    ? await prisma.adminUser.findMany({ where: { id: { in: staffIds } }, select: { id: true, name: true } })
    : [];
  const staffName = new Map(staff.map((s) => [s.id, s.name]));

  return {
    id: ticket.id,
    subject: ticket.subject,
    status: ticket.status,
    priority: ticket.priority,
    category: ticket.category,
    assignedTo: ticket.assignedTo,
    firstReplyAt: ticket.firstReplyAt,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    user: {
      ...ticket.user,
      name: [ticket.user.firstName, ticket.user.lastName].filter(Boolean).join(' '),
      totalInvested: ticket.user.totalInvested.toString(),
      totalEarned: ticket.user.totalEarned.toString(),
      rank: ticket.user.currentRank?.name ?? null,
    },
    messages: ticket.messages.map((m) => ({
      id: m.id,
      body: m.body,
      isStaff: m.isStaff,
      author: m.isStaff ? (m.authorId ? staffName.get(m.authorId) ?? 'Support' : 'Support') : ticket.user.userCode,
      createdAt: m.createdAt,
      attachments: m.attachments,
    })),
  };
}

/**
 * Staff reply. Moves the ticket to ANSWERED so it leaves the awaiting queue,
 * unless it was closed — replying to a closed ticket reopens the conversation.
 */
export async function reply(adminId: string, id: string, body: string, req?: Request) {
  const text = body.trim();
  if (text.length < 2) throw badRequest('A reply cannot be empty');

  const ticket = await prisma.supportTicket.findUnique({ where: { id }, include: { user: { select: { userCode: true } } } });
  if (!ticket) throw notFound('Ticket not found');

  const { updated, message } = await prisma.$transaction(async (tx) => {
    const msg = await tx.ticketMessage.create({
      data: { ticketId: id, body: text, isStaff: true, authorId: adminId },
    });
    const t = await tx.supportTicket.update({ where: { id }, data: { status: 'ANSWERED' } });
    return { updated: t, message: msg };
  });

  notifyMember({
    userId: ticket.userId,
    type: 'support.replied',
    dedupeKey: `ticket-reply:${message.id}`,
    title: 'Support replied',
    body: `There is a new reply on "${ticket.subject}".`,
    link: `/support?ticket=${id}`,
    meta: { ticketId: id },
  });

  await audit.record({
    adminId, action: 'UPDATE', entityType: 'support_ticket', entityId: id,
    summary: `Replied to ${ticket.user.userCode} on "${ticket.subject}"`,
    before: { status: ticket.status }, after: { status: updated.status, reply: text.slice(0, 200) }, req,
  });
  return updated;
}

export async function setStatus(adminId: string, id: string, status: TicketStatus, req?: Request) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id }, include: { user: { select: { userCode: true } } } });
  if (!ticket) throw notFound('Ticket not found');

  const updated = await prisma.supportTicket.update({ where: { id }, data: { status } });
  await audit.record({
    adminId, action: 'STATUS_CHANGE', entityType: 'support_ticket', entityId: id,
    summary: `Ticket "${ticket.subject}" (${ticket.user.userCode}) ${ticket.status} → ${status}`,
    before: { status: ticket.status }, after: { status }, req,
  });

  if (status === 'CLOSED' && ticket.status !== 'CLOSED') {
    notifyMember({
      userId: ticket.userId,
      type: 'support.resolved',
      dedupeKey: `ticket-closed:${id}:${updated.updatedAt.getTime()}`,
      title: 'Ticket closed',
      body: `"${ticket.subject}" has been marked resolved. Reply on it if you still need help.`,
      link: `/support?ticket=${id}`,
      meta: { ticketId: id },
    });
  }
  return updated;
}

/**
 * Triage.
 *
 * Priority and category come from the member, who knows whether their money
 * arrived. An operator can override both — and assign an owner, so two people
 * do not answer the same ticket at once.
 */
export async function triage(
  adminId: string,
  id: string,
  input: { priority?: TicketPriority; category?: TicketCategory; assignedTo?: string | null },
  req?: Request,
) {
  const before = await prisma.supportTicket.findUnique({
    where: { id },
    select: { priority: true, category: true, assignedTo: true, subject: true },
  });
  if (!before) throw notFound('Ticket not found');

  const row = await prisma.supportTicket.update({
    where: { id },
    data: {
      ...(input.priority ? { priority: input.priority } : {}),
      ...(input.category ? { category: input.category } : {}),
      ...(input.assignedTo !== undefined ? { assignedTo: input.assignedTo } : {}),
    },
  });

  const changes = [
    input.priority && input.priority !== before.priority ? `priority ${before.priority} → ${input.priority}` : null,
    input.category && input.category !== before.category ? `category ${before.category} → ${input.category}` : null,
    input.assignedTo !== undefined && input.assignedTo !== before.assignedTo
      ? (input.assignedTo ? 'assigned' : 'unassigned') : null,
  ].filter(Boolean);

  if (changes.length) {
    await audit.record({
      adminId, action: 'UPDATE', entityType: 'support_ticket', entityId: id,
      summary: `Triaged “${before.subject}” — ${changes.join(', ')}`,
      before: { ...before }, after: { priority: row.priority, category: row.category, assignedTo: row.assignedTo },
      req,
    });
  }
  return row;
}

/** Claims a ticket for the operator asking, in one step. */
export const claim = (adminId: string, id: string, req?: Request) =>
  triage(adminId, id, { assignedTo: adminId }, req);
