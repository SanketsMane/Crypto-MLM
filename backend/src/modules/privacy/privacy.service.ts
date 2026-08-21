import type { ConsentDocument } from '@prisma/client';
import type { Request } from 'express';
import { prisma } from '../../core/db.js';
import { badRequest } from '../../core/errors.js';
import * as activity from '../../core/activity.js';

/**
 * Consent and data export.
 *
 * Both exist for the same reason: a member's relationship with a platform
 * holding their money should not be something only the platform can see.
 */

/**
 * The versions currently in force.
 *
 * Dated rather than numbered, so "which terms did they accept" is answerable
 * by reading the record — and re-accepting is only required when this changes.
 */
export const CURRENT_VERSIONS: Record<ConsentDocument, string> = {
  TERMS: '2026-08-01',
  PRIVACY: '2026-08-01',
  RISK_DISCLOSURE: '2026-08-01',
};

const DOCUMENT_LABEL: Record<ConsentDocument, string> = {
  TERMS: 'Terms of service',
  PRIVACY: 'Privacy policy',
  RISK_DISCLOSURE: 'Risk disclosure',
};

const PATHS: Record<ConsentDocument, string> = {
  TERMS: '/legal/terms',
  PRIVACY: '/legal/privacy',
  RISK_DISCLOSURE: '/legal/risk-disclosure',
};

export async function consentStatus(userId: string) {
  const records = await prisma.consentRecord.findMany({
    where: { userId },
    orderBy: { acceptedAt: 'desc' },
  });

  const documents = (Object.keys(CURRENT_VERSIONS) as ConsentDocument[]).map((doc) => {
    const current = CURRENT_VERSIONS[doc];
    const accepted = records.find((r) => r.document === doc && r.version === current);
    const previous = records.find((r) => r.document === doc);
    return {
      document: doc,
      label: DOCUMENT_LABEL[doc],
      path: PATHS[doc],
      currentVersion: current,
      accepted: Boolean(accepted),
      acceptedAt: accepted?.acceptedAt ?? null,
      /// True when they agreed to an older version and the document has moved on.
      outdated: !accepted && Boolean(previous),
      previousVersion: previous?.version ?? null,
    };
  });

  return { documents, allAccepted: documents.every((d) => d.accepted) };
}

export async function accept(userId: string, documents: ConsentDocument[], req?: Request) {
  if (!documents.length) throw badRequest('Nothing to accept');

  const rows = documents.map((document) => ({
    userId,
    document,
    version: CURRENT_VERSIONS[document],
    ip: req?.ip ?? null,
    userAgent: req?.get('user-agent')?.slice(0, 255) ?? null,
  }));

  // Accepting the same version twice is not an error — it is a double click.
  await prisma.consentRecord.createMany({ data: rows, skipDuplicates: true });

  activity.record({
    userId, event: 'PROFILE_UPDATED', req,
    summary: `Accepted ${documents.map((d) => DOCUMENT_LABEL[d].toLowerCase()).join(', ')}`,
    meta: { documents, versions: rows.map((r) => r.version) },
  });

  return consentStatus(userId);
}

/**
 * Everything the platform holds about one member, as one JSON document.
 *
 * Assembled on request rather than queued, because for a single member it is a
 * handful of indexed queries — and a download that arrives immediately is worth
 * more than one that arrives by email tomorrow.
 *
 * Deliberately excluded: password and two-factor hashes, session tokens, and
 * identity document bytes. The first two are secrets that exist so that nobody
 * can read them back, and the third is available through the verification
 * screen where it belongs.
 */
export async function exportFor(userId: string) {
  const [user, wallets, ledger, investments, deposits, withdrawals, commissions,
         roi, tickets, kyc, activityLog, consents, sessions] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true, userCode: true, email: true, phone: true, firstName: true, lastName: true,
        status: true, affiliateMode: true, walletAddress: true, depth: true,
        totalInvested: true, totalEarned: true, directCount: true,
        emailVerifiedAt: true, twoFactorEnabledAt: true, lastLoginAt: true, createdAt: true,
        sponsor: { select: { userCode: true } },
        currentRank: { select: { code: true, name: true } },
      },
    }),
    prisma.walletAccount.findMany({ where: { userId }, select: { type: true, balance: true, locked: true } }),
    prisma.ledgerEntry.findMany({
      where: { userId }, orderBy: { createdAt: 'asc' },
      select: {
        reference: true, direction: true, category: true, amount: true,
        balanceAfter: true, description: true, createdAt: true,
      },
    }),
    prisma.investment.findMany({
      where: { userId }, orderBy: { createdAt: 'asc' },
      select: { amount: true, dailyRoiPercent: true, capLimit: true, totalEarned: true, status: true, startedAt: true, cappedAt: true },
    }),
    prisma.deposit.findMany({
      where: { userId }, orderBy: { createdAt: 'asc' },
      select: { reference: true, amount: true, network: true, txHash: true, status: true, confirmedAt: true, createdAt: true },
    }),
    prisma.withdrawal.findMany({
      where: { userId }, orderBy: { createdAt: 'asc' },
      select: { reference: true, amount: true, fee: true, netAmount: true, walletAddress: true, txHash: true, status: true, processedAt: true, createdAt: true },
    }),
    prisma.commission.findMany({
      where: { userId }, orderBy: { createdAt: 'asc' },
      select: { kind: true, level: true, percent: true, baseAmount: true, amount: true, paidAmount: true, createdAt: true },
    }),
    prisma.roiAccrual.findMany({
      where: { userId }, orderBy: { accrualDate: 'asc' },
      select: { accrualDate: true, baseAmount: true, ratePercent: true, amount: true, paidAmount: true },
    }),
    prisma.supportTicket.findMany({
      where: { userId }, orderBy: { createdAt: 'asc' },
      select: {
        subject: true, status: true, priority: true, category: true, createdAt: true,
        messages: { orderBy: { createdAt: 'asc' }, select: { body: true, isStaff: true, createdAt: true } },
      },
    }),
    prisma.kycSubmission.findMany({
      where: { userId }, orderBy: { createdAt: 'asc' },
      select: {
        fullName: true, documentNo: true, countryCode: true, status: true,
        rejectionReason: true, reviewedAt: true, createdAt: true,
        documents: { select: { type: true, mimeType: true, sizeBytes: true, createdAt: true } },
      },
    }),
    prisma.activityLog.findMany({
      where: { userId }, orderBy: { createdAt: 'asc' },
      select: { event: true, summary: true, ip: true, userAgent: true, createdAt: true },
    }),
    prisma.consentRecord.findMany({
      where: { userId }, orderBy: { acceptedAt: 'asc' },
      select: { document: true, version: true, ip: true, acceptedAt: true },
    }),
    prisma.session.findMany({
      where: { actorType: 'USER', actorId: userId }, orderBy: { createdAt: 'asc' },
      // The token hash is deliberately not included — it is a credential.
      select: { userAgent: true, ip: true, createdAt: true, lastUsedAt: true, revokedAt: true, revokedReason: true },
    }),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    notice:
      'This is everything FortuneX holds about your account. Passwords, two-factor secrets and session tokens are not included — they are stored in a form that cannot be read back, which is the point of them.',
    account: user,
    wallets,
    ledger,
    investments,
    deposits,
    withdrawals,
    commissions,
    dailyReturns: roi,
    supportTickets: tickets,
    identityVerification: kyc,
    accountActivity: activityLog,
    consents,
    signInHistory: sessions,
  };
}
