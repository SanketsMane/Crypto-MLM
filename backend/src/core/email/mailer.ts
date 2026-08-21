import nodemailer, { type Transporter } from 'nodemailer';
import { prisma } from '../db.js';
import { logger } from '../logger.js';
import { env } from '../../config/env.js';
import { isSimulating } from '../../middleware/request-context.js';

/**
 * Outbound email.
 *
 * Two things matter here beyond "call nodemailer".
 *
 * First, sending must never take down the thing that triggered it. A member's
 * registration does not fail because an SMTP host was briefly unreachable, so
 * every send is best-effort and the failure is recorded rather than thrown.
 * The one exception is a code the member is actively waiting for — there,
 * silently failing is worse than an error, so those callers ask for the result.
 *
 * Second, delivery is the part that fails invisibly. Support cannot answer
 * "did they get the code?" from a log that rotated. Every attempt lands in
 * `email_logs` with its outcome and the provider's message id.
 *
 * With no SMTP host configured — every developer machine — mail is written to
 * the log instead of dropped, so the flows are still testable end to end.
 */

let transport: Transporter | null = null;
let resolved = false;

function getTransport(): Transporter | null {
  if (resolved) return transport;
  resolved = true;

  if (!env.SMTP_HOST) {
    logger.warn('SMTP is not configured — emails will be logged instead of sent');
    return (transport = null);
  }

  transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    // 465 is implicit TLS; everything else negotiates STARTTLS.
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  });
  return transport;
}

/** Test seam — lets the suite assert on what would have been sent. */
export const __setTransport = (t: Transporter | null) => {
  transport = t;
  resolved = true;
};

export interface Message {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Names the template in the log, so delivery can be traced per flow. */
  template: string;
}

export interface SendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

export async function send(message: Message): Promise<SendResult> {
  // Never send to an address that belongs to nobody.
  if (isSimulating()) return { ok: true, messageId: 'simulated' };

  const row = await prisma.emailLog.create({
    data: { to: message.to, subject: message.subject, template: message.template },
  });

  const t = getTransport();
  if (!t) {
    // Not a failure — there is simply nowhere to send it on this machine.
    logger.info(
      { to: message.to, subject: message.subject, template: message.template, body: message.text },
      'email (not sent — no SMTP configured)',
    );
    await prisma.emailLog.update({
      where: { id: row.id },
      data: { status: 'SENT', sentAt: new Date(), messageId: 'logged-only' },
    });
    return { ok: true, messageId: 'logged-only' };
  }

  try {
    const info = await t.sendMail({
      from: env.MAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    await prisma.emailLog.update({
      where: { id: row.id },
      data: { status: 'SENT', sentAt: new Date(), messageId: info.messageId },
    });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ err, to: message.to, template: message.template }, 'email send failed');
    await prisma.emailLog
      .update({ where: { id: row.id }, data: { status: 'FAILED', error: error.slice(0, 500) } })
      .catch(() => undefined);
    return { ok: false, error };
  }
}

/** Fire-and-forget, for mail nobody is waiting on. */
export const sendQuietly = (message: Message) => {
  void send(message).catch((err: unknown) => logger.error({ err }, 'email send threw'));
};
