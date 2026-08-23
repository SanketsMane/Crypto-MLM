import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/core/db.js';
import { invalidateConfig } from '../src/core/runtime-config.js';
import { payGenerationBonus } from '../src/modules/commission/commission.service.js';
import { purchase } from '../src/modules/investment/investment.service.js';
import { findPlacement, place } from '../src/core/binary.js';
import { money } from '../src/core/money.js';
import { resetData, seedPlan, makeUser } from './helpers.js';

/**
 * The binary plan driven through the real purchase path — placement at signup,
 * volume up the placement tree on purchase, commission on the matched leg, and
 * the generation bonus standing down while binary is in force.
 */

const setPlan = async (v: 'UNILEVEL' | 'BINARY') => {
  await prisma.setting.upsert({
    where: { key: 'PLAN_STRUCTURE' },
    create: { key: 'PLAN_STRUCTURE', value: v },
    update: { value: v },
  });
  invalidateConfig();
};

/** makeUser builds the sponsor tree; binary needs the placement tree too. */
async function placed(sponsorId?: string, funded = 0) {
  const u = await makeUser({ sponsorId, funded });
  await prisma.binaryLeg.upsert({ where: { userId: u.id }, create: { userId: u.id }, update: {} });
  if (sponsorId) {
    const slot = await findPlacement(sponsorId);
    if (slot) await place(u.id, slot);
  }
  return u;
}

const planId = async (name: string) =>
  (await prisma.packagePlan.findFirstOrThrow({ where: { name } })).id;

beforeAll(async () => {
  await resetData();
  await seedPlan();
  await setPlan('BINARY');
});
afterAll(async () => { await setPlan('UNILEVEL'); });

describe('binary plan, through the real purchase path', () => {
  it('places recruits, matches the weaker leg and carries the surplus', async () => {
    const root = await placed(undefined, 0);
    const left = await placed(root.id, 5000);
    const right = await placed(root.id, 5000);

    // Root needs cap headroom, so it buys first.
    await prisma.$executeRaw`UPDATE wallet_accounts SET balance = 5000 WHERE "userId" = ${root.id} AND type = 'FUND'`;
    await purchase(root.id, await planId('Test Plan 5')); // 2650

    // 1100 into the left leg, 530 into the right.
    await purchase(left.id, await planId('Test Plan 4'));  // 1100
    await purchase(right.id, await planId('Test Plan 3')); // 530

    const leg = await prisma.binaryLeg.findUniqueOrThrow({ where: { userId: root.id } });
    expect(leg.leftTotal.toString()).toBe('1100');
    expect(leg.rightTotal.toString()).toBe('530');
    // the weaker leg is what pays
    expect(leg.matchedTotal.toString()).toBe('530');
    // and the surplus stays as carryover
    expect(leg.leftVolume.toString()).toBe('570');
    expect(leg.rightVolume.toString()).toBe('0');

    const c = await prisma.commission.findFirst({
      where: { userId: root.id, kind: 'BINARY' }, orderBy: { createdAt: 'desc' },
    });
    expect(c).not.toBeNull();
    expect(c!.baseAmount.toString()).toBe('530');
    // 10% of the matched volume, the seeded default
    expect(Number(c!.amount)).toBeCloseTo(53, 6);
  });

  it('stands the generation bonus down while binary is in force', async () => {
    const root = await placed();
    const kid = await placed(root.id);

    const paid = await payGenerationBonus(prisma, {
      accrualId: `bflow-${Date.now()}`,
      earnerFromId: kid.id,
      roiAmount: money(100),
    });
    expect(paid).toEqual([]);
  });

  it('pays no binary bonus once the plan is unilevel again', async () => {
    await setPlan('UNILEVEL');

    const root = await placed();
    const buyer = await placed(root.id, 5000);
    const before = await prisma.commission.count({ where: { kind: 'BINARY' } });
    await purchase(buyer.id, await planId('Test Plan 1'));
    const after = await prisma.commission.count({ where: { kind: 'BINARY' } });

    expect(after).toBe(before);
    await setPlan('BINARY');
  });
});
