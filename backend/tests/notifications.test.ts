import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { clearSessionCache } from '../src/middleware/auth.js';
import { deliverAdmins, deliverMember } from '../src/core/notify.js';
import * as service from '../src/modules/notification/notification.service.js';
import { sendEarningsDigest } from '../src/jobs/earnings-digest.job.js';
import { purchase } from '../src/modules/investment/investment.service.js';
import { runDailyRoi } from '../src/jobs/daily-roi.job.js';
import { prisma, resetData, seedPlan, makeUser, accessTokenFor, verifyKyc } from './helpers.js';

const app = createApp();
const plan = (amount: string) => prisma.packagePlan.findFirstOrThrow({ where: { amount } });

const auth = async (userId: string) => `Bearer ${await accessTokenFor(userId)}`;

/** An active admin holding a permission, so alert routing has somewhere to go. */
async function makeAdmin(roleSlug = 'super-admin') {
  const role = await prisma.adminRole.findFirstOrThrow({ where: { slug: roleSlug } });
  return prisma.adminUser.create({
    data: {
      email: `admin-${Date.now()}-${Math.round(performance.now() * 1000)}@test.local`,
      passwordHash: 'x', name: 'Test Operator', roleId: role.id,
    },
  });
}

const notify = (userId: string, over: Partial<Parameters<typeof deliverMember>[0]> = {}) =>
  deliverMember({
    userId,
    type: 'deposit.credited',
    title: 'Deposit credited',
    body: '$100 is now in your Fund wallet.',
    ...over,
  });

beforeAll(seedPlan);
beforeEach(async () => {
  await resetData();
  clearSessionCache();
});

describe('delivery', () => {
  it('reaches the member it was addressed to', async () => {
    const u = await makeUser();
    await notify(u.id);

    const { rows } = await service.list('USER', u.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe('Deposit credited');
    expect(rows[0]!.read).toBe(false);
  });

  it('never reaches anyone else', async () => {
    const a = await makeUser();
    const b = await makeUser();
    await notify(a.id);

    expect((await service.list('USER', b.id)).rows).toHaveLength(0);
  });

  it('sends the same event only once, however many times it is raised', async () => {
    const u = await makeUser();
    for (let i = 0; i < 4; i += 1) await notify(u.id, { dedupeKey: 'deposit:abc' });

    expect((await service.list('USER', u.id)).rows).toHaveLength(1);
  });

  it('still allows genuinely different events of the same type', async () => {
    const u = await makeUser();
    await notify(u.id, { dedupeKey: 'deposit:one' });
    await notify(u.id, { dedupeKey: 'deposit:two' });

    expect((await service.list('USER', u.id)).rows).toHaveLength(2);
  });

  it('carries the link that makes it actionable', async () => {
    const u = await makeUser();
    await notify(u.id);
    const { rows } = await service.list('USER', u.id);
    expect(rows[0]!.link).toBe('/deposit');
  });
});

describe('operator alerts', () => {
  it('reach every admin who can act on them', async () => {
    const a = await makeAdmin();
    const b = await makeAdmin();

    await deliverAdmins({
      type: 'ops.withdrawal_pending',
      title: 'Withdrawal awaiting approval',
      body: '$500 to 0x1234…5678.',
    });

    expect((await service.list('ADMIN', a.id)).rows).toHaveLength(1);
    expect((await service.list('ADMIN', b.id)).rows).toHaveLength(1);
  });

  it('do not reach an admin who lacks the permission', async () => {
    const finance = await makeAdmin('super-admin');
    const support = await makeAdmin('support-agent');

    await deliverAdmins({
      type: 'ops.withdrawal_pending',
      title: 'Withdrawal awaiting approval',
      body: '$500 pending.',
    });

    expect((await service.list('ADMIN', finance.id)).rows).toHaveLength(1);
    expect((await service.list('ADMIN', support.id)).rows).toHaveLength(0);
  });

  it('do not reach a deactivated admin', async () => {
    const a = await makeAdmin();
    await prisma.adminUser.update({ where: { id: a.id }, data: { isActive: false } });

    await deliverAdmins({ type: 'ops.kyc_pending', title: 'Documents to review', body: 'One submission.' });

    expect((await service.list('ADMIN', a.id)).rows).toHaveLength(0);
  });

  it('skip the operator who caused them', async () => {
    const actor = await makeAdmin();
    const other = await makeAdmin();

    await deliverAdmins({
      type: 'system.settings_changed',
      title: 'Withdrawal fee changed',
      body: '5 → 6.',
      exceptAdminId: actor.id,
    });

    expect((await service.list('ADMIN', actor.id)).rows).toHaveLength(0);
    expect((await service.list('ADMIN', other.id)).rows).toHaveLength(1);
  });

  it('one operator reading it does not mark it read for the others', async () => {
    const a = await makeAdmin();
    const b = await makeAdmin();
    await deliverAdmins({ type: 'ops.kyc_pending', title: 'Documents to review', body: 'One submission.' });

    const mine = (await service.list('ADMIN', a.id)).rows[0]!;
    await service.markRead('ADMIN', a.id, [mine.id]);

    expect((await service.summary('ADMIN', a.id)).unread).toBe(0);
    expect((await service.summary('ADMIN', b.id)).unread).toBe(1);
  });
});

describe('read state', () => {
  it('counts unread and breaks it down by category', async () => {
    const u = await makeUser();
    await notify(u.id, { dedupeKey: '1' });
    await notify(u.id, { dedupeKey: '2' });
    await deliverMember({
      userId: u.id, type: 'security.password_changed',
      title: 'Password changed', body: 'All devices signed out.',
    });

    const s = await service.summary('USER', u.id);
    expect(s.unread).toBe(3);
    expect(s.byCategory.MONEY).toBe(2);
    expect(s.byCategory.SECURITY).toBe(1);
  });

  it('flags a critical notice so the bell can show it', async () => {
    const u = await makeUser();
    await deliverMember({
      userId: u.id, type: 'security.payout_address',
      title: 'Payout address changed', body: 'Future withdrawals go elsewhere.',
    });

    expect((await service.summary('USER', u.id)).hasCritical).toBe(true);
  });

  it('marks everything read', async () => {
    const u = await makeUser();
    for (const k of ['a', 'b', 'c']) await notify(u.id, { dedupeKey: k });

    const result = await service.markAllRead('USER', u.id);
    expect(result.updated).toBe(3);
    expect((await service.summary('USER', u.id)).unread).toBe(0);
  });

  it('marks everything read within one category only', async () => {
    const u = await makeUser();
    await notify(u.id, { dedupeKey: 'money' });
    await deliverMember({
      userId: u.id, type: 'security.password_changed',
      title: 'Password changed', body: 'All devices signed out.',
    });

    await service.markAllRead('USER', u.id, 'MONEY');

    const s = await service.summary('USER', u.id);
    expect(s.unread).toBe(1);
    expect(s.byCategory.SECURITY).toBe(1);
  });

  it('can be marked unread again', async () => {
    const u = await makeUser();
    await notify(u.id);
    const row = (await service.list('USER', u.id)).rows[0]!;

    await service.markRead('USER', u.id, [row.id]);
    expect((await service.summary('USER', u.id)).unread).toBe(0);

    await service.markUnread('USER', u.id, row.id);
    expect((await service.summary('USER', u.id)).unread).toBe(1);
  });

  it('refuses to mark another member notification read', async () => {
    const a = await makeUser();
    const b = await makeUser();
    await notify(a.id);
    const theirs = (await service.list('USER', a.id)).rows[0]!;

    const result = await service.markRead('USER', b.id, [theirs.id]);

    expect(result.updated).toBe(0);
    expect((await service.summary('USER', a.id)).unread).toBe(1);
  });

  it('archives without deleting, and archived leaves the list', async () => {
    const u = await makeUser();
    await notify(u.id);
    const row = (await service.list('USER', u.id)).rows[0]!;

    await service.archive('USER', u.id, [row.id]);

    expect((await service.list('USER', u.id)).rows).toHaveLength(0);
    expect((await service.list('USER', u.id, { includeArchived: true })).rows).toHaveLength(1);
    expect((await service.summary('USER', u.id)).unread).toBe(0);
  });

  it('clears read notifications but leaves unread ones alone', async () => {
    const u = await makeUser();
    await notify(u.id, { dedupeKey: 'read-me' });
    await notify(u.id, { dedupeKey: 'leave-me' });
    const rows = (await service.list('USER', u.id)).rows;
    await service.markRead('USER', u.id, [rows[0]!.id]);

    await service.clearRead('USER', u.id);

    const left = await service.list('USER', u.id);
    expect(left.rows).toHaveLength(1);
    expect(left.rows[0]!.read).toBe(false);
  });

  it('pages without repeating or skipping', async () => {
    const u = await makeUser();
    for (let i = 0; i < 7; i += 1) await notify(u.id, { dedupeKey: `n${i}` });

    const first = await service.list('USER', u.id, { take: 3 });
    expect(first.rows).toHaveLength(3);
    expect(first.nextCursor).toBeTruthy();

    const second = await service.list('USER', u.id, { take: 3, cursor: first.nextCursor! });
    const ids = new Set([...first.rows, ...second.rows].map((r) => r.id));
    expect(ids.size).toBe(6);
  });
});

describe('preferences', () => {
  it('delivers when nothing has been configured', async () => {
    const u = await makeUser();
    await notify(u.id);
    expect((await service.list('USER', u.id)).rows).toHaveLength(1);
  });

  it('silences a category the member opted out of', async () => {
    const u = await makeUser();
    await service.setPreference('USER', u.id, 'MONEY', { inApp: false });

    await notify(u.id);

    expect((await service.list('USER', u.id)).rows).toHaveLength(0);
  });

  it('delivers security notices even when everything else is off', async () => {
    const u = await makeUser();
    for (const c of ['MONEY', 'EARNINGS', 'NETWORK', 'SUPPORT'] as const) {
      await service.setPreference('USER', u.id, c, { inApp: false });
    }

    await deliverMember({
      userId: u.id, type: 'security.payout_address',
      title: 'Payout address changed', body: 'Future withdrawals go elsewhere.',
    });

    expect((await service.list('USER', u.id)).rows).toHaveLength(1);
  });

  it('refuses to turn security notices off', async () => {
    const u = await makeUser();
    await expect(
      service.setPreference('USER', u.id, 'SECURITY', { inApp: false }),
    ).rejects.toThrow(/cannot be turned off/);
  });
});

describe('wired into the real flows', () => {
  it('tells a member when their package is activated', async () => {
    const u = await makeUser({ funded: 1100 });
    await purchase(u.id, (await plan('1100')).id);
    await new Promise((r) => setTimeout(r, 150));

    const { rows } = await service.list('USER', u.id);
    expect(rows.some((r) => r.type === 'investment.purchased')).toBe(true);
  });

  it('tells a sponsor when their referral invests', async () => {
    const sponsor = await makeUser({ funded: 1000 });
    await purchase(sponsor.id, (await plan('530')).id);
    const buyer = await makeUser({ sponsorId: sponsor.id, funded: 1100 });

    await purchase(buyer.id, (await plan('1100')).id);
    await new Promise((r) => setTimeout(r, 200));

    const { rows } = await service.list('USER', sponsor.id);
    const bonus = rows.find((r) => r.type === 'commission.direct');
    expect(bonus).toBeTruthy();
    expect(bonus!.title).toContain('44');
  });

  it('tells operators a withdrawal is waiting', async () => {
    const admin = await makeAdmin();
    const u = await makeUser();
    await verifyKyc(u.id);
    await prisma.$executeRaw`UPDATE wallet_accounts SET balance = 500 WHERE "userId" = ${u.id} AND type = 'MAIN'`;

    const { request: requestWithdrawal } = await import('../src/modules/withdrawal/withdrawal.service.js');
    await requestWithdrawal(u.id, '100', '0x1234567890abcdef1234567890abcdef12345678', undefined, 'password');
    await new Promise((r) => setTimeout(r, 200));

    const { rows } = await service.list('ADMIN', admin.id);
    expect(rows.some((r) => r.type === 'ops.withdrawal_pending')).toBe(true);
  });
});

describe('the daily digest', () => {
  it('summarises a day of returns into one notification', async () => {
    const u = await makeUser({ funded: 1100 });
    await purchase(u.id, (await plan('1100')).id);
    const monday = new Date(Date.UTC(2026, 7, 17));
    await runDailyRoi(monday);
    await prisma.notificationRecipient.deleteMany({ where: { actorId: u.id } });

    const result = await sendEarningsDigest(monday);

    expect(result.notified).toBe(1);
    const { rows } = await service.list('USER', u.id);
    const digest = rows.find((r) => r.type === 'earnings.daily');
    expect(digest).toBeTruthy();
    expect(digest!.title).toContain('5.5');
  });

  it('sends one per member per day however often it runs', async () => {
    const u = await makeUser({ funded: 1100 });
    await purchase(u.id, (await plan('1100')).id);
    const monday = new Date(Date.UTC(2026, 7, 17));
    await runDailyRoi(monday);

    for (let i = 0; i < 3; i += 1) await sendEarningsDigest(monday);

    const { rows } = await service.list('USER', u.id);
    expect(rows.filter((r) => r.type === 'earnings.daily')).toHaveLength(1);
  });

  it('says nothing on a day with no earnings', async () => {
    const u = await makeUser({ funded: 1100 });
    await purchase(u.id, (await plan('1100')).id);

    const result = await sendEarningsDigest(new Date(Date.UTC(2026, 7, 22)));   // Saturday

    expect(result.notified).toBe(0);
  });
});

describe('the HTTP surface', () => {
  it('serves a member their own bell', async () => {
    const u = await makeUser();
    await notify(u.id);

    const res = await request(app).get('/api/v1/notifications')
      .set('Authorization', await auth(u.id));

    expect(res.status).toBe(200);
    expect(res.body.data.rows).toHaveLength(1);
  });

  it('serves the unread count', async () => {
    const u = await makeUser();
    await notify(u.id, { dedupeKey: 'x' });
    await notify(u.id, { dedupeKey: 'y' });

    const res = await request(app).get('/api/v1/notifications/summary')
      .set('Authorization', await auth(u.id));

    expect(res.body.data.unread).toBe(2);
  });

  it('marks all read over HTTP', async () => {
    const u = await makeUser();
    await notify(u.id, { dedupeKey: 'x' });
    await notify(u.id, { dedupeKey: 'y' });

    const res = await request(app).post('/api/v1/notifications/read-all')
      .set('Authorization', await auth(u.id)).send({});

    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(2);
  });

  it('needs authentication', async () => {
    expect((await request(app).get('/api/v1/notifications')).status).toBe(401);
  });

  it('filters by category', async () => {
    const u = await makeUser();
    await notify(u.id);
    await deliverMember({
      userId: u.id, type: 'security.password_changed',
      title: 'Password changed', body: 'All devices signed out.',
    });

    const res = await request(app).get('/api/v1/notifications?category=SECURITY')
      .set('Authorization', await auth(u.id));

    expect(res.body.data.rows).toHaveLength(1);
    expect(res.body.data.rows[0].category).toBe('SECURITY');
  });
});
