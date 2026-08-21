import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { clearSessionCache } from '../src/middleware/auth.js';
import { invalidateConfig } from '../src/core/runtime-config.js';
import { request as requestWithdrawal } from '../src/modules/withdrawal/withdrawal.service.js';
import { update as updateProfile } from '../src/modules/customer/customer.service.js';
import { prisma, resetData, seedPlan, makeUser, PASSWORD, accessTokenFor } from './helpers.js';

const app = createApp();
const ADDR = '0x1234567890abcdef1234567890abcdef12345678';
const ALT_ADDR = '0xfedcba9876543210fedcba9876543210fedcba98';

const approveKyc = (userId: string) =>
  prisma.kycSubmission.create({
    data: { userId, fullName: 'A Member', documentNo: 'X1', countryCode: 'IN', status: 'APPROVED' },
  });

const fundMain = (userId: string, amount: number) =>
  prisma.$executeRaw`UPDATE wallet_accounts SET balance = ${amount}::numeric WHERE "userId" = ${userId} AND type = 'MAIN'`;

beforeAll(seedPlan);
beforeEach(async () => {
  await resetData();
  clearSessionCache();
  await prisma.setting.deleteMany({});
  invalidateConfig();
});

describe('identity verification gate', () => {
  it('refuses a withdrawal from an unverified member', async () => {
    const u = await makeUser();
    await fundMain(u.id, 500);

    await expect(requestWithdrawal(u.id, '100', ADDR)).rejects.toThrow(/Verify your identity/);
    expect(await prisma.withdrawal.count()).toBe(0);
  });

  it('says so differently while a submission is under review', async () => {
    const u = await makeUser();
    await fundMain(u.id, 500);
    await prisma.kycSubmission.create({
      data: { userId: u.id, fullName: 'A Member', documentNo: 'X1', countryCode: 'IN', status: 'PENDING' },
    });

    await expect(requestWithdrawal(u.id, '100', ADDR)).rejects.toThrow(/still under review/);
  });

  it('lets a verified member through', async () => {
    const u = await makeUser();
    await fundMain(u.id, 500);
    await approveKyc(u.id);

    const w = await requestWithdrawal(u.id, '100', ADDR);
    expect(Number(w.netAmount)).toBeCloseTo(95, 6);
  });

  it('does not block a rejected member from resubmitting and then withdrawing', async () => {
    const u = await makeUser();
    await fundMain(u.id, 500);
    await prisma.kycSubmission.create({
      data: { userId: u.id, fullName: 'A', documentNo: 'X', countryCode: 'IN', status: 'REJECTED', rejectionReason: 'blurry' },
    });
    await expect(requestWithdrawal(u.id, '100', ADDR)).rejects.toThrow(/Verify your identity/);

    await approveKyc(u.id);
    await expect(requestWithdrawal(u.id, '100', ADDR)).resolves.toBeTruthy();
  });

  it('honours the operator threshold — small payouts skip verification', async () => {
    await prisma.setting.create({ data: { key: 'KYC_REQUIRED_ABOVE', value: '100' } });
    invalidateConfig();

    const u = await makeUser();
    await fundMain(u.id, 500);

    await expect(requestWithdrawal(u.id, '100', ADDR)).resolves.toBeTruthy();     // at the threshold
    await expect(requestWithdrawal(u.id, '101', ADDR)).rejects.toThrow(/Verify your identity/);
  });

  it('can be switched off entirely by the operator', async () => {
    await prisma.setting.create({ data: { key: 'KYC_REQUIRED_FOR_WITHDRAWAL', value: 'false' } });
    invalidateConfig();

    const u = await makeUser();
    await fundMain(u.id, 2000);
    await expect(requestWithdrawal(u.id, '1000', ADDR)).resolves.toBeTruthy();
  });
});

describe('member activity trail', () => {
  const login = (email: string) =>
    request(app).post('/api/v1/auth/login').send({ emailOrCode: email, password: PASSWORD });

  const trail = async (userId: string) => {
    // The trail is written best-effort and off the request path, so give the
    // insert a moment to land before reading it.
    await new Promise((r) => setTimeout(r, 120));
    return prisma.activityLog.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  };

  it('records a sign-in and a failed attempt differently', async () => {
    const u = await makeUser();
    await login(u.email);
    await request(app).post('/api/v1/auth/login').send({ emailOrCode: u.email, password: 'wrong' });

    const rows = await trail(u.id);
    expect(rows.map((r) => r.event)).toEqual(['SIGNED_IN', 'SIGN_IN_FAILED']);
  });

  it('records a payout address change with both the old and new value', async () => {
    const u = await makeUser();
    await updateProfile(u.id, { walletAddress: ADDR });
    await updateProfile(u.id, { walletAddress: ALT_ADDR });

    const rows = (await trail(u.id)).filter((r) => r.event === 'PAYOUT_ADDRESS_CHANGED');
    expect(rows).toHaveLength(2);
    expect(rows[1]!.summary).toContain('0x1234…5678');
    expect(rows[1]!.summary).toContain('0xfedc…ba98');
    expect(rows[1]!.meta).toMatchObject({ from: ADDR, to: ALT_ADDR });
  });

  it('never records a full payout address in the human-readable line', async () => {
    const u = await makeUser();
    await updateProfile(u.id, { walletAddress: ADDR });

    const rows = await trail(u.id);
    expect(rows.every((r) => !r.summary.includes(ADDR))).toBe(true);
  });

  it('refuses a payout address that is not a BEP-20 address', async () => {
    const u = await makeUser();
    await expect(updateProfile(u.id, { walletAddress: 'my-wallet' })).rejects.toThrow(/BEP-20/);
  });

  it('marks an operator action as an operator action', async () => {
    const u = await makeUser();
    const admin = await prisma.adminUser.findFirst();
    await prisma.activityLog.create({
      data: {
        userId: u.id, event: 'BALANCE_ADJUSTED', actorAdminId: admin?.id ?? 'admin-1',
        summary: 'An operator credited $10 to your main wallet — goodwill',
      },
    });

    const token = await accessTokenFor(u.id);
    const res = await request(app).get('/api/v1/auth/activity').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.rows[0].byOperator).toBe(true);
    // The operator's identity is not the member's business.
    expect(res.body.data.rows[0].actorAdminId).toBeUndefined();
  });

  it('shows a member only their own trail', async () => {
    const a = await makeUser();
    const b = await makeUser();
    await login(a.email);
    await login(b.email);

    const token = await accessTokenFor(a.id);
    const res = await request(app).get('/api/v1/auth/activity').set('Authorization', `Bearer ${token}`);

    const userIds = await prisma.activityLog.findMany({ where: { userId: b.id } });
    expect(userIds.length).toBeGreaterThan(0);        // b has activity
    expect(res.body.data.total).toBe(await prisma.activityLog.count({ where: { userId: a.id } }));
  });

  it('records a withdrawal request and the operator decision on it', async () => {
    const u = await makeUser();
    await fundMain(u.id, 500);
    await approveKyc(u.id);
    await requestWithdrawal(u.id, '100', ADDR);

    const rows = (await trail(u.id)).map((r) => r.event);
    expect(rows).toContain('WITHDRAWAL_REQUESTED');
  });
});
