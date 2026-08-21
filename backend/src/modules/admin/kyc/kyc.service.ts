import type { KycStatus, Prisma } from '@prisma/client';
import type { Request } from 'express';
import { prisma } from '../../../core/db.js';
import { badRequest, notFound } from '../../../core/errors.js';
import * as audit from '../audit/audit.service.js';
import * as activity from '../../../core/activity.js';
import { notifyMember } from '../../../core/notify.js';

/**
 * Compliance review queue.
 *
 * A decision is recorded against the reviewing admin and written to the audit
 * log; there is no path that changes a verdict silently. Approving sets the
 * member ACTIVE only if they were still PENDING — an operator who suspended an
 * account for another reason does not have that undone by a KYC approval.
 */

export async function list(opts: { take: number; skip: number; status?: KycStatus; q?: string }) {
  const where: Prisma.KycSubmissionWhereInput = {
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.q
      ? {
          OR: [
            { fullName: { contains: opts.q, mode: 'insensitive' } },
            { documentNo: { contains: opts.q, mode: 'insensitive' } },
            { user: { email: { contains: opts.q, mode: 'insensitive' } } },
            { user: { userCode: { contains: opts.q.toUpperCase() } } },
          ],
        }
      : {}),
  };

  const [rows, total, pending] = await Promise.all([
    prisma.kycSubmission.findMany({
      where, orderBy: { createdAt: 'desc' }, take: opts.take, skip: opts.skip,
      include: {
        user: { select: { id: true, userCode: true, email: true, status: true } },
        _count: { select: { documents: true } },
      },
    }),
    prisma.kycSubmission.count({ where }),
    prisma.kycSubmission.count({ where: { status: 'PENDING' } }),
  ]);

  return {
    total,
    pending,
    rows: rows.map((r) => ({
      id: r.id, status: r.status, fullName: r.fullName, documentNo: r.documentNo,
      countryCode: r.countryCode, documentCount: r._count.documents,
      user: r.user, rejectionReason: r.rejectionReason,
      reviewedAt: r.reviewedAt, createdAt: r.createdAt,
    })),
  };
}

export async function detail(id: string) {
  const row = await prisma.kycSubmission.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true, userCode: true, email: true, phone: true, status: true,
          firstName: true, lastName: true, createdAt: true,
          totalInvested: true, walletAddress: true,
        },
      },
      documents: { select: { id: true, type: true, mimeType: true, sizeBytes: true, createdAt: true } },
    },
  });
  if (!row) throw notFound('Submission not found');

  const reviewer = row.reviewedBy
    ? await prisma.adminUser.findUnique({ where: { id: row.reviewedBy }, select: { name: true } })
    : null;

  // Earlier attempts, so a reviewer can see whether this has been rejected before.
  const history = await prisma.kycSubmission.findMany({
    where: { userId: row.userId, id: { not: row.id } },
    orderBy: { createdAt: 'desc' }, take: 5,
    select: { id: true, status: true, rejectionReason: true, createdAt: true, reviewedAt: true },
  });

  return {
    id: row.id, status: row.status,
    fullName: row.fullName, documentNo: row.documentNo,
    countryCode: row.countryCode, dateOfBirth: row.dateOfBirth,
    rejectionReason: row.rejectionReason,
    reviewedAt: row.reviewedAt, reviewedByName: reviewer?.name ?? null,
    createdAt: row.createdAt,
    user: {
      ...row.user,
      name: [row.user.firstName, row.user.lastName].filter(Boolean).join(' '),
      totalInvested: row.user.totalInvested.toString(),
    },
    documents: row.documents,
    history,
  };
}

async function decide(
  adminId: string, id: string, status: 'APPROVED' | 'REJECTED', reason: string | undefined, req?: Request,
) {
  const row = await prisma.kycSubmission.findUnique({
    where: { id },
    include: { user: { select: { userCode: true, status: true } } },
  });
  if (!row) throw notFound('Submission not found');
  if (row.status !== 'PENDING') throw badRequest(`This submission was already ${row.status.toLowerCase()}`);
  if (status === 'REJECTED' && !reason?.trim()) throw badRequest('A rejection reason is required');

  const updated = await prisma.$transaction(async (tx) => {
    const sub = await tx.kycSubmission.update({
      where: { id },
      data: {
        status,
        reviewedAt: new Date(),
        reviewedBy: adminId,
        rejectionReason: status === 'REJECTED' ? reason!.trim() : null,
      },
    });
    // Only lift an account that is merely awaiting verification.
    if (status === 'APPROVED' && row.user.status === 'PENDING') {
      await tx.user.update({ where: { id: sub.userId }, data: { status: 'ACTIVE' } });
    }
    return sub;
  });

  await audit.record({
    adminId,
    action: status === 'APPROVED' ? 'APPROVE' : 'REJECT',
    entityType: 'kyc_submission', entityId: id,
    summary: status === 'APPROVED'
      ? `KYC approved for ${row.user.userCode} (${row.fullName})`
      : `KYC rejected for ${row.user.userCode} — ${reason!.trim()}`,
    before: { status: row.status }, after: { status, reason: reason?.trim() ?? null }, req,
  });

  notifyMember({
    userId: updated.userId,
    type: status === 'APPROVED' ? 'kyc.approved' : 'kyc.rejected',
    dedupeKey: `kyc-${status.toLowerCase()}:${id}`,
    title: status === 'APPROVED' ? 'Identity verified' : 'Verification unsuccessful',
    body: status === 'APPROVED'
      ? 'Your documents were accepted. Withdrawals are now available on your account.'
      : `Your documents were not accepted. Reason: ${reason!.trim()}. You can submit new ones at any time.`,
    meta: status === 'REJECTED' ? { reason: reason!.trim() } : undefined,
  });

  activity.record({
    userId: updated.userId,
    event: status === 'APPROVED' ? 'KYC_APPROVED' : 'KYC_REJECTED',
    actorAdminId: adminId,
    summary: status === 'APPROVED'
      ? 'Your identity verification was approved'
      : `Your identity verification was rejected — ${reason!.trim()}`,
    meta: status === 'REJECTED' ? { reason: reason!.trim() } : undefined,
  });
  return updated;
}

export const approve = (adminId: string, id: string, req?: Request) => decide(adminId, id, 'APPROVED', undefined, req);
export const reject = (adminId: string, id: string, reason: string, req?: Request) => decide(adminId, id, 'REJECTED', reason, req);

/** The stored file behind a document id, for the streaming endpoint. */
export async function document(documentId: string) {
  const doc = await prisma.kycDocument.findUnique({ where: { id: documentId } });
  if (!doc) throw notFound('Document not found');
  return doc;
}
