import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Request, Response } from 'express';
import { createApp } from '../src/app.js';
import { clearSessionCache } from '../src/middleware/auth.js';
import { issue } from '../src/core/sessions.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { AppError } from '../src/core/errors.js';
import { runWithContext } from '../src/middleware/request-context.js';
import * as reporter from '../src/core/error-reporter.js';
import { prisma, resetData, seedPlan } from './helpers.js';

/**
 * Error tracking.
 *
 * The point of this is not that errors are written down — logs already do that.
 * It is that the same fault, however many times it happens, stays one row with
 * a count, and that a handled 4xx never becomes one at all. Get either wrong
 * and the board is unreadable, which is the same as not having it.
 */

const app = createApp();

async function makeAdmin() {
  const role = await prisma.adminRole.findFirstOrThrow({ where: { slug: 'super-admin' } });
  return prisma.adminUser.create({
    data: {
      email: `op-${Date.now()}-${Math.round(performance.now() * 1000)}@test.local`,
      passwordHash: 'x', name: 'Operator', roleId: role.id,
    },
  });
}

const adminToken = async () => {
  const admin = await makeAdmin();
  const { accessToken } = await issue('ADMIN', admin.id);
  return { admin, token: accessToken };
};

/**
 * Builds an error from a single call site.
 *
 * Fingerprinting includes the throwing line, which is right: two different
 * bugs with the same message are two bugs. But it means a test constructing
 * errors on separate lines is modelling separate faults, not one recurring
 * one — so anything asserting on grouping has to throw from here.
 */
const fault = (message: string, Kind: ErrorConstructor = Error) => new Kind(message);

/** Runs the error middleware against a stub request, and waits for the write. */
async function handle(err: unknown, over: Partial<Request> = {}) {
  const req = {
    requestId: 'req-1', method: 'POST', path: '/things', route: { path: '/things/:id' },
    ...over,
  } as unknown as Request;

  const res = {
    statusCode: 0,
    status(code: number) { this.statusCode = code; return this; },
    json() { return this; },
  } as unknown as Response & { statusCode: number };

  errorHandler(err, req, res, () => {});
  await reporter.flushErrors();
  return res;
}

beforeAll(seedPlan);
beforeEach(async () => {
  await resetData();
  clearSessionCache();
});

describe('what gets recorded', () => {
  it('files a 500 as a fault, with where it happened', async () => {
    const res = await handle(new Error('the database went away'));
    expect(res.statusCode).toBe(500);

    const row = await prisma.errorEvent.findFirstOrThrow();
    expect(row.name).toBe('Error');
    expect(row.message).toBe('the database went away');
    expect(row.source).toBe('REQUEST');
    expect(row.statusCode).toBe(500);
    expect(row.method).toBe('POST');
    // The matched route, so every id does not become its own fault.
    expect(row.route).toBe('/things/:id');
    expect(row.requestId).toBe('req-1');
    expect(row.stack).toBeTruthy();
    expect(row.count).toBe(1);
    expect(row.resolvedAt).toBeNull();
  });

  it('records nothing for a handled failure', async () => {
    /**
     * A member mistyping a wallet address is not a platform fault. If these
     * were filed, the board would be a list of people making ordinary mistakes
     * and the one row that means something would be somewhere on page nine.
     */
    await handle(new AppError('Insufficient funds', 400, 'INSUFFICIENT_FUNDS'));
    await handle(new AppError('Not found', 404, 'NOT_FOUND'));
    await handle(new AppError('Nope', 403, 'FORBIDDEN'));

    expect(await prisma.errorEvent.count()).toBe(0);
  });

  it('records nothing for a validation failure', async () => {
    const { ZodError } = await import('zod');
    await handle(new ZodError([]));
    expect(await prisma.errorEvent.count()).toBe(0);
  });

  it('records nothing for a rejected duplicate, which is the ledger working', async () => {
    const { Prisma } = await import('@prisma/client');
    const dup = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002', clientVersion: 'x',
    });
    const res = await handle(dup);

    expect(res.statusCode).toBe(409);
    expect(await prisma.errorEvent.count()).toBe(0);
  });

  it('captures what is thrown that is not an Error at all', async () => {
    await handle('a bare string');
    const row = await prisma.errorEvent.findFirstOrThrow();
    expect(row.message).toBe('a bare string');
  });
});

describe('grouping', () => {
  it('counts repeats of one fault instead of filing it again', async () => {
    for (let i = 0; i < 5; i += 1) await handle(fault('upstream timed out'));

    const rows = await prisma.errorEvent.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.count).toBe(5);
    expect(rows[0]!.lastSeenAt.getTime()).toBeGreaterThanOrEqual(rows[0]!.firstSeenAt.getTime());
  });

  it('groups the same fault across different members and amounts', async () => {
    /**
     * This is what makes the board readable. A message quoting a member id and
     * a figure is a different string every time; fingerprinting on the raw text
     * would file one row per member and hide that it is a single bug.
     */
    for (const [id, amount] of [
      ['cmt5h75mv008772up44nou80l', '1250.75'],
      ['cmt9zzzzz008772up44nou99x', '88.10'],
      ['cmt1aaaaa008772up44nou11y', '4000.00'],
    ]) {
      await handle(fault(`Insufficient balance for user ${id}: needed ${amount}`));
    }

    const rows = await prisma.errorEvent.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.count).toBe(3);
  });

  it('keeps genuinely different faults apart', async () => {
    await handle(new Error('upstream timed out'));
    await handle(new TypeError('cannot read properties of undefined'));
    expect(await prisma.errorEvent.count()).toBe(2);
  });

  it('keeps the same fault on different routes apart', async () => {
    await handle(new Error('boom'), { route: { path: '/a' } as Request['route'] });
    await handle(new Error('boom'), { route: { path: '/b' } as Request['route'] });
    expect(await prisma.errorEvent.count()).toBe(2);
  });

  it('keeps the latest occurrence as the reproducible one', async () => {
    for (const requestId of ['first', 'second']) await handle(fault('flaky thing'), { requestId });

    const row = await prisma.errorEvent.findFirstOrThrow();
    expect(row.count).toBe(2);
    expect(row.requestId).toBe('second');
  });
});

describe('resolving', () => {
  it('reopens a fault that comes back', async () => {
    /**
     * The most important thing this can tell an operator: the fix did not hold.
     * Leaving it resolved while it recurs is how a known bug goes unwatched.
     */
    const { admin } = await adminToken();
    const again = () => handle(fault('regression'));

    await again();
    const row = await prisma.errorEvent.findFirstOrThrow();
    await reporter.resolve(row.id, admin.id);
    expect((await prisma.errorEvent.findFirstOrThrow()).resolvedAt).not.toBeNull();

    await again();

    const after = await prisma.errorEvent.findFirstOrThrow();
    expect(after.resolvedAt).toBeNull();
    expect(after.resolvedBy).toBeNull();
    expect(after.count).toBe(2);
  });

  it('counts only what is unresolved', async () => {
    const { admin } = await adminToken();
    await handle(new Error('one'));
    await handle(new TypeError('two'));
    expect(await reporter.unresolvedCount()).toBe(2);

    const [first] = await prisma.errorEvent.findMany();
    await reporter.resolve(first!.id, admin.id);
    expect(await reporter.unresolvedCount()).toBe(1);
  });
});

describe('staying out of the way', () => {
  it('records nothing during a simulation', async () => {
    // A modelled run that fails is recorded on the run row. Filing it as a
    // platform fault would raise an incident for something nobody is using.
    await runWithContext({ requestId: 'sim-x', simulating: true, simulationRunId: 'run-1' }, async () => {
      await handle(new Error('simulated blow-up'));
    });
    expect(await prisma.errorEvent.count()).toBe(0);
  });

  it('still answers the request when recording fails', async () => {
    /**
     * An error reporter that can throw during error handling turns a 500 into
     * a crash. The response must be sent regardless.
     */
    const res = await handle(new Error('x'), { requestId: 'z'.repeat(5000) });
    expect(res.statusCode).toBe(500);
  });
});

describe('the operator view', () => {
  it('is closed to anyone without a session', async () => {
    expect((await request(app).get('/api/v1/admin/errors')).status).toBe(401);
  });

  it('lists faults with the unresolved count', async () => {
    const { token } = await adminToken();
    await handle(new Error('listed fault'));

    const res = await request(app).get('/api/v1/admin/errors').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.unresolved).toBe(1);
    expect(res.body.data.rows[0].message).toBe('listed fault');
  });

  it('filters to what is still open', async () => {
    const { admin, token } = await adminToken();
    await handle(new Error('open one'));
    await handle(new TypeError('closed one'));

    const closed = await prisma.errorEvent.findFirstOrThrow({ where: { name: 'TypeError' } });
    await reporter.resolve(closed.id, admin.id);

    const open = await request(app)
      .get('/api/v1/admin/errors?resolved=false')
      .set('Authorization', `Bearer ${token}`);
    expect(open.body.data.rows.map((r: { message: string }) => r.message)).toEqual(['open one']);

    const done = await request(app)
      .get('/api/v1/admin/errors?resolved=true')
      .set('Authorization', `Bearer ${token}`);
    expect(done.body.data.rows.map((r: { message: string }) => r.message)).toEqual(['closed one']);
  });

  it('marks one resolved, and says who did it', async () => {
    const { admin, token } = await adminToken();
    await handle(new Error('to be fixed'));
    const row = await prisma.errorEvent.findFirstOrThrow();

    const res = await request(app)
      .post(`/api/v1/admin/errors/${row.id}/resolve`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const after = await prisma.errorEvent.findFirstOrThrow();
    expect(after.resolvedAt).not.toBeNull();
    expect(after.resolvedBy).toBe(admin.id);
  });
});

describe('metrics', () => {
  it('publishes the unresolved count for alerting', async () => {
    await handle(new Error('scraped fault'));

    const res = await request(app).get('/api/v1/metrics');
    expect(res.status).toBe(200);
    expect(res.text).toContain('fortunex_unresolved_errors');
    // Labelled with the service, so the value is after the label set.
    expect(res.text).toMatch(/fortunex_unresolved_errors\{[^}]*\}\s+1\b/);
    expect(res.text).toMatch(/fortunex_errors_last_hour\{[^}]*\}\s+1\b/);
  });
});
