import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { SPECS } from '../src/core/runtime-config.js';
import { invalidatePublicConfig } from '../src/modules/config/config.service.js';
import { invalidateConfig } from '../src/core/runtime-config.js';
import { prisma, resetData, seedPlan } from './helpers.js';

const app = createApp();
const getConfig = () => request(app).get('/api/v1/config');

/**
 * Two caches sit between a setting and the response: the runtime config the
 * money paths read, and the public copy derived from it. Writing straight to
 * the table in a test bypasses the service that would drop both, so the test
 * has to.
 */
const settingsChanged = () => { invalidateConfig(); invalidatePublicConfig(); };

beforeAll(seedPlan);
beforeEach(async () => {
  await resetData();
  settingsChanged();
});

describe('the published plan', () => {
  it('is readable without signing in — a visitor needs the terms too', async () => {
    const res = await getConfig();
    expect(res.status).toBe(200);
    expect(res.body.data.withdrawal.feePercent).toBe(5);
  });

  it('reports what the engine will actually charge', async () => {
    await prisma.setting.create({ data: { key: 'WITHDRAW_FEE_PERCENT', value: '7.5' } });
    settingsChanged();

    const res = await getConfig();
    expect(res.body.data.withdrawal.feePercent).toBe(7.5);
  });

  it('never exposes a setting not marked public', async () => {
    const res = await getConfig();
    const body = JSON.stringify(res.body).toLowerCase();

    const privateKeys = SPECS.filter((s) => !s.public).map((s) => s.key);
    expect(privateKeys.length).toBeGreaterThan(0);   // the test would be vacuous otherwise

    for (const key of privateKeys) {
      // Neither the key nor a camelCased form of it may appear.
      const camel = key.toLowerCase().replace(/_(.)/g, (_, c: string) => c.toUpperCase());
      expect(body, `${key} must not be public`).not.toContain(key.toLowerCase());
      expect(body, `${key} must not be public`).not.toContain(camel.toLowerCase());
    }
  });

  it('does not leak the admin allowlist or the idle timeout specifically', async () => {
    await prisma.setting.createMany({
      data: [
        { key: 'ADMIN_IP_ALLOWLIST', value: '203.0.113.7/32' },
        { key: 'ADMIN_IDLE_TIMEOUT_MINUTES', value: '5' },
      ],
    });
    settingsChanged();

    const body = JSON.stringify((await getConfig()).body);
    expect(body).not.toContain('203.0.113.7');
    expect(body).not.toContain('allowlist');
  });

  it('withholds the maintenance message until maintenance is on', async () => {
    expect((await getConfig()).body.data.platform.maintenanceMessage).toBeNull();

    await prisma.setting.create({ data: { key: 'MAINTENANCE_MODE', value: 'true' } });
    settingsChanged();

    const on = await getConfig();
    expect(on.body.data.platform.maintenanceMode).toBe(true);
    expect(on.body.data.platform.maintenanceMessage).toBeTruthy();
  });

  it('carries the live catalogue, not a copy of it', async () => {
    const res = await getConfig();
    const { packages, directBonus, ranks } = res.body.data;

    const dbPackages = await prisma.packagePlan.count({ where: { isActive: true } });
    expect(packages).toHaveLength(dbPackages);
    expect(directBonus.map((d: { level: number }) => d.level)).toEqual([1, 2, 3]);
    expect(ranks.length).toBeGreaterThan(0);
  });

  it('reflects a package added by an operator', async () => {
    const before = (await getConfig()).body.data.packages.length;

    await prisma.packagePlan.create({
      data: { name: 'New tier', amount: '750', dailyRoiPercent: '0.5', capPercent: '250', sortOrder: 99 },
    });
    settingsChanged();

    expect((await getConfig()).body.data.packages).toHaveLength(before + 1);
  });

  it('describes the trading week in words a member can read', async () => {
    expect((await getConfig()).body.data.returns.tradingDaysLabel).toBe('Monday to Friday');

    await prisma.setting.create({ data: { key: 'TRADING_DAYS', value: '1,3,5' } });
    settingsChanged();

    expect((await getConfig()).body.data.returns.tradingDaysLabel).toBe('Monday, Wednesday and Friday');
  });

  it('is not cached across an operator change', async () => {
    expect((await getConfig()).body.data.withdrawal.minimum).toBe(10);

    await prisma.setting.create({ data: { key: 'WITHDRAW_MIN', value: '25' } });
    settingsChanged();

    expect((await getConfig()).body.data.withdrawal.minimum).toBe(25);
  });
});
