import { describe, expect, it, beforeEach } from 'vitest';
import { prisma } from '../src/core/db.js';
import * as rank from '../src/modules/rank/rank.service.js';
import * as roaming from '../src/modules/roaming-club/roaming-club.service.js';
import * as rewards from '../src/modules/rewards/rewards.service.js';
import { resetData, seedPlan, makeUser } from './helpers.js';

/**
 * Threshold awards.
 *
 * Rank rewards, Roaming Club places and reward cards are all granted by an
 * evaluator that runs repeatedly — on a schedule, after a purchase, and by an
 * operator pressing a button. Each of those is a chance to pay the same
 * milestone twice, so evaluating again must never grant again.
 */

/** Put a member comfortably past the first rank's requirements. */
async function qualified(selfCapital = 100_000, teamBusiness = 500_000) {
  const u = await makeUser();
  const pkg = await prisma.packagePlan.findFirstOrThrow();
  await prisma.investment.create({
    data: {
      user: { connect: { id: u.id } }, package: { connect: { id: pkg.id } },
      amount: String(selfCapital), capLimit: String(selfCapital * 3), totalEarned: '0',
      status: 'ACTIVE', dailyRoiPercent: '0.5',
    },
  });
  await prisma.$executeRaw`
    UPDATE users SET "totalInvested" = ${selfCapital}::numeric WHERE id = ${u.id}`;
  await prisma.teamVolume.update({
    where: { userId: u.id },
    data: {
      totalTeamBusiness: String(teamBusiness),
      powerLegVolume: String(teamBusiness / 2),
      otherLegsVolume: String(teamBusiness / 2),
      teamSize: 50,
    },
  });
  return u;
}

beforeEach(async () => { await resetData(); await seedPlan(); });

describe('rank rewards', () => {
  it('grants a rank once, however often it is evaluated', async () => {
    const u = await qualified();
    const first = await rank.evaluate(u.id);
    expect(first.length).toBeGreaterThan(0);

    const second = await rank.evaluate(u.id);
    expect(second).toEqual([]);

    const achievements = await prisma.rankAchievement.count({ where: { userId: u.id } });
    expect(achievements).toBe(first.length);
  });

  it('grants once when two evaluations race', async () => {
    const u = await qualified();
    await Promise.allSettled([rank.evaluate(u.id), rank.evaluate(u.id)]);

    const rows = await prisma.rankAchievement.groupBy({
      by: ['rankId'], where: { userId: u.id }, _count: { _all: true },
    });
    for (const r of rows) expect(r._count._all).toBe(1);
  });

  it('pays the reward exactly once per rank', async () => {
    const u = await qualified();
    await rank.evaluate(u.id);
    await rank.evaluate(u.id);

    const credits = await prisma.ledgerEntry.findMany({
      where: { userId: u.id, category: 'RANK_BONUS' }, select: { reference: true },
    });
    expect(new Set(credits.map((c) => c.reference)).size).toBe(credits.length);
  });
});

describe('roaming club', () => {
  it('awards a tier once, however often it is evaluated', async () => {
    const u = await qualified();
    await roaming.evaluate(u.id);
    const before = await prisma.roamingClubAward.count({ where: { userId: u.id } });
    await roaming.evaluate(u.id);
    expect(await prisma.roamingClubAward.count({ where: { userId: u.id } })).toBe(before);
  });
});

describe('reward cards', () => {
  it('issues a tier once, however often it is evaluated', async () => {
    const u = await qualified();
    await rewards.evaluate(prisma, u.id);
    const before = await prisma.rewardCard.count({ where: { userId: u.id } });
    await rewards.evaluate(prisma, u.id);
    expect(await prisma.rewardCard.count({ where: { userId: u.id } })).toBe(before);
  });
});
