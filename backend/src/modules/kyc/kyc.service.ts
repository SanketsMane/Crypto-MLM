import type { KycDocumentType } from '@prisma/client';
import { prisma } from '../../core/db.js';
import { badRequest, conflict, notFound } from '../../core/errors.js';
import * as storage from '../../core/document-storage.js';
import * as activity from '../../core/activity.js';
import { notifyAdmins } from '../../core/notify.js';
import type { Request } from 'express';

/**
 * Member side of identity verification.
 *
 * A member has at most one submission in flight. Approved verification is
 * final; a rejection can be answered with a fresh submission, and the previous
 * attempt is kept so the decision history survives.
 */

export interface DocumentInput {
  type: KycDocumentType;
  mimeType: string;
  /** Base64 payload as sent by the browser, without the data-URL prefix. */
  data: string;
}

const REQUIRED: KycDocumentType[] = ['ID_FRONT', 'SELFIE'];

export async function current(userId: string) {
  const row = await prisma.kycSubmission.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: { documents: { select: { id: true, type: true, mimeType: true, sizeBytes: true, createdAt: true } } },
  });
  if (!row) return { status: 'NOT_STARTED' as const, submission: null };
  return {
    status: row.status,
    submission: {
      id: row.id, status: row.status, fullName: row.fullName, documentNo: row.documentNo,
      countryCode: row.countryCode, dateOfBirth: row.dateOfBirth,
      rejectionReason: row.rejectionReason, reviewedAt: row.reviewedAt,
      documents: row.documents, createdAt: row.createdAt,
    },
  };
}

export async function submit(userId: string, input: {
  fullName: string; documentNo: string; countryCode: string; dateOfBirth?: string;
  documents: DocumentInput[];
}, req?: Request) {
  const existing = await prisma.kycSubmission.findFirst({
    where: { userId, status: { in: ['PENDING', 'APPROVED'] } },
    select: { status: true },
  });
  if (existing?.status === 'APPROVED') throw conflict('Your identity is already verified');
  if (existing?.status === 'PENDING') throw conflict('A submission is already under review');

  const provided = new Set(input.documents.map((d) => d.type));
  const missing = REQUIRED.filter((t) => !provided.has(t));
  if (missing.length) throw badRequest(`Missing required documents: ${missing.join(', ')}`);

  // Decode and validate every file BEFORE writing any of them, so a rejected
  // upload never leaves half a submission on disk.
  const decoded = input.documents.map((d) => {
    const bytes = Buffer.from(d.data, 'base64');
    storage.assertAcceptable(d.mimeType, bytes.byteLength);
    // The declared type comes from the uploader; the bytes have to agree.
    storage.assertContentMatches(d.mimeType, bytes);
    return { ...d, bytes };
  });

  const stored: { type: KycDocumentType; file: storage.StoredDocument }[] = [];
  try {
    for (const d of decoded) {
      stored.push({ type: d.type, file: await storage.put(userId, d.mimeType, d.bytes) });
    }
    const submission = await prisma.kycSubmission.create({
      data: {
        userId,
        fullName: input.fullName.trim(),
        documentNo: input.documentNo.trim(),
        countryCode: input.countryCode.trim().toUpperCase().slice(0, 2),
        dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : undefined,
        documents: {
          create: stored.map((s) => ({
            type: s.type, storageKey: s.file.storageKey,
            mimeType: s.file.mimeType, sizeBytes: s.file.sizeBytes,
          })),
        },
      },
      include: { documents: true },
    });

    notifyAdmins({
      type: 'ops.kyc_pending',
      dedupeKey: `kyc-pending:${submission.id}`,
      title: 'Identity documents to review',
      body: `${input.fullName.trim()} submitted ${stored.length} document${stored.length === 1 ? '' : 's'} for verification.`,
      meta: { submissionId: submission.id },
    });

    activity.record({
      userId, event: 'KYC_SUBMITTED', req,
      summary: `Submitted identity documents for verification (${stored.length} file${stored.length === 1 ? '' : 's'})`,
    });
    return submission;
  } catch (err) {
    // The row is what makes a file findable; without it the bytes are orphaned.
    await Promise.all(stored.map((s) => storage.remove(s.file.storageKey)));
    throw err;
  }
}

export async function document(userId: string, documentId: string) {
  const doc = await prisma.kycDocument.findUnique({
    where: { id: documentId },
    include: { submission: { select: { userId: true } } },
  });
  if (!doc || doc.submission.userId !== userId) throw notFound('Document not found');
  return doc;
}
