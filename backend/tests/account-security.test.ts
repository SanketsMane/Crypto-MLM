import request from 'supertest';
import { generateSync } from 'otplib';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { clearSessionCache } from '../src/middleware/auth.js';
import { decrypt } from '../src/core/crypto.js';
import * as otp from '../src/core/otp.js';
import { prisma, resetData, seedPlan, makeUser, PASSWORD, accessTokenFor } from './helpers.js';

const app = createApp();
const api = (path: string) => request(app).post(`/api/v1${path}`);

const auth = async (userId: string) => `Bearer ${await accessTokenFor(userId)}`;

/** The code as the member would read it out of their email. */
const codeFor = async (email: string, purpose: string) => {
  const row = await prisma.otpChallenge.findFirstOrThrow({
    where: { email: email.toLowerCase(), purpose: purpose as never },
    orderBy: { createdAt: 'desc' },
  });
  // Codes are stored hashed, so the suite brute-forces the six digits rather
  // than reaching for a back door the product does not have.
  for (let i = 0; i < 1_000_000; i += 1) {
    const guess = String(i).padStart(6, '0');
    if (row.codeHash === (await import('../src/core/crypto.js')).sha256(guess)) {
      return { challengeId: row.challengeId, code: guess };
    }
  }
  throw new Error('code not recoverable');
};

beforeAll(seedPlan);
beforeEach(async () => {
  await resetData();
  clearSessionCache();
});

describe('one-time codes', () => {
  it('stores only a hash, never the code', async () => {
    const u = await makeUser();
    const { code } = await otp.issue({ purpose: 'PASSWORD_RESET', email: u.email, userId: u.id });

    const row = await prisma.otpChallenge.findFirstOrThrow({ where: { userId: u.id } });
    expect(row.codeHash).not.toBe(code);
    expect(JSON.stringify(row)).not.toContain(code);
  });

  it('accepts the right code exactly once', async () => {
    const u = await makeUser();
    const { challengeId, code } = await otp.issue({ purpose: 'PASSWORD_RESET', email: u.email, userId: u.id });

    await expect(otp.verify({ purpose: 'PASSWORD_RESET', challengeId, code })).resolves.toMatchObject({ userId: u.id });
    await expect(otp.verify({ purpose: 'PASSWORD_RESET', challengeId, code })).rejects.toThrow(/not valid/);
  });

  it('burns the challenge after five wrong guesses', async () => {
    const u = await makeUser();
    const { challengeId, code } = await otp.issue({ purpose: 'PASSWORD_RESET', email: u.email, userId: u.id });
    const wrong = code === '000000' ? '111111' : '000000';

    for (let i = 0; i < 4; i += 1) {
      await expect(otp.verify({ purpose: 'PASSWORD_RESET', challengeId, code: wrong })).rejects.toThrow(/not correct/);
    }
    await expect(otp.verify({ purpose: 'PASSWORD_RESET', challengeId, code: wrong })).rejects.toThrow(/Too many/);

    // Even the correct code is dead now — otherwise five guesses cost nothing.
    await expect(otp.verify({ purpose: 'PASSWORD_RESET', challengeId, code })).rejects.toThrow();
  });

  it('will not let a code from one flow be used in another', async () => {
    const u = await makeUser();
    const { challengeId, code } = await otp.issue({ purpose: 'PASSWORD_RESET', email: u.email, userId: u.id });

    await expect(
      otp.verify({ purpose: 'WITHDRAWAL_CONFIRMATION', challengeId, code }),
    ).rejects.toThrow(/not valid/);
  });

  it('rejects an expired code', async () => {
    const u = await makeUser();
    const { challengeId, code } = await otp.issue({ purpose: 'PASSWORD_RESET', email: u.email, userId: u.id });
    await prisma.otpChallenge.updateMany({
      where: { challengeId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(otp.verify({ purpose: 'PASSWORD_RESET', challengeId, code })).rejects.toThrow(/not valid/);
  });

  it('refuses to be used to flood an inbox', async () => {
    const u = await makeUser();
    await otp.issue({ purpose: 'PASSWORD_RESET', email: u.email, userId: u.id });

    // A second request straight away is a cooldown, not a send.
    await expect(
      otp.issue({ purpose: 'PASSWORD_RESET', email: u.email, userId: u.id }),
    ).rejects.toThrow(/wait/i);
  });

  it('invalidates the previous code when a new one is issued', async () => {
    const u = await makeUser();
    const first = await otp.issue({ purpose: 'PASSWORD_RESET', email: u.email, userId: u.id });

    await prisma.otpChallenge.updateMany({
      where: { challengeId: first.challengeId },
      data: { createdAt: new Date(Date.now() - 120_000) },
    });
    await otp.issue({ purpose: 'PASSWORD_RESET', email: u.email, userId: u.id });

    await expect(
      otp.verify({ purpose: 'PASSWORD_RESET', challengeId: first.challengeId, code: first.code }),
    ).rejects.toThrow(/not valid/);
  });
});

describe('password reset', () => {
  it('gives the same answer whether or not the account exists', async () => {
    const u = await makeUser();
    const real = await api('/auth/forgot-password').send({ email: u.email });
    const fake = await api('/auth/forgot-password').send({ email: 'nobody@nowhere.test' });

    expect(real.status).toBe(200);
    expect(fake.status).toBe(200);
    expect(Object.keys(real.body.data).sort()).toEqual(Object.keys(fake.body.data).sort());
    expect(real.body.data.sent).toBe(fake.body.data.sent);
  });

  it('resets the password and signs every device out', async () => {
    const u = await makeUser();
    const before = await request(app).post('/api/v1/auth/login').send({ emailOrCode: u.email, password: PASSWORD });
    expect(before.status).toBe(200);

    await api('/auth/forgot-password').send({ email: u.email });
    const { challengeId, code } = await codeFor(u.email, 'PASSWORD_RESET');

    const reset = await api('/auth/reset-password').send({ challengeId, code, newPassword: 'BrandNew1Pass' });
    expect(reset.status).toBe(200);

    clearSessionCache();
    const old = await request(app).get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${before.body.data.tokens.accessToken}`);
    expect(old.status).toBe(401);

    const fresh = await request(app).post('/api/v1/auth/login')
      .send({ emailOrCode: u.email, password: 'BrandNew1Pass' });
    expect(fresh.status).toBe(200);
  });

  it('refuses a weak new password', async () => {
    const u = await makeUser();
    await api('/auth/forgot-password').send({ email: u.email });
    const { challengeId, code } = await codeFor(u.email, 'PASSWORD_RESET');

    // Long enough to clear the schema, but no uppercase and no digit.
    const res = await api('/auth/reset-password').send({ challengeId, code, newPassword: 'alllowercase' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/uppercase/);

    // And too short is refused by the schema before it gets that far.
    const short = await api('/auth/reset-password').send({ challengeId, code, newPassword: 'Ab1' });
    expect(short.status).toBe(422);
  });

  it('clears a lockout, so a locked-out member can recover', async () => {
    const u = await makeUser();
    for (let i = 0; i < 5; i += 1) {
      await request(app).post('/api/v1/auth/login').send({ emailOrCode: u.email, password: 'wrong' });
    }
    expect((await request(app).post('/api/v1/auth/login').send({ emailOrCode: u.email, password: PASSWORD })).status).toBe(429);

    await api('/auth/forgot-password').send({ email: u.email });
    const { challengeId, code } = await codeFor(u.email, 'PASSWORD_RESET');
    await api('/auth/reset-password').send({ challengeId, code, newPassword: 'BrandNew1Pass' });

    const res = await request(app).post('/api/v1/auth/login').send({ emailOrCode: u.email, password: 'BrandNew1Pass' });
    expect(res.status).toBe(200);
  });
});

describe('changing a password while signed in', () => {
  it('requires the current password', async () => {
    const u = await makeUser();
    const res = await api('/auth/change-password')
      .set('Authorization', await auth(u.id))
      .send({ currentPassword: 'not-it', newPassword: 'BrandNew1Pass' });

    expect(res.status).toBe(401);
  });

  it('refuses reusing the same password', async () => {
    const u = await makeUser();
    const res = await api('/auth/change-password')
      .set('Authorization', await auth(u.id))
      .send({ currentPassword: PASSWORD, newPassword: PASSWORD });

    expect(res.status).toBe(400);
  });
});

describe('email verification', () => {
  it('verifies with the emailed code', async () => {
    const u = await makeUser();
    const token = await auth(u.id);

    const sent = await api('/auth/verify-email/send').set('Authorization', token);
    expect(sent.status).toBe(200);

    const { challengeId, code } = await codeFor(u.email, 'EMAIL_VERIFICATION');
    const confirmed = await api('/auth/verify-email/confirm')
      .set('Authorization', token).send({ challengeId, code });

    expect(confirmed.status).toBe(200);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after.emailVerifiedAt).not.toBeNull();
  });

  it('will not let one member verify with another member code', async () => {
    const a = await makeUser();
    const b = await makeUser();
    await api('/auth/verify-email/send').set('Authorization', await auth(a.id));
    const { challengeId, code } = await codeFor(a.email, 'EMAIL_VERIFICATION');

    const res = await api('/auth/verify-email/confirm')
      .set('Authorization', await auth(b.id)).send({ challengeId, code });

    expect(res.status).toBe(401);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: b.id } });
    expect(after.emailVerifiedAt).toBeNull();
  });

  it('records the delivery attempt so support can answer "was it sent?"', async () => {
    const u = await makeUser();
    await api('/auth/verify-email/send').set('Authorization', await auth(u.id));

    const log = await prisma.emailLog.findFirstOrThrow({ where: { to: u.email } });
    expect(log.template).toBe('verify-email');
    expect(log.status).toBe('SENT');
    // The code itself is never in the log row.
    expect(log.subject).toMatch(/verification code$/);
  });
});

describe('two-factor authentication', () => {
  const totp = async (userId: string) => {
    const row = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return generateSync({ secret: decrypt(row.twoFactorSecret!) });
  };

  const enrol = async (userId: string) => {
    const token = await auth(userId);
    await api('/auth/2fa/begin').set('Authorization', token).send({ password: PASSWORD });
    const res = await api('/auth/2fa/confirm').set('Authorization', token).send({ code: await totp(userId) });
    return res;
  };

  it('needs the password to start enrolment', async () => {
    const u = await makeUser();
    const res = await api('/auth/2fa/begin').set('Authorization', await auth(u.id)).send({ password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('is not on until a code proves the app works', async () => {
    const u = await makeUser();
    await api('/auth/2fa/begin').set('Authorization', await auth(u.id)).send({ password: PASSWORD });

    const mid = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(mid.twoFactorSecret).not.toBeNull();
    expect(mid.twoFactorEnabledAt).toBeNull();     // stored, but not enabled

    const res = await api('/auth/2fa/confirm').set('Authorization', await auth(u.id)).send({ code: '000000' });
    expect(res.status).toBe(400);

    const still = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(still.twoFactorEnabledAt).toBeNull();
  });

  it('never stores the seed in plaintext', async () => {
    const u = await makeUser();
    const begin = await api('/auth/2fa/begin').set('Authorization', await auth(u.id)).send({ password: PASSWORD });
    const plaintext = begin.body.data.secret as string;

    const row = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(row.twoFactorSecret).not.toBe(plaintext);
    expect(row.twoFactorSecret).toMatch(/^v1\./);
    expect(decrypt(row.twoFactorSecret!)).toBe(plaintext);   // but we can read it back
  });

  it('hands out ten single-use recovery codes on enrolment', async () => {
    const u = await makeUser();
    const res = await enrol(u.id);

    expect(res.status).toBe(200);
    expect(res.body.data.recoveryCodes).toHaveLength(10);
    expect(res.body.data.recoveryCodes[0]).toMatch(/^\d{5}-\d{5}$/);

    // Stored hashed — a leak of this table hands over nothing usable.
    const stored = await prisma.twoFactorRecoveryCode.findMany({ where: { userId: u.id } });
    expect(stored).toHaveLength(10);
    expect(stored.every((c) => !res.body.data.recoveryCodes.includes(c.codeHash))).toBe(true);
  });

  it('stops sign-in at the password when it is on', async () => {
    const u = await makeUser();
    await enrol(u.id);

    const res = await request(app).post('/api/v1/auth/login').send({ emailOrCode: u.email, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.twoFactorRequired).toBe(true);
    expect(res.body.data.tokens).toBeNull();          // no session yet
    expect(res.body.data.challengeToken).toBeTruthy();
  });

  it('completes sign-in with a valid code', async () => {
    const u = await makeUser();
    await enrol(u.id);
    const first = await request(app).post('/api/v1/auth/login').send({ emailOrCode: u.email, password: PASSWORD });

    const res = await api('/auth/2fa/challenge')
      .send({ challengeToken: first.body.data.challengeToken, code: await totp(u.id) });

    expect(res.status).toBe(200);
    expect(res.body.data.tokens.accessToken).toBeTruthy();
  });

  it('refuses a wrong code and counts it towards the lockout', async () => {
    const u = await makeUser();
    await enrol(u.id);
    const first = await request(app).post('/api/v1/auth/login').send({ emailOrCode: u.email, password: PASSWORD });
    const challengeToken = first.body.data.challengeToken;

    for (let i = 0; i < 5; i += 1) {
      await api('/auth/2fa/challenge').send({ challengeToken, code: '000000' });
    }

    const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after.lockedUntil).not.toBeNull();
  });

  it('accepts a recovery code, and only once', async () => {
    const u = await makeUser();
    const enrolled = await enrol(u.id);
    const recovery = enrolled.body.data.recoveryCodes[0] as string;

    const login = () => request(app).post('/api/v1/auth/login').send({ emailOrCode: u.email, password: PASSWORD });

    const first = await api('/auth/2fa/challenge')
      .send({ challengeToken: (await login()).body.data.challengeToken, code: recovery });
    expect(first.status).toBe(200);
    expect(first.body.data.usedRecoveryCode).toBe(true);

    const second = await api('/auth/2fa/challenge')
      .send({ challengeToken: (await login()).body.data.challengeToken, code: recovery });
    expect(second.status).toBe(401);
  });

  it('needs both the password and a code to turn off', async () => {
    const u = await makeUser();
    await enrol(u.id);
    const token = await auth(u.id);

    expect((await api('/auth/2fa/disable').set('Authorization', token)
      .send({ password: 'wrong', code: await totp(u.id) })).status).toBe(401);

    expect((await api('/auth/2fa/disable').set('Authorization', token)
      .send({ password: PASSWORD, code: '000000' })).status).toBe(400);

    const ok = await api('/auth/2fa/disable').set('Authorization', token)
      .send({ password: PASSWORD, code: await totp(u.id) });
    expect(ok.status).toBe(200);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after.twoFactorEnabledAt).toBeNull();
    expect(after.twoFactorSecret).toBeNull();
    expect(await prisma.twoFactorRecoveryCode.count({ where: { userId: u.id } })).toBe(0);
  });

  it('writes every change to the member activity trail', async () => {
    const u = await makeUser();
    await enrol(u.id);
    await new Promise((r) => setTimeout(r, 150));

    const rows = await prisma.activityLog.findMany({ where: { userId: u.id } });
    expect(rows.map((r) => r.event)).toContain('TWO_FACTOR_ENABLED');
  });
});
