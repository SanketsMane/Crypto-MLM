import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import * as search from '../src/modules/search/search.service.js';
import * as roaming from '../src/modules/roaming-club/roaming-club.service.js';
import * as contact from '../src/modules/contact/contact.service.js';
import * as privacy from '../src/modules/privacy/privacy.service.js';
import { purchase } from '../src/modules/investment/investment.service.js';
import { prisma, resetData, seedPlan, makeUser, accessTokenFor } from './helpers.js';

const app = createApp();

beforeAll(seedPlan);
beforeEach(resetData);

async function buy(userId: string, amount: number) {
  const pkg = await prisma.packagePlan.findFirstOrThrow({ where: { amount: String(amount) } });
  await prisma.$executeRaw`
    UPDATE wallet_accounts SET balance = balance + ${amount}::numeric
     WHERE "userId" = ${userId} AND type = 'FUND'`;
  return purchase(userId, pkg.id);
}

// ── search ──────────────────────────────────────────────────────────────────

describe('search', () => {
  const hitIds = (groups: search.Group[], key: string) =>
    groups.find((g) => g.key === key)?.hits.map((h) => h.id) ?? [];

  it('finds a member inside your own downline', async () => {
    const me = await makeUser();
    const mine = await makeUser({ sponsorId: me.id });

    const groups = await search.forMember(me.id, mine.userCode);
    expect(hitIds(groups, 'team')).toContain(mine.id);
  });

  it('cannot reach a member outside your downline', async () => {
    /**
     * The scoping has to live in the query, not in a filter applied to a wider
     * result. A member searching another member's code is the cheapest possible
     * probe of the whole user table, and it must come back with nothing.
     */
    const me = await makeUser();
    const stranger = await makeUser();
    const myUpline = await makeUser();
    await prisma.user.update({ where: { id: me.id }, data: { sponsorId: myUpline.id, path: myUpline.id, depth: 1 } });

    for (const target of [stranger, myUpline]) {
      const groups = await search.forMember(me.id, target.userCode);
      expect(hitIds(groups, 'team')).not.toContain(target.id);
    }
  });

  it('cannot reach another member’s transactions', async () => {
    const me = await makeUser();
    const other = await makeUser();
    await buy(other.id, 110);

    const theirs = await prisma.ledgerEntry.findFirstOrThrow({ where: { userId: other.id } });
    const groups = await search.forMember(me.id, theirs.reference);
    expect(hitIds(groups, 'transactions')).toHaveLength(0);
  });

  it('finds your own transaction by its reference', async () => {
    const me = await makeUser();
    await buy(me.id, 110);
    const mine = await prisma.ledgerEntry.findFirstOrThrow({ where: { userId: me.id } });

    const groups = await search.forMember(me.id, mine.reference);
    expect(hitIds(groups, 'transactions')).toContain(mine.id);
  });

  it('ignores a query too short to mean anything', async () => {
    const me = await makeUser();
    expect(await search.forMember(me.id, 'a')).toEqual([]);
    expect(await search.forMember(me.id, ' ')).toEqual([]);
    expect(await search.forAdmin('x')).toEqual([]);
  });

  it('returns no empty groups', async () => {
    const me = await makeUser();
    const groups = await search.forMember(me.id, 'zzzznothingmatchesthis');
    expect(groups.every((g) => g.hits.length > 0)).toBe(true);
  });

  it('lets an operator search every member, which a member cannot', async () => {
    const a = await makeUser();
    const groups = await search.forAdmin(a.userCode);
    expect(groups.find((g) => g.key === 'members')?.hits.map((h) => h.id)).toContain(a.id);
  });

  it('matches a member code regardless of the case typed', async () => {
    const me = await makeUser();
    const mine = await makeUser({ sponsorId: me.id });

    const lower = await search.forMember(me.id, mine.userCode.toLowerCase());
    expect(hitIds(lower, 'team')).toContain(mine.id);
  });

  it('needs a session', async () => {
    expect((await request(app).get('/api/v1/search?q=test')).status).toBe(401);
  });
});

// ── roaming club ────────────────────────────────────────────────────────────

describe('roaming club', () => {
  async function tiers() {
    await prisma.roamingClubTier.deleteMany({});
    await prisma.roamingClubTier.createMany({
      data: [
        { track: 'SELF_CAPITALIST', destination: 'Goa',   selfRequirement: '1000', teamRequirement: '0',     sortOrder: 1 },
        { track: 'AFFILIATE',       destination: 'Dubai', selfRequirement: '500',  teamRequirement: '5000',  sortOrder: 2 },
      ],
    });
  }
  beforeEach(tiers);

  it('awards a self-capital tier on buying enough, without being asked', async () => {
    // Buying evaluates the club itself — a member should not have to visit a
    // screen for an entitlement they have already earned.
    const u = await makeUser();
    await buy(u.id, 1100);

    const awards = await prisma.roamingClubAward.findMany({
      where: { userId: u.id }, include: { tier: true },
    });
    expect(awards.map((a) => a.tier.destination)).toEqual(['Goa']);
  });

  it('awards nothing on capital below the requirement', async () => {
    const u = await makeUser();
    await buy(u.id, 530);
    expect(await prisma.roamingClubAward.count({ where: { userId: u.id } })).toBe(0);
    expect(await roaming.evaluate(u.id)).toEqual([]);
  });

  it('withholds an affiliate tier until the team requirement is met too', async () => {
    const u = await makeUser();
    await buy(u.id, 1100);

    // Capital clears the $500 bar, but there is no team business yet — so the
    // affiliate track stays unearned while the self-capital one is granted.
    const held = await prisma.roamingClubAward.findMany({ where: { userId: u.id }, include: { tier: true } });
    expect(held.map((a) => a.tier.destination)).toEqual(['Goa']);

    await prisma.teamVolume.update({
      where: { userId: u.id },
      data: { totalTeamBusiness: '5000' },
    });
    expect(await roaming.evaluate(u.id)).toEqual(['Dubai']);
  });

  it('never awards the same destination twice', async () => {
    const u = await makeUser();
    await buy(u.id, 1100);

    // Already held, so re-evaluating — on every subsequent purchase — adds nothing.
    expect(await roaming.evaluate(u.id)).toEqual([]);
    await buy(u.id, 1100);
    expect(await prisma.roamingClubAward.count({ where: { userId: u.id } })).toBe(1);
  });

  it('awards nothing to a suspended member', async () => {
    const u = await makeUser();
    await prisma.user.update({ where: { id: u.id }, data: { status: 'SUSPENDED' } });
    await prisma.user.update({ where: { id: u.id }, data: { totalInvested: '5000' } });

    expect(await roaming.evaluate(u.id)).toEqual([]);
    expect(await prisma.roamingClubAward.count({ where: { userId: u.id } })).toBe(0);
  });

  it('posts nothing to the ledger, because a trip is not cash', async () => {
    /**
     * Travel entitlements sit outside the earnings ceiling (plan p18). If one
     * ever reached the ledger it would consume a member's cap and quietly
     * reduce what they could earn in cash.
     */
    const u = await makeUser();
    await buy(u.id, 1100);

    expect(await prisma.roamingClubAward.count({ where: { userId: u.id } })).toBe(1);
    expect(await prisma.ledgerEntry.count({
      where: { userId: u.id, category: 'ROAMING_CLUB' },
    })).toBe(0);
  });

  it('reports progress toward tiers not yet reached', async () => {
    const u = await makeUser();
    await buy(u.id, 530);

    const rows = await roaming.progress(u.id);
    expect(rows).toHaveLength(2);

    const goa = rows.find((r) => r.destination === 'Goa')!;
    expect(goa.achieved).toBe(false);
    expect(goa.selfActual).toBe('530');
    expect(goa.selfRequirement).toBe('1000');
  });

  it('ignores a retired tier', async () => {
    await prisma.roamingClubTier.updateMany({ where: { destination: 'Goa' }, data: { isActive: false } });
    const u = await makeUser();
    await buy(u.id, 1100);

    expect(await roaming.evaluate(u.id)).toEqual([]);
    expect((await roaming.progress(u.id)).map((r) => r.destination)).toEqual(['Dubai']);
  });
});

// ── contact ─────────────────────────────────────────────────────────────────

describe('contact enquiries', () => {
  const enquiry = {
    name: '  Asha Menon ', email: '  ASHA@Example.COM ',
    subject: ' Withdrawal question ', message: ' How long do payouts take? ',
  };

  it('stores the enquiry before trying to notify anyone', async () => {
    /**
     * The record is the source of truth. An enquiry that only ever existed as
     * an email is gone the moment that email bounces — and with SMTP unset,
     * which is the default, every one of them would be.
     */
    const { id } = await contact.submit(enquiry);
    const row = await prisma.contactMessage.findUniqueOrThrow({ where: { id } });

    expect(row.name).toBe('Asha Menon');
    expect(row.email).toBe('asha@example.com');
    expect(row.subject).toBe('Withdrawal question');
    expect(row.message).toBe('How long do payouts take?');
  });

  it('keeps the enquiry even when there is nowhere to send it', async () => {
    const inbox = process.env.CONTACT_INBOX;
    const from = process.env.SMTP_FROM;
    delete process.env.CONTACT_INBOX;
    delete process.env.SMTP_FROM;
    try {
      const { id } = await contact.submit(enquiry);
      expect(await prisma.contactMessage.findUnique({ where: { id } })).not.toBeNull();
    } finally {
      if (inbox) process.env.CONTACT_INBOX = inbox;
      if (from) process.env.SMTP_FROM = from;
    }
  });

  it('accepts an enquiry from the public, with no session', async () => {
    const res = await request(app).post('/api/v1/contact').send({
      name: 'Ravi', email: 'ravi@example.com',
      subject: 'Hello there', message: 'A question about the plan.',
    });
    expect(res.status).toBeLessThan(300);
    expect(await prisma.contactMessage.count()).toBe(1);
  });

  it('refuses an enquiry that is not one', async () => {
    const res = await request(app).post('/api/v1/contact').send({ name: '', email: 'nope', subject: '', message: '' });
    // 422 is this platform's convention for a body that fails validation.
    expect(res.status).toBe(422);
    expect(await prisma.contactMessage.count()).toBe(0);
  });
});

// ── privacy ─────────────────────────────────────────────────────────────────

describe('consent', () => {
  it('starts with nothing accepted and every document listed', async () => {
    const u = await makeUser();
    const status = await privacy.consentStatus(u.id);

    expect(status.allAccepted).toBe(false);
    expect(status.documents.map((d) => d.document).sort())
      .toEqual(['PRIVACY', 'RISK_DISCLOSURE', 'TERMS']);
    expect(status.documents.every((d) => !d.accepted && !d.outdated)).toBe(true);
  });

  it('records what was accepted, and when', async () => {
    const u = await makeUser();
    const status = await privacy.accept(u.id, ['TERMS']);

    const terms = status.documents.find((d) => d.document === 'TERMS')!;
    expect(terms.accepted).toBe(true);
    expect(terms.acceptedAt).toBeInstanceOf(Date);
    expect(status.allAccepted).toBe(false);

    const row = await prisma.consentRecord.findFirstOrThrow({ where: { userId: u.id } });
    expect(row.version).toBe(privacy.CURRENT_VERSIONS.TERMS);
  });

  it('treats a double click as one acceptance', async () => {
    const u = await makeUser();
    await privacy.accept(u.id, ['TERMS']);
    await privacy.accept(u.id, ['TERMS']);
    expect(await prisma.consentRecord.count({ where: { userId: u.id, document: 'TERMS' } })).toBe(1);
  });

  it('marks a document outdated when the version has moved on', async () => {
    const u = await makeUser();
    await prisma.consentRecord.create({
      data: { userId: u.id, document: 'TERMS', version: '2020-01-01' },
    });

    const terms = (await privacy.consentStatus(u.id)).documents.find((d) => d.document === 'TERMS')!;
    expect(terms.accepted).toBe(false);
    expect(terms.outdated).toBe(true);
    expect(terms.previousVersion).toBe('2020-01-01');
  });

  it('refuses an empty acceptance', async () => {
    const u = await makeUser();
    await expect(privacy.accept(u.id, [])).rejects.toThrow(/nothing to accept/i);
  });

  it('reports all accepted only once every document is', async () => {
    const u = await makeUser();
    const status = await privacy.accept(u.id, ['TERMS', 'PRIVACY', 'RISK_DISCLOSURE']);
    expect(status.allAccepted).toBe(true);
  });
});

describe('data export', () => {
  it('never includes a credential', async () => {
    /**
     * The export is a file the member downloads and may forward anywhere. A
     * password hash, a TOTP seed or a session token inside it turns a routine
     * privacy feature into a credential leak with a download button.
     */
    const u = await makeUser();
    await buy(u.id, 110);
    await privacy.accept(u.id, ['TERMS']);

    const dump = JSON.stringify(await privacy.exportFor(u.id));

    for (const forbidden of [
      'passwordHash', 'twoFactorSecret', 'tokenHash', 'refreshToken',
      'recoveryCode', 'otpHash',
    ]) {
      expect(dump).not.toContain(forbidden);
    }

    const real = await prisma.user.findUniqueOrThrow({
      where: { id: u.id }, select: { passwordHash: true },
    });
    expect(dump).not.toContain(real.passwordHash);
  });

  it('includes the money records a member would need to check the platform', async () => {
    const u = await makeUser();
    await buy(u.id, 110);

    const dump = await privacy.exportFor(u.id);

    expect(dump.account.userCode).toBe(u.userCode);
    expect(dump.wallets).toHaveLength(3);
    expect(dump.investments).toHaveLength(1);
    expect(dump.ledger.length).toBeGreaterThan(0);
    expect(dump.exportedAt).toBeTruthy();
    expect(dump.notice).toMatch(/cannot be read back/i);
  });

  it('holds nobody else’s data', async () => {
    const me = await makeUser();
    const other = await makeUser();
    await buy(other.id, 110);

    const dump = JSON.stringify(await privacy.exportFor(me.id));
    expect(dump).not.toContain(other.userCode);
    expect(dump).not.toContain(other.email);
  });

  it('is served only to the member themselves', async () => {
    const me = await makeUser();
    expect((await request(app).get('/api/v1/privacy/export')).status).toBe(401);

    const res = await request(app)
      .get('/api/v1/privacy/export')
      .set('Authorization', `Bearer ${await accessTokenFor(me.id)}`);

    expect(res.status).toBe(200);
    expect(res.body.data?.account?.userCode ?? res.body.account?.userCode).toBe(me.userCode);
  });
});
