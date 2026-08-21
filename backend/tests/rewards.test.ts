import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { purchase } from '../src/modules/investment/investment.service.js';
import * as rewards from '../src/modules/rewards/rewards.service.js';
import { prisma, resetData, seedPlan, makeUser, balanceOf } from './helpers.js';

const plan = (amount: string) => prisma.packagePlan.findFirstOrThrow({ where: { amount } });

/** Two tiers, so crossing one does not accidentally satisfy the other. */
async function seedTiers() {
  await prisma.rewardTier.deleteMany({});
  await prisma.rewardTier.createMany({
    data: [
      { name: 'Starter Card', threshold: '500',  bonusPercent: '1',   maxBonus: '50',  sortOrder: 1 },
      { name: 'Elite Card',   threshold: '2000', bonusPercent: '0.5', maxBonus: '20',  sortOrder: 2 },
    ],
  });
}

beforeAll(seedPlan);
beforeEach(async () => {
  await resetData();
  await seedTiers();
});

describe('unlocking', () => {
  it('gives nothing before the threshold is crossed', async () => {
    const u = await makeUser({ funded: 300 });
    await purchase(u.id, (await plan('270')).id);

    const cards = await prisma.rewardCard.findMany({ where: { userId: u.id } });
    expect(cards).toHaveLength(0);
  });

  it('unlocks a card when cumulative investment crosses the threshold', async () => {
    const u = await makeUser({ funded: 1200 });
    await purchase(u.id, (await plan('1100')).id);

    const cards = await prisma.rewardCard.findMany({ where: { userId: u.id } });
    expect(cards).toHaveLength(1);
    // 1% of 1100, under the $50 ceiling
    expect(Number(cards[0]!.amount)).toBeCloseTo(11, 6);
    expect(cards[0]!.status).toBe('UNCLAIMED');
  });

  it('unlocks on cumulative investment, not on one purchase', async () => {
    const u = await makeUser({ funded: 1000 });
    await purchase(u.id, (await plan('270')).id);
    expect(await prisma.rewardCard.count({ where: { userId: u.id } })).toBe(0);

    await purchase(u.id, (await plan('270')).id);   // 540 total, past the 500 threshold
    expect(await prisma.rewardCard.count({ where: { userId: u.id } })).toBe(1);
  });

  it('caps a card at the tier ceiling', async () => {
    // A tier whose percentage would overshoot its own ceiling on one purchase.
    await prisma.rewardTier.deleteMany({});
    await prisma.rewardTier.create({
      data: { name: 'Capped Card', threshold: '500', bonusPercent: '10', maxBonus: '5', sortOrder: 1 },
    });

    const u = await makeUser({ funded: 1200 });
    await purchase(u.id, (await plan('1100')).id);

    const card = await prisma.rewardCard.findFirstOrThrow({ where: { userId: u.id } });
    // 10% of 1,100 is 110, but the tier ceiling is 5.
    expect(Number(card.amount)).toBeCloseTo(5, 6);
  });

  it('never issues the same tier twice', async () => {
    const u = await makeUser({ funded: 5000 });
    await purchase(u.id, (await plan('1100')).id);
    await purchase(u.id, (await plan('1100')).id);
    await purchase(u.id, (await plan('1100')).id);

    const starter = await prisma.rewardCard.count({
      where: { userId: u.id, tier: { name: 'Starter Card' } },
    });
    expect(starter).toBe(1);
  });

  it('fixes the amount at unlock, so retuning the tier does not rewrite it', async () => {
    const u = await makeUser({ funded: 1200 });
    await purchase(u.id, (await plan('1100')).id);
    const before = await prisma.rewardCard.findFirstOrThrow({ where: { userId: u.id } });

    await prisma.rewardTier.updateMany({
      where: { name: 'Starter Card' },
      data: { bonusPercent: '99', maxBonus: '9999' },
    });

    const after = await prisma.rewardCard.findFirstOrThrow({ where: { id: before.id } });
    expect(Number(after.amount)).toBeCloseTo(Number(before.amount), 6);
  });

  it('unlocks every tier crossed at once', async () => {
    const u = await makeUser({ funded: 3000 });
    await purchase(u.id, (await plan('2650')).id);

    expect(await prisma.rewardCard.count({ where: { userId: u.id } })).toBe(2);
  });
});

describe('scratching', () => {
  const cardFor = async (userId: string) =>
    prisma.rewardCard.findFirstOrThrow({ where: { userId, status: 'UNCLAIMED' } });

  it('pays the card into the main wallet', async () => {
    const u = await makeUser({ funded: 1200 });
    await purchase(u.id, (await plan('1100')).id);
    const card = await cardFor(u.id);
    const before = await balanceOf(u.id);

    const result = await rewards.claim(u.id, card.id);

    expect(Number(result.paid)).toBeCloseTo(11, 6);
    expect(await balanceOf(u.id) - before).toBeCloseTo(11, 6);
  });

  it('can only be scratched once', async () => {
    const u = await makeUser({ funded: 1200 });
    await purchase(u.id, (await plan('1100')).id);
    const card = await cardFor(u.id);

    await rewards.claim(u.id, card.id);
    await expect(rewards.claim(u.id, card.id)).rejects.toThrow(/already scratched/);
  });

  it('two taps at once pay once', async () => {
    const u = await makeUser({ funded: 1200 });
    await purchase(u.id, (await plan('1100')).id);
    const card = await cardFor(u.id);
    const before = await balanceOf(u.id);

    const results = await Promise.allSettled([
      rewards.claim(u.id, card.id),
      rewards.claim(u.id, card.id),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await balanceOf(u.id) - before).toBeCloseTo(11, 6);
  });

  it('cannot scratch someone else card', async () => {
    const a = await makeUser({ funded: 1200 });
    const b = await makeUser();
    await purchase(a.id, (await plan('1100')).id);
    const card = await cardFor(a.id);

    await expect(rewards.claim(b.id, card.id)).rejects.toThrow(/not found/);
    const still = await prisma.rewardCard.findUniqueOrThrow({ where: { id: card.id } });
    expect(still.status).toBe('UNCLAIMED');
  });

  it('is clamped by the earnings ceiling like every other payout', async () => {
    const u = await makeUser({ funded: 1200 });
    await purchase(u.id, (await plan('1100')).id);
    const card = await cardFor(u.id);

    // Push the member to their cap so there is no headroom left.
    await prisma.investment.updateMany({
      where: { userId: u.id },
      data: { totalEarned: (await prisma.investment.findFirstOrThrow({ where: { userId: u.id } })).capLimit },
    });

    const result = await rewards.claim(u.id, card.id);

    expect(Number(result.paid)).toBe(0);
    expect(result.cappedOut).toBe(true);
    // Still consumed — a card that stays unclaimed forever is worse than one
    // that paid nothing and said so.
    const after = await prisma.rewardCard.findUniqueOrThrow({ where: { id: card.id } });
    expect(after.status).toBe('CLAIMED');
  });

  it('shows locked tiers too, so members can see what is coming', async () => {
    const u = await makeUser({ funded: 1200 });
    await purchase(u.id, (await plan('1100')).id);

    const view = await rewards.listFor(u.id);
    expect(view.cards).toHaveLength(2);
    expect(view.cards.find((c) => c.tier === 'Elite Card')?.status).toBe('LOCKED');
    expect(view.unclaimed).toBe(1);
  });
});
