import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { clearSessionCache } from '../src/middleware/auth.js';
import { prisma, resetData, seedPlan, makeUser, balanceOf, accessTokenFor, verifyKyc, stepUpHeaderFor } from './helpers.js';

const app = createApp();
const plan = (amount: string) => prisma.packagePlan.findFirstOrThrow({ where: { amount } });

/**
 * A funded member plus the headers a real client sends. `stepUp` is the
 * re-authentication a withdrawal now needs — supplied here so these tests keep
 * exercising idempotency rather than tripping over the guard in front of it.
 */
async function member(funded = 5000) {
  const u = await makeUser({ funded });
  const token = await accessTokenFor(u.id);
  return { id: u.id, auth: `Bearer ${token}`, stepUp: await stepUpHeaderFor(token) };
}

beforeAll(seedPlan);
beforeEach(async () => {
  await resetData();
  clearSessionCache();
});

describe('POST /investments/purchase — idempotency', () => {
  it('rejects a money-moving request that carries no key', async () => {
    const u = await member();
    const res = await request(app)
      .post('/api/v1/investments/purchase')
      .set('Authorization', u.auth)
      .send({ packageId: (await plan('1100')).id });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    expect(await prisma.investment.count()).toBe(0);
  });

  it('buys once when the same submission is retried', async () => {
    const u = await member();
    const packageId = (await plan('1100')).id;
    const key = randomUUID();
    const send = () =>
      request(app)
        .post('/api/v1/investments/purchase')
        .set('Authorization', u.auth)
        .set('Idempotency-Key', key)
        .send({ packageId });

    const first = await send();
    const second = await send();

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.headers['idempotency-replayed']).toBe('true');
    expect(second.body.data.id).toBe(first.body.data.id);   // same investment, not a new one

    expect(await prisma.investment.count({ where: { userId: u.id } })).toBe(1);
    expect(await balanceOf(u.id, 'FUND')).toBeCloseTo(3900, 6);
  });

  it('buys once when a double click fires both requests at the same instant', async () => {
    const u = await member();
    const packageId = (await plan('1100')).id;
    const key = randomUUID();
    const send = () =>
      request(app)
        .post('/api/v1/investments/purchase')
        .set('Authorization', u.auth)
        .set('Idempotency-Key', key)
        .send({ packageId });

    const [a, b] = await Promise.all([send(), send()]);

    // One executes; the other either replays it or is told it is still running.
    const codes = [a.status, b.status].sort();
    expect(codes[0]).toBe(201);
    expect([201, 409]).toContain(codes[1]);

    expect(await prisma.investment.count({ where: { userId: u.id } })).toBe(1);
    expect(await balanceOf(u.id, 'FUND')).toBeCloseTo(3900, 6);
  });

  it('still allows a second, genuinely different purchase', async () => {
    const u = await member();
    const packageId = (await plan('1100')).id;
    for (const key of [randomUUID(), randomUUID()]) {
      const res = await request(app)
        .post('/api/v1/investments/purchase')
        .set('Authorization', u.auth)
        .set('Idempotency-Key', key)
        .send({ packageId });
      expect(res.status).toBe(201);
    }
    expect(await prisma.investment.count({ where: { userId: u.id } })).toBe(2);
  });

  it('refuses a key reused for a different payload', async () => {
    const u = await member();
    const key = randomUUID();
    await request(app)
      .post('/api/v1/investments/purchase')
      .set('Authorization', u.auth)
      .set('Idempotency-Key', key)
      .send({ packageId: (await plan('1100')).id });

    const res = await request(app)
      .post('/api/v1/investments/purchase')
      .set('Authorization', u.auth)
      .set('Idempotency-Key', key)
      .send({ packageId: (await plan('2650')).id });   // same key, different package

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(await prisma.investment.count({ where: { userId: u.id } })).toBe(1);
  });

  it('releases the key when the attempt failed, so a real retry works', async () => {
    const u = await member(100);            // cannot afford $1,100
    const packageId = (await plan('1100')).id;
    const key = randomUUID();

    const failed = await request(app)
      .post('/api/v1/investments/purchase')
      .set('Authorization', u.auth)
      .set('Idempotency-Key', key)
      .send({ packageId });
    expect(failed.status).toBe(422);

    await prisma.$executeRaw`UPDATE wallet_accounts SET balance = 5000 WHERE "userId" = ${u.id} AND type = 'FUND'`;

    const retried = await request(app)
      .post('/api/v1/investments/purchase')
      .set('Authorization', u.auth)
      .set('Idempotency-Key', key)
      .send({ packageId });

    expect(retried.status).toBe(201);       // not a cached failure
    expect(await prisma.investment.count({ where: { userId: u.id } })).toBe(1);
  });

  it('never lets one member replay another member key', async () => {
    const a = await member();
    const b = await member();
    const packageId = (await plan('1100')).id;
    const key = randomUUID();

    await request(app).post('/api/v1/investments/purchase')
      .set('Authorization', a.auth).set('Idempotency-Key', key).send({ packageId });

    const res = await request(app).post('/api/v1/investments/purchase')
      .set('Authorization', b.auth).set('Idempotency-Key', key).send({ packageId });

    expect(res.status).toBe(201);
    expect(res.headers['idempotency-replayed']).toBeUndefined();   // b executed its own
    expect(await prisma.investment.count({ where: { userId: b.id } })).toBe(1);
  });

  it('rejects a key too short to be unguessable', async () => {
    const u = await member();
    const res = await request(app)
      .post('/api/v1/investments/purchase')
      .set('Authorization', u.auth)
      .set('Idempotency-Key', 'abc')
      .send({ packageId: (await plan('1100')).id });

    expect(res.status).toBe(400);
    expect(await prisma.investment.count()).toBe(0);
  });
});

describe('other money endpoints are guarded too', () => {
  const cases = [
    { name: 'withdrawal', path: '/api/v1/withdrawals', body: { amount: '100', walletAddress: '0x1234567890abcdef1234567890abcdef12345678' } },
    { name: 'transfer',   path: '/api/v1/wallet/transfer', body: { from: 'MAIN', to: 'FUND', amount: '50' } },
    { name: 'deposit',    path: '/api/v1/deposits', body: { amount: '100', txHash: '0xabc' } },
  ];

  for (const c of cases) {
    it(`${c.name} refuses a request with no key`, async () => {
      const u = await member();
      const res = await request(app).post(c.path).set('Authorization', u.auth).send(c.body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    });
  }

  it('a retried withdrawal debits the wallet once', async () => {
    const u = await member();
    await verifyKyc(u.id);
    await prisma.$executeRaw`UPDATE wallet_accounts SET balance = 500 WHERE "userId" = ${u.id} AND type = 'MAIN'`;
    const key = randomUUID();
    const body = { amount: '100', walletAddress: '0x1234567890abcdef1234567890abcdef12345678' };
    const send = () =>
      request(app).post('/api/v1/withdrawals')
        .set('Authorization', u.auth).set('X-Step-Up', u.stepUp)
        .set('Idempotency-Key', key).send(body);

    await send();
    await send();

    expect(await prisma.withdrawal.count({ where: { userId: u.id } })).toBe(1);
    expect(await balanceOf(u.id)).toBeCloseTo(400, 6);
  });
});
