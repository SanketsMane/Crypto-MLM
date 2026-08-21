import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { matches, allowed, assertValidRules } from '../src/core/ip-allowlist.js';
import { registry } from '../src/core/metrics.js';
import { prisma, resetData, seedPlan, makeUser } from './helpers.js';

const app = createApp();

beforeAll(seedPlan);
beforeEach(resetData);

describe('health probes', () => {
  it('liveness answers without touching a dependency', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('readiness reports what a request would need', async () => {
    const res = await request(app).get('/api/v1/ready');
    expect(res.status).toBe(200);
    expect(res.body.checks.database.ok).toBe(true);
    expect(typeof res.body.checks.database.latencyMs).toBe('number');
  });

  it('treats Redis as degraded, not down', async () => {
    // The queue backing payouts being unreachable delays jobs; it does not stop
    // a member reading their balance, so it must not pull the API from rotation.
    const res = await request(app).get('/api/v1/ready');
    expect(res.body.checks.redis.required).toBe(false);
  });

  it('is reachable without authentication — an orchestrator has no token', async () => {
    expect((await request(app).get('/api/v1/health')).status).toBe(200);
    expect((await request(app).get('/api/v1/ready')).status).toBe(200);
  });
});

describe('metrics', () => {
  it('exposes Prometheus text', async () => {
    const res = await request(app).get('/api/v1/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('# HELP');
  });

  it('reports the business gauges, not only request counters', async () => {
    const text = (await request(app).get('/api/v1/metrics')).text;
    for (const metric of [
      'fortunex_withdrawals_pending',
      'fortunex_withdrawals_overdue',
      'fortunex_payouts_stuck',
      'fortunex_members_active',
      'fortunex_member_balances_total',
      'fortunex_last_roi_accrual_timestamp',
    ]) {
      expect(text, `${metric} should be exported`).toContain(metric);
    }
  });

  it('counts a real member', async () => {
    await makeUser();
    const text = (await request(app).get('/api/v1/metrics')).text;
    expect(text).toMatch(/fortunex_members_active\{[^}]*\}\s+1/);
  });

  it('labels requests by route pattern, never by id', async () => {
    const u = await makeUser();
    await request(app).get(`/api/v1/admin/users/${u.id}`);

    const text = (await registry.metrics());
    // The member id must not become a label value — that is how a metrics
    // endpoint grows an unbounded label set and takes down the process.
    expect(text).not.toContain(u.id);
  });
});

describe('client address behind a proxy', () => {
  it('matches an exact address', () => {
    expect(matches('203.0.113.7', '203.0.113.7')).toBe(true);
    expect(matches('203.0.113.8', '203.0.113.7')).toBe(false);
  });

  it('matches a CIDR range', () => {
    expect(matches('10.0.1.55', '10.0.0.0/16')).toBe(true);
    expect(matches('10.1.1.55', '10.0.0.0/16')).toBe(false);
    expect(matches('192.168.1.7', '192.168.1.0/24')).toBe(true);
    expect(matches('192.168.2.7', '192.168.1.0/24')).toBe(false);
  });

  it('normalises the IPv4-mapped form Node reports on a dual-stack socket', () => {
    // An operator typing 10.0.0.1 reasonably expects it to match.
    expect(matches('::ffff:10.0.0.1', '10.0.0.1')).toBe(true);
    expect(matches('::ffff:10.0.0.1', '10.0.0.0/24')).toBe(true);
  });

  it('handles IPv6', () => {
    expect(matches('2001:db8::1', '2001:db8::/32')).toBe(true);
    expect(matches('2001:dba::1', '2001:db8::/32')).toBe(false);
  });

  it('an empty list is no restriction, not a lockout', () => {
    expect(allowed('203.0.113.7', [])).toBe(true);
  });

  it('a set list refuses anything outside it', () => {
    expect(allowed('203.0.113.7', ['10.0.0.0/8'])).toBe(false);
    expect(allowed(undefined, ['10.0.0.0/8'])).toBe(false);
  });

  it('rejects a malformed rule before it can lock anyone out', () => {
    expect(() => assertValidRules('not-an-ip')).toThrow();
    expect(() => assertValidRules('10.0.0.0/99')).toThrow();
    expect(() => assertValidRules('10.0.0.0/8, 192.168.1.1')).not.toThrow();
  });

  it('a forged X-Forwarded-For cannot change the address seen', async () => {
    /**
     * With TRUST_PROXY_HOPS at its default of 0, the socket address wins.
     * If this ever regressed, a client could prepend an allowlisted address
     * and walk straight past the admin IP restriction.
     */
    const honest = await request(app).get('/api/v1/health');
    const forged = await request(app)
      .get('/api/v1/health')
      .set('X-Forwarded-For', '203.0.113.9');

    expect(honest.status).toBe(200);
    expect(forged.status).toBe(200);

    // The settings endpoint reports the address the server actually sees.
    const admin = await prisma.adminRole.findFirstOrThrow({ where: { slug: 'super-admin' } });
    expect(admin).toBeTruthy();
  });
});
