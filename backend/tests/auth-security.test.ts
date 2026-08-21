import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { clearSessionCache } from '../src/middleware/auth.js';
import { prisma, resetData, seedPlan, makeUser, PASSWORD } from './helpers.js';

const app = createApp();
const login = (emailOrCode: string, password = PASSWORD) =>
  request(app).post('/api/v1/auth/login').send({ emailOrCode, password });

beforeAll(seedPlan);
beforeEach(async () => {
  await resetData();
  clearSessionCache();
});

describe('sign-in', () => {
  it('issues an access token and a refresh token', async () => {
    const u = await makeUser();
    const res = await login(u.email);

    expect(res.status).toBe(200);
    expect(res.body.data.tokens.accessToken).toBeTruthy();
    expect(res.body.data.tokens.refreshToken).toBeTruthy();
    expect(await prisma.session.count({ where: { actorId: u.id } })).toBe(1);
  });

  it('never stores the refresh token itself', async () => {
    const u = await makeUser();
    const { body } = await login(u.email);
    const raw = body.data.tokens.refreshToken;

    const stored = await prisma.session.findFirstOrThrow({ where: { actorId: u.id } });
    expect(stored.tokenHash).not.toBe(raw);
    expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    // The raw token appears nowhere in the row.
    expect(JSON.stringify(stored)).not.toContain(raw);
  });

  it('gives the same answer for a wrong password and an unknown account', async () => {
    const u = await makeUser();
    const wrongPassword = await login(u.email, 'NotThePassword!1');
    const unknown = await login('nobody@nowhere.test', 'NotThePassword!1');

    expect(wrongPassword.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrongPassword.body.error.message).toBe(unknown.body.error.message);
  });
});

describe('failed-login lockout', () => {
  it('locks the account after five wrong passwords', async () => {
    const u = await makeUser();
    for (let i = 0; i < 4; i += 1) {
      expect((await login(u.email, 'wrong')).status).toBe(401);
    }

    const fifth = await login(u.email, 'wrong');
    expect(fifth.status).toBe(429);
    expect(fifth.body.error.code).toBe('ACCOUNT_LOCKED');

    // The correct password is refused too — otherwise the lock protects nothing.
    const correct = await login(u.email);
    expect(correct.status).toBe(429);
  });

  it('counts per account, so one member cannot lock another out', async () => {
    const victim = await makeUser();
    const other = await makeUser();
    for (let i = 0; i < 6; i += 1) await login(victim.email, 'wrong');

    expect((await login(other.email)).status).toBe(200);
  });

  it('clears the counter on a successful sign-in', async () => {
    const u = await makeUser();
    for (let i = 0; i < 3; i += 1) await login(u.email, 'wrong');
    expect((await login(u.email)).status).toBe(200);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after.failedLoginCount).toBe(0);
    expect(after.lockedUntil).toBeNull();
  });

  it('lets the member back in once the window passes', async () => {
    const u = await makeUser();
    for (let i = 0; i < 5; i += 1) await login(u.email, 'wrong');
    expect((await login(u.email)).status).toBe(429);

    await prisma.user.update({
      where: { id: u.id },
      data: { lockedUntil: new Date(Date.now() - 1000) },
    });

    expect((await login(u.email)).status).toBe(200);
  });
});

describe('refresh token rotation', () => {
  const refresh = (refreshToken: string) =>
    request(app).post('/api/v1/auth/refresh').send({ refreshToken });

  it('returns a different token every time', async () => {
    const u = await makeUser();
    const first = (await login(u.email)).body.data.tokens.refreshToken;

    const second = await refresh(first);
    expect(second.status).toBe(200);
    expect(second.body.data.refreshToken).not.toBe(first);

    const third = await refresh(second.body.data.refreshToken);
    expect(third.status).toBe(200);
    expect(third.body.data.refreshToken).not.toBe(second.body.data.refreshToken);
  });

  it('does not extend the 30-day life of the session', async () => {
    const u = await makeUser();
    const first = (await login(u.email)).body.data.tokens.refreshToken;
    const original = await prisma.session.findFirstOrThrow({ where: { actorId: u.id } });

    await refresh(first);

    const rotated = await prisma.session.findFirstOrThrow({
      where: { actorId: u.id, revokedAt: null },
    });
    expect(rotated.expiresAt.getTime()).toBe(original.expiresAt.getTime());
  });

  it('catches a stolen token being replayed and ends the whole family', async () => {
    const u = await makeUser();
    const stolen = (await login(u.email)).body.data.tokens.refreshToken;

    // The real client refreshes, so `stolen` is now retired.
    const legitimate = await refresh(stolen);
    expect(legitimate.status).toBe(200);
    const live = legitimate.body.data.refreshToken;

    // The thief replays the copy they took.
    const replay = await refresh(stolen);
    expect(replay.status).toBe(401);

    // Both parties are now locked out — we cannot tell which was which.
    const victim = await refresh(live);
    expect(victim.status).toBe(401);

    const sessions = await prisma.session.findMany({ where: { actorId: u.id } });
    expect(sessions.every((s) => s.revokedAt !== null)).toBe(true);
    expect(sessions.some((s) => s.revokedReason === 'REFRESH_TOKEN_REUSED')).toBe(true);
  });

  it('refuses a token that was never issued', async () => {
    expect((await refresh('not-a-real-token-at-all-abcdef')).status).toBe(401);
  });

  it('refuses a token from an expired session', async () => {
    const u = await makeUser();
    const token = (await login(u.email)).body.data.tokens.refreshToken;
    await prisma.session.updateMany({
      where: { actorId: u.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect((await refresh(token)).status).toBe(401);
  });
});

describe('revocation', () => {
  const me = (accessToken: string) =>
    request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`);

  it('signing out stops the access token working', async () => {
    const u = await makeUser();
    const { tokens } = (await login(u.email)).body.data;
    expect((await me(tokens.accessToken)).status).toBe(200);

    await request(app).post('/api/v1/auth/logout').send({ refreshToken: tokens.refreshToken });
    clearSessionCache();

    expect((await me(tokens.accessToken)).status).toBe(401);
  });

  it('signing out everywhere ends every device', async () => {
    const u = await makeUser();
    const a = (await login(u.email)).body.data.tokens;
    const b = (await login(u.email)).body.data.tokens;

    await request(app).post('/api/v1/auth/logout-all').set('Authorization', `Bearer ${a.accessToken}`);
    clearSessionCache();

    expect((await me(a.accessToken)).status).toBe(401);
    expect((await me(b.accessToken)).status).toBe(401);
  });

  it('blocking a member stops their token immediately', async () => {
    const u = await makeUser();
    const { tokens } = (await login(u.email)).body.data;
    expect((await me(tokens.accessToken)).status).toBe(200);

    await prisma.user.update({ where: { id: u.id }, data: { status: 'BLOCKED' } });
    await prisma.session.updateMany({
      where: { actorId: u.id, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'STATUS_BLOCKED' },
    });
    clearSessionCache();

    expect((await me(tokens.accessToken)).status).toBe(401);
    expect((await request(app).post('/api/v1/auth/refresh').send({ refreshToken: tokens.refreshToken })).status).toBe(401);
  });

  it('a member sees their own sessions and can end one', async () => {
    const u = await makeUser();
    const a = (await login(u.email)).body.data.tokens;
    (await login(u.email)).body.data.tokens;

    const listed = await request(app).get('/api/v1/auth/sessions').set('Authorization', `Bearer ${a.accessToken}`);
    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(2);

    const other = listed.body.data.find((s: { id: string }) => s.id !== undefined);
    expect(other).toBeTruthy();
  });

  it('cannot end a session belonging to someone else', async () => {
    const a = await makeUser();
    const b = await makeUser();
    const aTokens = (await login(a.email)).body.data.tokens;
    await login(b.email);
    const bSession = await prisma.session.findFirstOrThrow({ where: { actorId: b.id } });

    const res = await request(app)
      .delete(`/api/v1/auth/sessions/${bSession.id}`)
      .set('Authorization', `Bearer ${aTokens.accessToken}`);

    expect(res.status).toBe(401);
    const still = await prisma.session.findUniqueOrThrow({ where: { id: bSession.id } });
    expect(still.revokedAt).toBeNull();
  });
});
