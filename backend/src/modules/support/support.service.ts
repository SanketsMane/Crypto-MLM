import type { TicketCategory, TicketPriority } from '@prisma/client';
import { prisma } from '../../core/db.js';
import { badRequest, notFound } from '../../core/errors.js';
import { notifyAdmins, notifyMember } from '../../core/notify.js';
import * as storage from '../../core/document-storage.js';

/**
 * Member-facing support.
 *
 * Priority and category are set by the member and can be overridden by an
 * operator. Letting the member choose is not naive: they know whether their
 * money has arrived, and a queue sorted only by age treats "I cannot withdraw"
 * exactly like "how do I change my name".
 *
 * Attachments go through the same document store as identity documents — same
 * size and type limits, same on-disk layout, one place to secure rather than
 * two.
 */

export interface AttachmentInput {
  fileName: string;
  mimeType: string;
  /** Base64 payload as the browser sends it, without the data-URL prefix. */
  data: string;
}

const MAX_ATTACHMENTS = 3;

/** Decodes and validates everything before a single byte is written. */
async function storeAttachments(userId: string, inputs: AttachmentInput[] = []) {
  if (!inputs.length) return [];
  if (inputs.length > MAX_ATTACHMENTS) {
    throw badRequest(`Attach at most ${MAX_ATTACHMENTS} files`);
  }

  const decoded = inputs.map((a) => {
    const bytes = Buffer.from(a.data, 'base64');
    storage.assertAcceptable(a.mimeType, bytes.byteLength);
    return { ...a, bytes };
  });

  const stored: { fileName: string; storageKey: string; mimeType: string; sizeBytes: number }[] = [];
  try {
    for (const d of decoded) {
      const file = await storage.put(userId, d.mimeType, d.bytes);
      stored.push({
        fileName: d.fileName.slice(0, 200),
        storageKey: file.storageKey,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
      });
    }
    return stored;
  } catch (err) {
    // The row is what makes a file findable; without it the bytes are orphaned.
    await Promise.all(stored.map((f) => storage.remove(f.storageKey)));
    throw err;
  }
}

export const list = (userId: string) =>
  prisma.supportTicket.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
        include: {
          attachments: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true } },
        },
      },
    },
  });

export async function create(userId: string, input: {
  subject: string; body: string;
  priority?: TicketPriority; category?: TicketCategory;
  attachments?: AttachmentInput[];
}) {
  const files = await storeAttachments(userId, input.attachments);

  const ticket = await prisma.supportTicket.create({
    data: {
      userId,
      subject: input.subject,
      priority: input.priority ?? 'NORMAL',
      category: input.category ?? 'OTHER',
      messages: {
        create: {
          body: input.body,
          isStaff: false,
          authorId: userId,
          attachments: files.length ? { create: files } : undefined,
        },
      },
    },
    include: { messages: { include: { attachments: true } } },
  });

  const urgent = ticket.priority === 'URGENT' || ticket.priority === 'HIGH';
  notifyAdmins({
    type: 'ops.support_ticket',
    dedupeKey: `ticket:${ticket.id}`,
    title: urgent ? `${ticket.priority} support ticket` : 'New support ticket',
    body: `${input.subject} — ${ticket.category.toLowerCase()}${files.length ? `, ${files.length} attachment${files.length === 1 ? '' : 's'}` : ''}`,
    link: `/admin/support?ticket=${ticket.id}`,
    meta: { ticketId: ticket.id, priority: ticket.priority, category: ticket.category },
  });
  return ticket;
}

export async function reply(
  ticketId: string, userId: string, body: string, isStaff = false,
  attachments: AttachmentInput[] = [],
) {
  const ticket = await prisma.supportTicket.findFirst({ where: { id: ticketId, ...(isStaff ? {} : { userId }) } });
  if (!ticket) throw notFound('Ticket not found');

  const files = await storeAttachments(userId, attachments);
  const message = await prisma.ticketMessage.create({
    data: {
      ticketId, body, isStaff, authorId: userId,
      attachments: files.length ? { create: files } : undefined,
    },
  });

  // Whoever did NOT write this needs telling. Notifying the author of their own
  // reply is the classic way a notification system loses people's trust.
  if (isStaff) {
    notifyMember({
      userId: ticket.userId,
      type: 'support.replied',
      dedupeKey: `ticket-reply:${message.id}`,
      title: 'Support replied',
      body: `There is a new reply on "${ticket.subject}".`,
      link: `/support?ticket=${ticketId}`,
      meta: { ticketId },
    });
  } else {
    notifyAdmins({
      type: 'ops.support_reply',
      dedupeKey: `ticket-reply:${message.id}`,
      title: 'Member replied to a ticket',
      body: ticket.subject,
      link: `/admin/support?ticket=${ticketId}`,
      meta: { ticketId },
    });
  }

  return prisma.supportTicket.update({
    where: { id: ticketId },
    data: {
      status: isStaff ? 'ANSWERED' : 'OPEN',
      // Stamped once, on the first staff reply — the number a desk is judged on.
      ...(isStaff && !ticket.firstReplyAt ? { firstReplyAt: new Date() } : {}),
    },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
        include: { attachments: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true } } },
      },
    },
  });
}

/**
 * Streams an attachment, but only to someone entitled to it.
 *
 * Scoped in the query rather than fetched-then-checked: a member can only ever
 * reach a file on their own ticket, and the query is incapable of returning
 * anything else.
 */
export async function attachment(id: string, opts: { userId?: string; isStaff?: boolean }) {
  const file = await prisma.ticketAttachment.findFirst({
    where: {
      id,
      ...(opts.isStaff ? {} : { message: { ticket: { userId: opts.userId } } }),
    },
    select: { fileName: true, storageKey: true, mimeType: true },
  });
  if (!file) throw notFound('Attachment not found');
  return file;
}