import { describe, expect, it, beforeAll, beforeEach } from 'vitest';
import { prisma, resetData, seedPlan, makeUser, balanceOf } from './helpers.js';
import { invalidateConfig } from '../src/core/runtime-config.js';
import { money } from '../src/core/money.js';
import { evaluate as evaluateRank } from '../src/modules/rank/rank.service.js';
import {
  splitEvenly,
  runRewardVesting,
  firstOfNextMonth,
  addMonths,
} from '../src/modules/rank/reward-vesting.service.js';

/**
 * Rank rewards paid in monthly parts.
 *
 * The three things that must hold, and which these tests exist to pin:
 *   1. the parts add up to exactly the reward — not a fraction over or under;
 *   2. a job that runs twice pays once;
 *   3. a month the job did not run is not a month the member loses.
 */

const setSetting = async (key: string, value: string | number) => {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: String(value) },
    update: { value: String(value) },
  });
  invalidateConfig();
};

/** Puts a member at Rank 1: $300 self, $2,500 power leg, $2,500 other legs. */
async function qualifyForRank1(): Promise<string> {
  const u = await makeUser();
  await prisma.user.update({ where: { id: u.id }, data: { totalInvested: '300' } });
  await prisma.teamVolume.upsert({
    where: { userId: u.id },
    create: {
      userId: u.id,
      totalTeamBusiness: '5000', powerLegVolume: '2500', otherLegsVolume: '2500',
      directBusiness: '5000', teamSize: 2,
    },
    update: {
      totalTeamBusiness: '5000', powerLegVolume: '2500', otherLegsVolume: '2500',
    },
  });
  return u.id;
}

const instalmentsFor = (userId: string) =>
  prisma.rankRewardInstalment.findMany({ where: { userId }, orderBy: { sequence: 'asc' } });

beforeAll(seedPlan);
beforeEach(async () => {
  await resetData();
  await setSetting('REWARD_VESTING_MONTHS', 0);
});

describe('splitting a reward', () => {
  it('divides evenly when it divides evenly', () => {
    const parts = splitEvenly(money('300'), 10);
    expect(parts).toHaveLength(10);
    expect(parts.every((p) => p.eq(money('30')))).toBe(true);
  });

  it('adds up to exactly the reward when it does not divide evenly', () => {
    // $300 / 7 is 42.857142857… — a number the ledger cannot hold.
    const parts = splitEvenly(money('300'), 7);
    const total = parts.reduce((a, p) => a.add(p), money(0));
    expect(total.eq(money('300'))).toBe(true);
  });

  it('puts the remainder on the last instalment, never the first', () => {
    const parts = splitEvenly(money('300'), 7);
    const first = parts[0];
    const last = parts[parts.length - 1];
    // Paying the remainder early would let someone suspended part-way through
    // collect more than their share.
    expect(last.gte(first)).toBe(true);
    expect(parts.slice(0, -1).every((p) => p.eq(first))).toBe(true);
  });

  it('never lets a single part exceed an even share', () => {
    const parts = splitEvenly(money('1000'), 3);
    const evenShare = money('1000').div(3);
    expect(parts.slice(0, -1).every((p) => p.lte(evenShare))).toBe(true);
    expect(parts.reduce((a, p) => a.add(p), money(0)).eq(money('1000'))).toBe(true);
  });

  it('handles a single instalment as the whole amount', () => {
    const parts = splitEvenly(money('300'), 1);
    expect(parts).toHaveLength(1);
    expect(parts[0].eq(money('300'))).toBe(true);
  });

  it('refuses a count below one', () => {
    expect(() => splitEvenly(money('300'), 0)).toThrow();
  });
});

describe('vesting switched off', () => {
  it('credits the whole reward immediately, as it always did', async () => {
    const userId = await qualifyForRank1();
    await evaluateRank(userId);

    expect(await balanceOf(userId)).toBeCloseTo(300, 6);
    expect(await instalmentsFor(userId)).toHaveLength(0);

    const a = await prisma.rankAchievement.findFirstOrThrow({ where: { userId } });
    expect(a.rewardPaidAt).not.toBeNull();
  });
});

describe('vesting switched on', () => {
  beforeEach(() => setSetting('REWARD_VESTING_MONTHS', 10));

  it('credits nothing up front', async () => {
    const userId = await qualifyForRank1();
    await evaluateRank(userId);

    expect(await balanceOf(userId)).toBeCloseTo(0, 6);
    const a = await prisma.rankAchievement.findFirstOrThrow({ where: { userId } });
    // Promised is not paid.
    expect(a.rewardPaidAt).toBeNull();
    expect(a.rewardAmount.toString()).toContain('300');
  });

  it('writes a schedule whose parts sum to exactly the reward', async () => {
    const userId = await qualifyForRank1();
    await evaluateRank(userId);

    const rows = await instalmentsFor(userId);
    expect(rows).toHaveLength(10);
    const total = rows.reduce((a, r) => a.add(money(r.amount.toString())), money(0));
    expect(total.eq(money('300'))).toBe(true);
    expect(rows.every((r) => r.ofTotal === 10)).toBe(true);
  });

  it('starts on the 1st of next month and runs monthly', async () => {
    const userId = await qualifyForRank1();
    await evaluateRank(userId);

    const rows = await instalmentsFor(userId);
    const a = await prisma.rankAchievement.findFirstOrThrow({ where: { userId } });
    const expectedFirst = firstOfNextMonth(a.achievedAt);

    expect(rows[0].dueOn.toISOString().slice(0, 10)).toBe(expectedFirst.toISOString().slice(0, 10));
    expect(rows[9].dueOn.toISOString().slice(0, 10))
      .toBe(addMonths(expectedFirst, 9).toISOString().slice(0, 10));
    expect(rows.every((r) => r.dueOn.getUTCDate() === 1)).toBe(true);
  });

  it('does not count an unpaid instalment as earned', async () => {
    const userId = await qualifyForRank1();
    await evaluateRank(userId);

    const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    // totalEarned must reflect money received, not money promised.
    expect(money(u.totalEarned.toString()).eq(money(0))).toBe(true);
  });
});

describe('the monthly run', () => {
  beforeEach(() => setSetting('REWARD_VESTING_MONTHS', 10));

  it('pays only what has come due', async () => {
    const userId = await qualifyForRank1();
    await evaluateRank(userId);
    const rows = await instalmentsFor(userId);

    // Stand on the first due date: exactly one instalment is payable.
    const res = await runRewardVesting(rows[0].dueOn);
    expect(res.paid).toBe(1);
    expect(await balanceOf(userId)).toBeCloseTo(30, 6);

    const after = await instalmentsFor(userId);
    expect(after.filter((r) => r.paidAt).length).toBe(1);
  });

  it('pays nothing before the first due date', async () => {
    const userId = await qualifyForRank1();
    await evaluateRank(userId);

    const res = await runRewardVesting(new Date());
    expect(res.paid).toBe(0);
    expect(await balanceOf(userId)).toBeCloseTo(0, 6);
  });

  it('pays once when the job runs twice on the same day', async () => {
    const userId = await qualifyForRank1();
    await evaluateRank(userId);
    const rows = await instalmentsFor(userId);

    await runRewardVesting(rows[0].dueOn);
    const second = await runRewardVesting(rows[0].dueOn);

    expect(second.paid).toBe(0);
    expect(await balanceOf(userId)).toBeCloseTo(30, 6);
    const entries = await prisma.ledgerEntry.count({
      where: { userId, category: 'RANK_BONUS' },
    });
    expect(entries).toBe(1);
  });

  it('survives two runs firing at the same instant', async () => {
    const userId = await qualifyForRank1();
    await evaluateRank(userId);
    const rows = await instalmentsFor(userId);

    await Promise.all([runRewardVesting(rows[0].dueOn), runRewardVesting(rows[0].dueOn)]);

    expect(await balanceOf(userId)).toBeCloseTo(30, 6);
    expect(await prisma.ledgerEntry.count({ where: { userId, category: 'RANK_BONUS' } })).toBe(1);
  });

  it('catches up every month it missed in one run', async () => {
    const userId = await qualifyForRank1();
    await evaluateRank(userId);
    const rows = await instalmentsFor(userId);

    // The job did not run for three months. Standing on the third due date,
    // all three arrears are payable.
    const res = await runRewardVesting(rows[2].dueOn);
    expect(res.paid).toBe(3);
    expect(await balanceOf(userId)).toBeCloseTo(90, 6);
  });

  it('pays the whole reward across the full schedule and then stops', async () => {
    const userId = await qualifyForRank1();
    await evaluateRank(userId);
    const rows = await instalmentsFor(userId);

    await runRewardVesting(rows[9].dueOn);
    expect(await balanceOf(userId)).toBeCloseTo(300, 6);

    // Nothing left to pay, however often it runs.
    const again = await runRewardVesting(addMonths(rows[9].dueOn, 6));
    expect(again.paid).toBe(0);
    expect(await balanceOf(userId)).toBeCloseTo(300, 6);
  });

  it('counts each instalment as earned only when it lands', async () => {
    const userId = await qualifyForRank1();
    await evaluateRank(userId);
    const rows = await instalmentsFor(userId);

    await runRewardVesting(rows[1].dueOn);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(money(u.totalEarned.toString()).eq(money('60'))).toBe(true);
  });
});

describe('a member who is not active', () => {
  beforeEach(() => setSetting('REWARD_VESTING_MONTHS', 10));

  it('is skipped, and the instalment stays due', async () => {
    const userId = await qualifyForRank1();
    await evaluateRank(userId);
    const rows = await instalmentsFor(userId);

    await prisma.user.update({ where: { id: userId }, data: { status: 'SUSPENDED' } });
    const res = await runRewardVesting(rows[0].dueOn);

    expect(res.paid).toBe(0);
    expect(res.skippedInactive).toBe(1);
    expect(await balanceOf(userId)).toBeCloseTo(0, 6);

    // Nothing is forfeited — the row is still unpaid and still due.
    const after = await instalmentsFor(userId);
    expect(after[0].paidAt).toBeNull();
  });

  it('is paid the arrears once reinstated', async () => {
    const userId = await qualifyForRank1();
    await evaluateRank(userId);
    const rows = await instalmentsFor(userId);

    await prisma.user.update({ where: { id: userId }, data: { status: 'SUSPENDED' } });
    await runRewardVesting(rows[1].dueOn);
    expect(await balanceOf(userId)).toBeCloseTo(0, 6);

    await prisma.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } });
    const res = await runRewardVesting(rows[1].dueOn);

    expect(res.paid).toBe(2);
    expect(await balanceOf(userId)).toBeCloseTo(60, 6);
  });
});

describe('changing the setting mid-flight', () => {
  it('leaves a schedule already running exactly as promised', async () => {
    await setSetting('REWARD_VESTING_MONTHS', 10);
    const userId = await qualifyForRank1();
    await evaluateRank(userId);

    const before = await instalmentsFor(userId);
    expect(before).toHaveLength(10);

    // The operator halves it. A member already promised ten payments keeps ten.
    await setSetting('REWARD_VESTING_MONTHS', 5);

    const after = await instalmentsFor(userId);
    expect(after).toHaveLength(10);
    expect(after.every((r) => r.ofTotal === 10)).toBe(true);
    expect(after.map((r) => r.amount.toString())).toEqual(before.map((r) => r.amount.toString()));
  });

  it('applies the new count to the next member who qualifies', async () => {
    await setSetting('REWARD_VESTING_MONTHS', 5);
    const userId = await qualifyForRank1();
    await evaluateRank(userId);

    const rows = await instalmentsFor(userId);
    expect(rows).toHaveLength(5);
    expect(rows.reduce((a, r) => a.add(money(r.amount.toString())), money(0)).eq(money('300')))
      .toBe(true);
  });
});
