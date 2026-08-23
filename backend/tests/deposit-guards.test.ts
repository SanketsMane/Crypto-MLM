import { describe, expect, it, beforeEach } from 'vitest';
import { prisma } from '../src/core/db.js';
import * as deposit from '../src/modules/deposit/deposit.service.js';
import * as finance from '../src/modules/admin/finance/finance.service.js';
import { resetData, makeUser, balanceOf } from './helpers.js';

/**
 * Money entering the platform.
 *
 * A deposit is a claim until an operator confirms it against the chain. The
 * dangerous states are the ones after a decision has already been made:
 * confirming something that was rejected credits funds nobody sent.
 */

let adminId = '';
async function freshAdmin() {
  const role = await prisma.adminRole.upsert({
    where: { slug: 'dep-test-role' },
    create: { name: 'Dep Test', slug: 'dep-test-role', description: 't', level: 1, isSystem: false },
    update: {},
  });
  const a = await prisma.adminUser.create({
    data: { email: `dep-${Date.now()}@test.local`, name: 'Dep', passwordHash: 'x', roleId: role.id },
  });
  adminId = a.id;
}

beforeEach(async () => { await resetData(); await freshAdmin(); });

describe('a rejected deposit', () => {
  it('cannot then be confirmed and credited', async () => {
    const u = await makeUser();
    const dep = await deposit.create(u.id, '500');
    await finance.rejectDeposit(adminId, dep.id, 'No matching transaction on chain');

    const before = await balanceOf(u.id, 'FUND');
    await expect(deposit.confirm(dep.id)).rejects.toThrow(/rejected/i);

    expect(await balanceOf(u.id, 'FUND')).toBeCloseTo(before, 6);
    const credits = await prisma.ledgerEntry.count({ where: { userId: u.id, category: 'DEPOSIT' } });
    expect(credits).toBe(0);
  });
});

describe('confirming', () => {
  it('credits the fund wallet once', async () => {
    const u = await makeUser();
    const dep = await deposit.create(u.id, '250');
    await deposit.confirm(dep.id);
    expect(await balanceOf(u.id, 'FUND')).toBeCloseTo(250, 6);
  });

  it('is idempotent when confirmed twice in sequence', async () => {
    const u = await makeUser();
    const dep = await deposit.create(u.id, '250');
    await deposit.confirm(dep.id);
    await deposit.confirm(dep.id);
    expect(await balanceOf(u.id, 'FUND')).toBeCloseTo(250, 6);
  });

  it('credits once when two confirmations land together', async () => {
    const u = await makeUser();
    const dep = await deposit.create(u.id, '250');
    await Promise.allSettled([deposit.confirm(dep.id), deposit.confirm(dep.id)]);
    expect(await balanceOf(u.id, 'FUND')).toBeCloseTo(250, 6);
    expect(await prisma.ledgerEntry.count({ where: { userId: u.id, category: 'DEPOSIT' } })).toBe(1);
  });
});

describe('rejecting', () => {
  it('rejects once when two rejections land together', async () => {
    const u = await makeUser();
    const dep = await deposit.create(u.id, '500');
    const r = await Promise.allSettled([
      finance.rejectDeposit(adminId, dep.id, 'a'),
      finance.rejectDeposit(adminId, dep.id, 'b'),
    ]);
    expect(r.filter((x) => x.status === 'fulfilled').length).toBe(1);
  });

  it('cannot reject one already credited', async () => {
    const u = await makeUser();
    const dep = await deposit.create(u.id, '500');
    await deposit.confirm(dep.id);
    await expect(finance.rejectDeposit(adminId, dep.id, 'too late')).rejects.toThrow(/not pending/i);
  });
});
