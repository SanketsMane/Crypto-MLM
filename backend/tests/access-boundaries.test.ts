import { describe, expect, it, beforeEach } from 'vitest';
import { prisma } from '../src/core/db.js';
import * as kyc from '../src/modules/kyc/kyc.service.js';
import * as support from '../src/modules/support/support.service.js';
import * as walletSvc from '../src/modules/wallet/wallet.service.js';
import { resetData, seedPlan, makeUser } from './helpers.js';

/**
 * One member must never reach another member's things.
 *
 * These are the endpoints that take an id from the URL: if the owner is not
 * checked alongside it, knowing (or guessing) an id is enough to read someone
 * else's identity documents or support history.
 */

beforeEach(async () => { await resetData(); await seedPlan(); });

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]).toString('base64');

describe('identity documents', () => {
  it('cannot be read by another member', async () => {
    const owner = await makeUser();
    const stranger = await makeUser();

    const sub = await kyc.submit(owner.id, {
      fullName: 'Owner Person', documentNo: 'X-1', countryCode: 'GB',
      documents: [
        { type: 'ID_FRONT', mimeType: 'image/jpeg', data: jpeg },
        { type: 'SELFIE', mimeType: 'image/jpeg', data: jpeg },
      ],
    });
    const docId = sub.documents[0]!.id;

    await expect(kyc.document(owner.id, docId)).resolves.toBeTruthy();
    await expect(kyc.document(stranger.id, docId)).rejects.toThrow(/not found/i);
  });

  it('refuses a second submission while one is under review', async () => {
    const u = await makeUser();
    const docs = [
      { type: 'ID_FRONT' as const, mimeType: 'image/jpeg', data: jpeg },
      { type: 'SELFIE' as const, mimeType: 'image/jpeg', data: jpeg },
    ];
    await kyc.submit(u.id, { fullName: 'A', documentNo: 'X-2', countryCode: 'GB', documents: docs });
    await expect(
      kyc.submit(u.id, { fullName: 'A', documentNo: 'X-2', countryCode: 'GB', documents: docs }),
    ).rejects.toThrow(/already under review/i);
  });

  it('refuses a submission missing a required document', async () => {
    const u = await makeUser();
    await expect(kyc.submit(u.id, {
      fullName: 'A', documentNo: 'X-3', countryCode: 'GB',
      documents: [{ type: 'ID_FRONT', mimeType: 'image/jpeg', data: jpeg }],
    })).rejects.toThrow(/missing required/i);
  });

  it('refuses a file that is not what it claims to be', async () => {
    const u = await makeUser();
    const html = Buffer.from('<html><script>alert(1)</script></html>').toString('base64');
    await expect(kyc.submit(u.id, {
      fullName: 'A', documentNo: 'X-4', countryCode: 'GB',
      documents: [
        { type: 'ID_FRONT', mimeType: 'image/jpeg', data: html },
        { type: 'SELFIE', mimeType: 'image/jpeg', data: jpeg },
      ],
    })).rejects.toThrow(/not a valid/i);
  });
});

describe('support tickets', () => {
  it('cannot be replied to by another member', async () => {
    const owner = await makeUser();
    const stranger = await makeUser();
    const t = await support.create(owner.id, { subject: 'Mine', body: 'Please help me with this' });

    await expect(support.reply(t.id, stranger.id, 'let me in', false)).rejects.toThrow();
  });

  it('only lists a member’s own tickets', async () => {
    const a = await makeUser();
    const b = await makeUser();
    await support.create(a.id, { subject: 'A ticket', body: 'body text here' });
    await support.create(b.id, { subject: 'B ticket', body: 'body text here' });

    const forA = await support.list(a.id);
    expect(forA.length).toBe(1);
    expect(forA[0]!.subject).toBe('A ticket');
  });
});

describe('wallet ledger', () => {
  it('only ever returns the caller’s own entries', async () => {
    const a = await makeUser({ funded: 500 });
    const b = await makeUser({ funded: 500 });
    await walletSvc.transfer(a.id, 'FUND', 'MAIN', '100');
    await walletSvc.transfer(b.id, 'FUND', 'MAIN', '250');

    const ledger = await walletSvc.ledger(a.id, { take: 50, skip: 0 });
    const ids = new Set(
      (await prisma.ledgerEntry.findMany({ where: { userId: a.id }, select: { id: true } })).map((e) => e.id),
    );
    expect(ledger.entries.length).toBeGreaterThan(0);
    for (const e of ledger.entries) expect(ids.has(e.id)).toBe(true);
  });
});
