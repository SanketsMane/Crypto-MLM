import type { Request } from 'express';
import { prisma } from '../../../core/db.js';
import { badRequest, notFound } from '../../../core/errors.js';
import * as sessions from '../../../core/sessions.js';
import * as activity from '../../../core/activity.js';
import * as audit from '../audit/audit.service.js';
import { logger } from '../../../core/logger.js';

/**
 * Seeing what a member sees.
 *
 * Support currently diagnoses every problem from a description. This lets an
 * operator open the member's own view — the difference between "the income page
 * looks wrong" and knowing exactly what is wrong.
 *
 * It is also the most dangerous capability on the platform, so it is
 * constrained hard:
 *
 *   • **Read-only.** The session is marked and every money-moving route refuses
 *     it. An operator can look; they cannot act as the member. If a balance
 *     needs changing there is an adjustment endpoint, and that one is audited
 *     against the operator's own name.
 *   • **Short.** Thirty minutes, not thirty days.
 *   • **Visible to the member.** It lands in their own activity trail. Being
 *     able to look at someone's account without them ever knowing is how a
 *     support tool becomes a surveillance tool.
 *   • **Audited**, with a reason that is required rather than optional.
 */

const TTL_MINUTES = 30;

export async function start(adminId: string, userId: string, reason: string, req?: Request) {
  const trimmed = reason.trim();
  if (trimmed.length < 5) {
    throw badRequest('Give a reason — it goes in the audit log, and the member is told this happened');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, userCode: true, email: true, firstName: true, lastName: true, status: true },
  });
  if (!user) throw notFound('Member not found');

  const { accessToken, refreshToken } = await sessions.issue('USER', userId, req, {
    impersonatedBy: adminId,
    ttlMinutes: TTL_MINUTES,
  });

  const admin = await prisma.adminUser.findUnique({ where: { id: adminId }, select: { email: true } });

  await audit.record({
    adminId, action: 'UPDATE', entityType: 'user', entityId: userId,
    summary: `Opened ${user.userCode}'s account to view it as them — ${trimmed}`,
    after: { reason: trimmed, minutes: TTL_MINUTES, readOnly: true }, req,
  });

  activity.record({
    userId,
    event: 'SIGNED_IN',
    actorAdminId: adminId,
    summary: `A support operator opened your account to look into an issue — ${trimmed}. They cannot move money or change your details.`,
    meta: { operator: admin?.email ?? adminId, readOnly: true },
  });

  logger.warn({ adminId, userId, reason: trimmed }, 'impersonation session started');

  return {
    accessToken,
    refreshToken,
    expiresInMinutes: TTL_MINUTES,
    member: {
      id: user.id,
      userCode: user.userCode,
      email: user.email,
      name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.userCode,
      status: user.status,
    },
  };
}
