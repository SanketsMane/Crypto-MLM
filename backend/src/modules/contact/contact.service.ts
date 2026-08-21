import type { Request } from 'express';
import { prisma } from '../../core/db.js';
import { logger } from '../../core/logger.js';
import { sendQuietly } from '../../core/email/mailer.js';
import { contactEnquiry } from '../../core/email/templates.js';

/**
 * Public contact enquiries.
 *
 * Stored first, notified second. An enquiry that only ever existed as an email
 * is lost the moment that email bounces or a filter eats it — so the record is
 * the source of truth and the notification is best-effort on top of it.
 */

export interface ContactInput {
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
}

export async function submit(input: ContactInput, req?: Request) {
  const row = await prisma.contactMessage.create({
    data: {
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone?.trim() || null,
      subject: input.subject.trim(),
      message: input.message.trim(),
      ip: req?.ip ?? null,
      userAgent: req?.headers['user-agent']?.slice(0, 300) ?? null,
    },
  });

  const to = process.env.CONTACT_INBOX ?? process.env.SMTP_FROM;
  if (to) {
    sendQuietly(contactEnquiry({
      to, name: row.name, email: row.email, phone: row.phone,
      subject: row.subject, message: row.message, at: row.createdAt,
    }));
  } else {
    logger.info({ id: row.id, email: row.email }, 'contact enquiry stored; no inbox configured to notify');
  }

  return { id: row.id };
}
