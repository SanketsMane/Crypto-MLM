import { describe, expect, it, beforeEach } from 'vitest';
import { prisma } from '../src/core/db.js';
import { purchase } from '../src/modules/investment/investment.service.js';
import * as wallet from '../src/modules/wallet/wallet.service.js';
import * as withdrawal from '../src/modules/withdrawal/withdrawal.service.js';
import { invalidateConfig } from '../src/core/runtime-config.js';
import { resetData, seedPlan, makeUser, balanceOf } from './helpers.js';

/**
 * The awkward inputs.
 *
 * Every one of these is a way a member (or a script pointed at the API) can try
 * to get value out of the platform that it never took in: spending twice,
 * moving negative money, buying with an empty wallet.
 */

const planId = async (name: string) => (await prisma.packagePlan.findFirstOrThrow({ where: { name } })).id;

beforeEach(async () => {
  await resetData();
  await seedPlan();
  await prisma.setting.deleteMany({});
  await prisma.setting.create({ data: { key: 'KYC_REQUIRED_FOR_WITHDRAWAL', value: 'false' } });
  invalidateConfig();
});

describe('buying a package', () => {
  it('refuses when the fund wallet cannot cover it', async () => {
    const u = await makeUser({ funded: 10 });
    await expect(purchase(u.id, await planId('Test Plan 1'))).rejects.toThrow();
    expect(await balanceOf(u.id, 'FUND')).toBeCloseTo(10, 6);
  });

  it('refuses an unknown package', async () => {
    const u = await makeUser({ funded: 5000 });
    await expect(purchase(u.id, 'no-such-package')).rejects.toThrow(/not available/i);
  });

  it('refuses an inactive package', async () => {
    const u = await makeUser({ funded: 5000 });
    const p = await prisma.packagePlan.findFirstOrThrow({ where: { name: 'Test Plan 1' } });
    await prisma.packagePlan.update({ where: { id: p.id }, data: { isActive: false } });
    await expect(purchase(u.id, p.id)).rejects.toThrow(/not available/i);
  });

  it('debits exactly once when two purchases race', async () => {
    // funded for ONE package only — the second must fail, not overdraw
    const u = await makeUser({ funded: 110 });
    const id = await planId('Test Plan 1'); // 110
    const r = await Promise.allSettled([purchase(u.id, id), purchase(u.id, id)]);

    expect(r.filter((x) => x.status === 'fulfilled').length).toBe(1);
    expect(await balanceOf(u.id, 'FUND')).toBeCloseTo(0, 6);
    expect(await prisma.investment.count({ where: { userId: u.id } })).toBe(1);
  });

  it('never leaves the wallet negative', async () => {
    const u = await makeUser({ funded: 100 });
    await Promise.allSettled([
      purchase(u.id, await planId('Test Plan 1')),
      purchase(u.id, await planId('Test Plan 2')),
    ]);
    expect(await balanceOf(u.id, 'FUND')).toBeGreaterThanOrEqual(0);
  });
});

describe('moving money between wallets', () => {
  it('refuses a negative amount', async () => {
    const u = await makeUser({ funded: 500 });
    await expect(wallet.transfer(u.id, 'FUND', 'MAIN', '-100')).rejects.toThrow();
    expect(await balanceOf(u.id, 'FUND')).toBeCloseTo(500, 6);
    expect(await balanceOf(u.id, 'MAIN')).toBeCloseTo(0, 6);
  });

  it('refuses zero', async () => {
    const u = await makeUser({ funded: 500 });
    await expect(wallet.transfer(u.id, 'FUND', 'MAIN', '0')).rejects.toThrow();
  });

  it('refuses more than the wallet holds', async () => {
    const u = await makeUser({ funded: 100 });
    await expect(wallet.transfer(u.id, 'FUND', 'MAIN', '500')).rejects.toThrow();
    expect(await balanceOf(u.id, 'FUND')).toBeCloseTo(100, 6);
  });

  it('refuses a transfer to the same wallet', async () => {
    const u = await makeUser({ funded: 500 });
    await expect(wallet.transfer(u.id, 'FUND', 'FUND', '100')).rejects.toThrow();
  });

  it('conserves the total across a race', async () => {
    const u = await makeUser({ funded: 300 });
    await Promise.allSettled([
      wallet.transfer(u.id, 'FUND', 'MAIN', '200'),
      wallet.transfer(u.id, 'FUND', 'MAIN', '200'),
    ]);
    const total = (await balanceOf(u.id, 'FUND')) + (await balanceOf(u.id, 'MAIN'));
    expect(total).toBeCloseTo(300, 6);
    expect(await balanceOf(u.id, 'FUND')).toBeGreaterThanOrEqual(0);
  });
});

describe('requesting a withdrawal', () => {
  it('refuses more than the balance', async () => {
    const u = await makeUser();
    await prisma.$executeRaw`UPDATE wallet_accounts SET balance = 50 WHERE "userId" = ${u.id} AND type = 'MAIN'`;
    await expect(withdrawal.request(u.id, '100', '0x' + 'a'.repeat(40), undefined, 'password')).rejects.toThrow();
    expect(await balanceOf(u.id, 'MAIN')).toBeCloseTo(50, 6);
  });

  it('refuses a malformed payout address', async () => {
    const u = await makeUser();
    await prisma.$executeRaw`UPDATE wallet_accounts SET balance = 500 WHERE "userId" = ${u.id} AND type = 'MAIN'`;
    await expect(withdrawal.request(u.id, '100', 'not-an-address', undefined, 'password')).rejects.toThrow(/address/i);
  });

  it('debits once when two requests race the same balance', async () => {
    const u = await makeUser();
    await prisma.$executeRaw`UPDATE wallet_accounts SET balance = 100 WHERE "userId" = ${u.id} AND type = 'MAIN'`;
    const addr = '0x' + 'a'.repeat(40);
    await Promise.allSettled([
      withdrawal.request(u.id, '100', addr, undefined, 'password'),
      withdrawal.request(u.id, '100', addr, undefined, 'password'),
    ]);
    expect(await balanceOf(u.id, 'MAIN')).toBeGreaterThanOrEqual(0);
    expect(await prisma.withdrawal.count({ where: { userId: u.id } })).toBe(1);
  });
});
