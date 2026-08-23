import { describe, expect, it, beforeEach } from 'vitest';
import { prisma } from '../src/core/db.js';
import { buildChecks, ageOn, MINIMUM_AGE } from '../src/modules/admin/kyc/kyc-checks.js';
import * as adminKyc from '../src/modules/admin/kyc/kyc.service.js';
import { assertContentMatches } from '../src/core/document-storage.js';
import { resetData, makeUser } from './helpers.js';

/**
 * The compliance checks a reviewer relies on. Each of these is a way a bad
 * approval actually happens: the same passport on two accounts, a minor, a
 * name that never matched, a file that is not the file it claims to be.
 */

let admin = { id: '' };

async function freshAdmin() {
  const role = await prisma.adminRole.upsert({
    where: { slug: 'kyc-test-role' },
    create: { name: 'KYC Test', slug: 'kyc-test-role', description: 't', level: 1, isSystem: false },
    update: {},
  });
  admin = await prisma.adminUser.create({
    data: { email: `kyc-admin-${Date.now()}@test.local`, name: 'KYC Admin', passwordHash: 'x', roleId: role.id },
  });
}

async function submission(opts: {
  userId: string; fullName: string; documentNo: string;
  dateOfBirth?: Date; docs?: ('ID_FRONT' | 'ID_BACK' | 'SELFIE')[];
  status?: 'PENDING' | 'APPROVED' | 'REJECTED';
}) {
  return prisma.kycSubmission.create({
    data: {
      userId: opts.userId,
      fullName: opts.fullName,
      documentNo: opts.documentNo,
      countryCode: 'GB',
      dateOfBirth: opts.dateOfBirth,
      status: opts.status ?? 'PENDING',
      documents: {
        create: (opts.docs ?? ['ID_FRONT', 'SELFIE']).map((type) => ({
          type, storageKey: `k/${type}-${Math.random()}`, mimeType: 'image/jpeg', sizeBytes: 1000,
        })),
      },
    },
    include: { documents: true },
  });
}

const checksFor = (id: string) => adminKyc.detail(id).then((d) => d.checks);
const level = (checks: { key: string; level: string }[], key: string) =>
  checks.find((c) => c.key === key)?.level;

beforeEach(async () => {
  await resetData();
  await freshAdmin();
});

describe('age', () => {
  it('computes whole years, not rounded ones', () => {
    const now = new Date('2026-08-23T00:00:00Z');
    expect(ageOn(new Date('2008-08-24T00:00:00Z'), now)).toBe(17); // birthday tomorrow
    expect(ageOn(new Date('2008-08-23T00:00:00Z'), now)).toBe(18); // birthday today
  });

  it('fails an applicant under the minimum age', async () => {
    const u = await makeUser();
    const dob = new Date(); dob.setUTCFullYear(dob.getUTCFullYear() - (MINIMUM_AGE - 1));
    const s = await submission({ userId: u.id, fullName: `User${1}`, documentNo: 'AGE-1', dateOfBirth: dob });
    expect(level(await checksFor(s.id), 'age')).toBe('FAIL');
  });

  it('warns rather than fails when no date of birth was given', async () => {
    const u = await makeUser();
    const s = await submission({ userId: u.id, fullName: 'Whoever', documentNo: 'AGE-2' });
    expect(level(await checksFor(s.id), 'age')).toBe('WARN');
  });
});

describe('one identity, one account', () => {
  it('flags a document number already approved on another account', async () => {
    const a = await makeUser();
    const b = await makeUser();
    await submission({ userId: a.id, fullName: 'A Person', documentNo: 'DUP-1', status: 'APPROVED' });
    const second = await submission({ userId: b.id, fullName: 'B Person', documentNo: 'DUP-1' });

    expect(level(await checksFor(second.id), 'duplicate_document')).toBe('FAIL');
  });

  it('matches the number regardless of case', async () => {
    const a = await makeUser();
    const b = await makeUser();
    await submission({ userId: a.id, fullName: 'A', documentNo: 'ab-123', status: 'APPROVED' });
    const second = await submission({ userId: b.id, fullName: 'B', documentNo: 'AB-123' });

    expect(level(await checksFor(second.id), 'duplicate_document')).toBe('FAIL');
  });

  it('does not flag the member’s own earlier attempt', async () => {
    const u = await makeUser();
    await submission({ userId: u.id, fullName: 'Same Person', documentNo: 'SELF-1', status: 'REJECTED' });
    const retry = await submission({ userId: u.id, fullName: 'Same Person', documentNo: 'SELF-1' });

    expect(level(await checksFor(retry.id), 'duplicate_document')).toBe('PASS');
  });
});

describe('documents', () => {
  it('fails when a required document is missing', async () => {
    const u = await makeUser();
    const s = await submission({ userId: u.id, fullName: 'X', documentNo: 'D-1', docs: ['ID_FRONT'] });
    expect(level(await checksFor(s.id), 'documents')).toBe('FAIL');
  });
});

describe('approval guard', () => {
  it('refuses to approve while a check is failing', async () => {
    const a = await makeUser();
    const b = await makeUser();
    await submission({ userId: a.id, fullName: 'A', documentNo: 'BLOCK-1', status: 'APPROVED' });
    const second = await submission({ userId: b.id, fullName: 'B', documentNo: 'BLOCK-1' });

    await expect(adminKyc.approve(admin.id, second.id)).rejects.toThrow(/cannot approve/i);
    // and it stays pending
    const after = await prisma.kycSubmission.findUniqueOrThrow({ where: { id: second.id } });
    expect(after.status).toBe('PENDING');
  });

  it('still allows rejection when checks fail — that is the way out', async () => {
    const a = await makeUser();
    const b = await makeUser();
    await submission({ userId: a.id, fullName: 'A', documentNo: 'REJ-1', status: 'APPROVED' });
    const second = await submission({ userId: b.id, fullName: 'B', documentNo: 'REJ-1' });

    await adminKyc.reject(admin.id, second.id, 'Document already verified on another account');
    const after = await prisma.kycSubmission.findUniqueOrThrow({ where: { id: second.id } });
    expect(after.status).toBe('REJECTED');
  });
});

describe('file contents', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  const html = Buffer.from('<html><script>alert(1)</script></html>');

  it('accepts bytes that match the declared type', () => {
    expect(() => assertContentMatches('image/jpeg', jpeg)).not.toThrow();
    expect(() => assertContentMatches('image/png', png)).not.toThrow();
    expect(() => assertContentMatches('application/pdf', Buffer.from('%PDF-1.7\n'))).not.toThrow();
  });

  it('rejects a file whose bytes contradict the declared type', () => {
    expect(() => assertContentMatches('image/jpeg', html)).toThrow(/not a valid/i);
    expect(() => assertContentMatches('image/png', jpeg)).toThrow(/not a valid/i);
  });
});
