import type { KycDocumentType, KycStatus } from '@prisma/client';
import { prisma } from '../../../core/db.js';

/**
 * The checks a reviewer would otherwise have to do by eye.
 *
 * Approving identity documents is the one place where a tired operator clicking
 * through a queue causes real damage: a duplicate account, an under-age member,
 * a name that never matched. None of that is visible from a photograph, so it
 * is computed here and put in front of the reviewer as a list they must look at.
 *
 * These never block a decision on their own — a human still approves or
 * rejects. They exist so the human is deciding with the facts, and so the
 * reasoning behind a decision is reconstructable afterwards.
 */

export type CheckLevel = 'PASS' | 'WARN' | 'FAIL';

export interface ReviewCheck {
  key: string;
  label: string;
  level: CheckLevel;
  /** What the reviewer needs to know, in one line. */
  detail: string;
}

const REQUIRED_DOCS: KycDocumentType[] = ['ID_FRONT', 'SELFIE'];

/** Comparable form of a name: no case, no accents, no punctuation. */
const normalise = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/).filter(Boolean);

/** Whole years between a date and now. */
export function ageOn(dob: Date, now = new Date()): number {
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - dob.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age;
}

export const MINIMUM_AGE = 18;

export interface CheckInput {
  submissionId: string;
  userId: string;
  fullName: string;
  documentNo: string;
  countryCode: string;
  dateOfBirth: Date | null;
  accountName: string;
  accountStatus: string;
  documents: { type: KycDocumentType }[];
  history: { status: KycStatus }[];
}

export async function buildChecks(input: CheckInput): Promise<ReviewCheck[]> {
  const checks: ReviewCheck[] = [];

  /* ── the document itself ───────────────────────────────────────────────── */

  const present = new Set(input.documents.map((d) => d.type));
  const missing = REQUIRED_DOCS.filter((t) => !present.has(t));
  checks.push({
    key: 'documents',
    label: 'Required documents attached',
    level: missing.length ? 'FAIL' : 'PASS',
    detail: missing.length
      ? `Missing ${missing.join(' and ')}`
      : `${input.documents.length} file${input.documents.length === 1 ? '' : 's'} attached`,
  });

  /* ── age ───────────────────────────────────────────────────────────────── */

  if (!input.dateOfBirth) {
    checks.push({
      key: 'age',
      label: `Age ${MINIMUM_AGE} or over`,
      level: 'WARN',
      detail: 'No date of birth was supplied — confirm it from the document',
    });
  } else {
    const age = ageOn(input.dateOfBirth);
    checks.push({
      key: 'age',
      label: `Age ${MINIMUM_AGE} or over`,
      // Under-age is not a judgement call. It is a hard stop.
      level: age >= MINIMUM_AGE ? 'PASS' : 'FAIL',
      detail: age >= MINIMUM_AGE
        ? `${age} years old`
        : `${age} years old — under the ${MINIMUM_AGE} minimum`,
    });
  }

  /* ── name ──────────────────────────────────────────────────────────────── */

  const docTokens = normalise(input.fullName);
  const accTokens = normalise(input.accountName);
  const shared = docTokens.filter((t) => accTokens.includes(t));
  const nameLevel: CheckLevel =
    !accTokens.length ? 'WARN'
    : shared.length === 0 ? 'FAIL'
    : shared.length >= Math.min(docTokens.length, accTokens.length) ? 'PASS'
    : 'WARN';

  checks.push({
    key: 'name',
    label: 'Document name matches the account',
    level: nameLevel,
    detail: nameLevel === 'PASS'
      ? `Both read "${input.accountName}"`
      : `Document says "${input.fullName}", account says "${input.accountName || '—'}"`,
  });

  /* ── one identity, one account ─────────────────────────────────────────── */

  const duplicates = await prisma.kycSubmission.findMany({
    where: {
      id: { not: input.submissionId },
      userId: { not: input.userId },
      documentNo: { equals: input.documentNo, mode: 'insensitive' },
    },
    select: {
      id: true, status: true,
      user: { select: { userCode: true, email: true } },
    },
    take: 5,
  });

  const approvedDupes = duplicates.filter((d) => d.status === 'APPROVED');
  checks.push({
    key: 'duplicate_document',
    label: 'Document number not used by another account',
    // An approved duplicate means this identity is already verified elsewhere.
    level: approvedDupes.length ? 'FAIL' : duplicates.length ? 'WARN' : 'PASS',
    detail: duplicates.length
      ? `Also submitted by ${duplicates.map((d) => `${d.user.userCode} (${d.status.toLowerCase()})`).join(', ')}`
      : 'Not seen on any other account',
  });

  /* ── the account ───────────────────────────────────────────────────────── */

  const badStatus = ['SUSPENDED', 'BLOCKED'].includes(input.accountStatus);
  checks.push({
    key: 'account_status',
    label: 'Account in good standing',
    level: badStatus ? 'WARN' : 'PASS',
    detail: badStatus
      ? `Account is ${input.accountStatus.toLowerCase()} — approving will not lift that`
      : `Account is ${input.accountStatus.toLowerCase()}`,
  });

  const rejections = input.history.filter((h) => h.status === 'REJECTED').length;
  if (rejections > 0) {
    checks.push({
      key: 'prior_rejections',
      label: 'No previous rejections',
      level: rejections >= 3 ? 'FAIL' : 'WARN',
      detail: `Rejected ${rejections} time${rejections === 1 ? '' : 's'} before`,
    });
  }

  return checks;
}

/** Worst level present, for the queue badge. */
export const worstLevel = (checks: ReviewCheck[]): CheckLevel =>
  checks.some((c) => c.level === 'FAIL') ? 'FAIL'
  : checks.some((c) => c.level === 'WARN') ? 'WARN'
  : 'PASS';
