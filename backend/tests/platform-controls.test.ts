import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { clearSessionCache } from '../src/middleware/auth.js';
import { invalidateConfig } from '../src/core/runtime-config.js';
import { issue } from '../src/core/sessions.js';
import * as impersonation from '../src/modules/admin/impersonation/impersonation.service.js';
import * as announcements from '../src/modules/announcement/announcement.service.js';
import * as notifications from '../src/modules/notification/notification.service.js';
import { prisma, resetData, seedPlan, makeUser, verifyKyc, accessTokenFor } from './helpers.js';

const app = createApp();
const ADDR = '0x1234567890abcdef1234567890abcdef12345678';

async function makeAdmin() {
  const role = await prisma.adminRole.findFirstOrThrow({ where: { slug: 'super-admin' } });
  return prisma.adminUser.create({
    data: {
      email: `op-${Date.now()}-${Math.round(performance.now() * 1000)}@test.local`,
      passwordHash: 'x', name: 'Operator', roleId: role.id,
    },
  });
}

const fund = (userId: string, amount: number) =>
  prisma.$executeRaw`UPDATE wallet_accounts SET balance = ${amount}::numeric WHERE "userId" = ${userId} AND type = 'MAIN'`;

beforeAll(seedPlan);
beforeEach(async () => {
  await resetData();
  clearSessionCache();
  await prisma.setting.deleteMany({});
  invalidateConfig();
});

describe('support view (impersonation)', () => {
  it('needs a reason', async () => {
    const admin = await makeAdmin();
    const u = await makeUser();
    await expect(impersonation.start(admin.id, u.id, 'x')).rejects.toThrow(/reason/i);
  });

  it('can read the member account', async () => {
    const admin = await makeAdmin();
    const u = await makeUser();
    const s = await impersonation.start(admin.id, u.id, 'Member reports a missing deposit');

    const res = await request(app).get('/api/v1/wallet').set('Authorization', `Bearer ${s.accessToken}`);
    expect(res.status).toBe(200);
  });

  it('cannot move money — the whole point of it', async () => {
    const admin = await makeAdmin();
    const u = await makeUser();
    await verifyKyc(u.id);
    await fund(u.id, 500);
    const s = await impersonation.start(admin.id, u.id, 'Member reports a missing deposit');

    const res = await request(app)
      .post('/api/v1/withdrawals')
      .set('Authorization', `Bearer ${s.accessToken}`)
      .set('Idempotency-Key', 'a'.repeat(20))
      .send({ amount: '100', walletAddress: ADDR });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('READ_ONLY_SESSION');
    expect(await prisma.withdrawal.count()).toBe(0);
  });

  it('cannot change the payout address either', async () => {
    const admin = await makeAdmin();
    const u = await makeUser();
    const s = await impersonation.start(admin.id, u.id, 'Looking into a profile problem');

    const res = await request(app)
      .patch('/api/v1/customer/profile')
      .set('Authorization', `Bearer ${s.accessToken}`)
      .send({ walletAddress: ADDR });

    expect(res.status).toBe(403);
  });

  it('a normal member session is unaffected', async () => {
    const u = await makeUser();
    await verifyKyc(u.id);
    await fund(u.id, 500);
    const token = await accessTokenFor(u.id);

    const res = await request(app)
      .post('/api/v1/withdrawals')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'b'.repeat(20))
      .send({ amount: '100', walletAddress: ADDR });

    expect(res.status).toBe(201);
  });

  it('tells the member it happened', async () => {
    const admin = await makeAdmin();
    const u = await makeUser();
    await impersonation.start(admin.id, u.id, 'Investigating a missing payout');
    await new Promise((r) => setTimeout(r, 150));

    const rows = await prisma.activityLog.findMany({ where: { userId: u.id } });
    const entry = rows.find((r) => r.summary.includes('support operator'));
    expect(entry).toBeTruthy();
    expect(entry!.actorAdminId).toBe(admin.id);
  });

  it('expires in minutes, not days', async () => {
    const admin = await makeAdmin();
    const u = await makeUser();
    await impersonation.start(admin.id, u.id, 'Investigating a missing payout');

    const session = await prisma.session.findFirstOrThrow({ where: { actorId: u.id } });
    const minutes = (session.expiresAt.getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(25);
    expect(minutes).toBeLessThan(35);
    expect(session.impersonatedBy).toBe(admin.id);
  });

  it('stays read-only after the token rotates', async () => {
    const admin = await makeAdmin();
    const u = await makeUser();
    const s = await impersonation.start(admin.id, u.id, 'Investigating a missing payout');

    const rotated = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: s.refreshToken });
    expect(rotated.status).toBe(200);
    clearSessionCache();

    const res = await request(app)
      .patch('/api/v1/customer/profile')
      .set('Authorization', `Bearer ${rotated.body.data.accessToken}`)
      .send({ firstName: 'Renamed' });

    expect(res.status).toBe(403);
  });
});

describe('maintenance mode', () => {
  const on = async () => {
    await prisma.setting.create({ data: { key: 'MAINTENANCE_MODE', value: 'true' } });
    invalidateConfig();
  };

  it('lets members keep reading', async () => {
    await on();
    const u = await makeUser();
    const token = await accessTokenFor(u.id);
    const res = await request(app).get('/api/v1/wallet').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('stops members changing anything', async () => {
    await on();
    const u = await makeUser();
    const token = await accessTokenFor(u.id);

    const res = await request(app)
      .patch('/api/v1/customer/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Nope' });

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('MAINTENANCE_MODE');
  });

  it('never locks operators out — they are how it ends', async () => {
    await on();
    const admin = await makeAdmin();
    const { accessToken } = await issue('ADMIN', admin.id);

    const res = await request(app).get('/api/v1/admin/users').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
  });

  it('still lets a member sign out', async () => {
    await on();
    const u = await makeUser();
    const { refreshToken } = await issue('USER', u.id);
    const res = await request(app).post('/api/v1/auth/logout').send({ refreshToken });
    expect(res.status).toBe(200);
  });
});

describe('announcements', () => {
  it('is a draft until someone sends it', async () => {
    const admin = await makeAdmin();
    const u = await makeUser();
    const draft = await announcements.upsert(admin.id, {
      title: 'Scheduled maintenance',
      body: 'We will be down for an hour on Sunday morning.',
    });

    expect(draft.status).toBe('DRAFT');
    expect((await notifications.list('USER', u.id)).rows).toHaveLength(0);
  });

  it('reaches every active member when published', async () => {
    const admin = await makeAdmin();
    const a = await makeUser();
    const b = await makeUser();
    const draft = await announcements.upsert(admin.id, {
      title: 'New package tier',
      body: 'A new investment tier is available from today.',
    });

    const published = await announcements.publish(admin.id, draft.id);

    expect(published.deliveredTo).toBe(2);
    expect((await notifications.list('USER', a.id)).rows[0]?.title).toBe('New package tier');
    expect((await notifications.list('USER', b.id)).rows[0]?.title).toBe('New package tier');
  });

  it('cannot be sent twice', async () => {
    const admin = await makeAdmin();
    await makeUser();
    const draft = await announcements.upsert(admin.id, {
      title: 'Notice', body: 'Something worth saying once.',
    });

    await announcements.publish(admin.id, draft.id);
    await expect(announcements.publish(admin.id, draft.id)).rejects.toThrow(/already been sent/);
  });

  it('cannot be edited once sent', async () => {
    const admin = await makeAdmin();
    await makeUser();
    const draft = await announcements.upsert(admin.id, {
      title: 'Notice', body: 'Something worth saying once.',
    });
    await announcements.publish(admin.id, draft.id);

    await expect(
      announcements.upsert(admin.id, { id: draft.id, title: 'Rewritten', body: 'Different message entirely.' }),
    ).rejects.toThrow(/already been sent/);
  });

  it('honours the audience filter', async () => {
    const admin = await makeAdmin();
    const invested = await makeUser({ funded: 1100 });
    const browsing = await makeUser();
    const plan = await prisma.packagePlan.findFirstOrThrow({ where: { amount: '1100' } });
    const { purchase } = await import('../src/modules/investment/investment.service.js');
    await purchase(invested.id, plan.id);

    const draft = await announcements.upsert(admin.id, {
      title: 'For investors', body: 'A note for members who hold a package.', audience: 'INVESTED',
    });
    await announcements.publish(admin.id, draft.id);

    expect((await notifications.list('USER', invested.id)).rows.some((r) => r.title === 'For investors')).toBe(true);
    expect((await notifications.list('USER', browsing.id)).rows.some((r) => r.title === 'For investors')).toBe(false);
  });

  it('refuses to send to nobody', async () => {
    const admin = await makeAdmin();
    const draft = await announcements.upsert(admin.id, {
      title: 'Into the void', body: 'There are no members to receive this.',
    });
    await expect(announcements.publish(admin.id, draft.id)).rejects.toThrow(/reach nobody/);
  });

  it('shows a pinned banner until the member dismisses it', async () => {
    const admin = await makeAdmin();
    const u = await makeUser();
    const draft = await announcements.upsert(admin.id, {
      title: 'Read me', body: 'A pinned notice at the top of the app.', pinned: true,
    });
    const published = await announcements.publish(admin.id, draft.id);

    expect(await announcements.bannersFor(u.id)).toHaveLength(1);
    await announcements.dismiss(u.id, published.id);
    expect(await announcements.bannersFor(u.id)).toHaveLength(0);
  });

  it('one member dismissing it does not dismiss it for everyone', async () => {
    const admin = await makeAdmin();
    const a = await makeUser();
    const b = await makeUser();
    const draft = await announcements.upsert(admin.id, {
      title: 'Read me', body: 'A pinned notice at the top of the app.', pinned: true,
    });
    const published = await announcements.publish(admin.id, draft.id);

    await announcements.dismiss(a.id, published.id);

    expect(await announcements.bannersFor(a.id)).toHaveLength(0);
    expect(await announcements.bannersFor(b.id)).toHaveLength(1);
  });
});
