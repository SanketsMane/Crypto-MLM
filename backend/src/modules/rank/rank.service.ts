import { prisma, type Tx } from '../../core/db.js';
import { postEntry } from '../../core/ledger.js';
import { money, toDb, type Money } from '../../core/money.js';
import { deterministicReference } from '../../core/reference.js';
import { recalculate } from '../team/team.service.js';
import { logger } from '../../core/logger.js';
import { notifyMember } from '../../core/notify.js';
import { config } from '../../core/runtime-config.js';
import { scheduleReward } from './reward-vesting.service.js';

/**
 * Executive rank ladder — ten ranks, Starter → Legend (FortuneX p14/p15).
 *
 * Qualification:
 *   • self capital  ≥ rank.selfCapital
 *   • team business ≥ rank.teamBusiness, counted 50:50 —
 *       power leg  ≥ 50% of the requirement, AND
 *       other legs ≥ 50% of the requirement
 *
 * "Previous business will be accumulated for the next rank" (p15): volumes are
 * cumulative, so a rank is never lost once achieved and higher ranks build on
 * the same totals. Rewards pay once per rank, guarded by a unique constraint.
 */

export interface RankProgress {
  rankCode: string;
  rankName: string;
  level: number;
  required: { selfCapital: string; teamBusiness: string; powerLegMax: string; otherLegsMin: string };
  actual: { selfCapital: string; teamBusiness: string; powerLeg: string; otherLegs: string };
  achieved: boolean;
  achievedAt: Date | null;
  reward: string;
  percentComplete: number;
}

function meets(
  self: Money, power: Money, others: Money,
  need: { selfCapital: Money; teamBusiness: Money },
): boolean {
  if (self.lt(need.selfCapital)) return false;
  const half = need.teamBusiness.div(2);
  return power.gte(half) && others.gte(half);
}

/**
 * Evaluate a user against every rank and pay any newly-achieved rewards.
 * Safe to call repeatedly — already-achieved ranks are skipped by unique key.
 */
export async function evaluate(userId: string, db: Tx = prisma) {
  const [user, tv, ranks, achieved] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { id: true, totalInvested: true, status: true } }),
    db.teamVolume.findUnique({ where: { userId } }),
    db.rankDefinition.findMany({ where: { isActive: true }, orderBy: { level: 'asc' } }),
    db.rankAchievement.findMany({ where: { userId }, select: { rankId: true } }),
  ]);

  if (!user || user.status !== 'ACTIVE') return [];

  const already = new Set(achieved.map((a) => a.rankId));
  const self = money(user.totalInvested.toString());
  const power = money(tv?.powerLegVolume?.toString() ?? 0);
  const others = money(tv?.otherLegsVolume?.toString() ?? 0);
  const total = money(tv?.totalTeamBusiness?.toString() ?? 0);

  const { rewardVestingMonths: vestingMonths } = await config();

  const newly: string[] = [];

  for (const rank of ranks) {
    if (already.has(rank.id)) continue;

    const need = { selfCapital: money(rank.selfCapital.toString()), teamBusiness: money(rank.teamBusiness.toString()) };
    if (!meets(self, power, others, need)) continue;

    const reward = money(rank.reward.toString());
    const reference = deterministicReference('RANK', userId, rank.code);

    const achievement = await db.rankAchievement.create({
      data: {
        userId, rankId: rank.id,
        teamBusinessAtAchievement: toDb(total),
        powerLegVolume: toDb(power),
        otherLegsVolume: toDb(others),
        rewardAmount: toDb(reward),
        // Only stamped when the money actually moved here. A vested reward is
        // marked paid by its final instalment, not by being promised.
        rewardPaidAt: reward.gt(0) && vestingMonths < 1 ? new Date() : null,
        reference,
      },
    });

    /**
     * Rank rewards sit OUTSIDE the earnings cap — they are a recognition
     * payment, not investment yield. Change here if the client rules otherwise.
     *
     * How it is paid is an operator setting. At zero the reward credits in full
     * the moment it is earned, which is the behaviour this platform shipped
     * with. Above zero it is written as a schedule and the monthly run pays it;
     * nothing is credited here, so a member cannot be paid twice by a config
     * change landing mid-flight.
     */
    if (reward.gt(0)) {
      const scheduled = await scheduleReward(db, {
        achievementId: achievement.id,
        userId,
        reward,
        months: vestingMonths,
        achievedAt: achievement.achievedAt,
      });

      if (scheduled === 0) {
        await postEntry(db, {
          userId, walletType: 'MAIN', direction: 'CREDIT', category: 'RANK_BONUS',
          amount: reward, reference,
          description: `Rank reward — ${rank.name}`,
          meta: { rank: rank.code, teamBusiness: toDb(total), powerLeg: toDb(power), otherLegs: toDb(others) },
          sourceType: 'rank_achievement', sourceId: rank.id,
        });
        await db.$executeRaw`
          UPDATE users SET "totalEarned" = "totalEarned" + ${toDb(reward)}::numeric
           WHERE id = ${userId}`;
      }
    }

    await db.user.update({ where: { id: userId }, data: { currentRankId: rank.id } });
    newly.push(rank.code);

    notifyMember({
      userId,
      type: 'rank.achieved',
      dedupeKey: `rank:${userId}:${rank.code}`,
      title: `${rank.name} achieved`,
      body: reward.lte(0)
        ? `You reached ${rank.name}.`
        : vestingMonths < 1
          ? `You reached ${rank.name} and a $${reward.toString()} reward has been credited to your main wallet.`
          : `You reached ${rank.name}. Your $${reward.toString()} reward will be paid in `
            + `${vestingMonths} monthly instalments, starting on the 1st of next month.`,
      meta: { rank: rank.code, reward: reward.toString() },
    });
  }

  if (newly.length) logger.info({ userId, ranks: newly }, 'rank achieved');
  return newly;
}

/** Full ladder with progress, for the customer-facing rank page. */
export async function progress(userId: string): Promise<RankProgress[]> {
  await recalculate(userId);

  const [user, tv, ranks, achievements] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { totalInvested: true } }),
    prisma.teamVolume.findUnique({ where: { userId } }),
    prisma.rankDefinition.findMany({ where: { isActive: true }, orderBy: { level: 'asc' } }),
    prisma.rankAchievement.findMany({ where: { userId } }),
  ]);

  const byRank = new Map(achievements.map((a) => [a.rankId, a]));
  const self = money(user?.totalInvested?.toString() ?? 0);
  const power = money(tv?.powerLegVolume?.toString() ?? 0);
  const others = money(tv?.otherLegsVolume?.toString() ?? 0);
  const total = money(tv?.totalTeamBusiness?.toString() ?? 0);

  return ranks.map((r) => {
    const half = money(r.teamBusiness.toString()).div(2);
    const got = byRank.get(r.id);
    const pct = money(r.teamBusiness.toString()).gt(0)
      ? Math.min(100, Number(total.div(money(r.teamBusiness.toString())).mul(100).toFixed(2)))
      : 0;

    return {
      rankCode: r.code, rankName: r.name, level: r.level,
      required: {
        selfCapital: r.selfCapital.toString(),
        teamBusiness: r.teamBusiness.toString(),
        powerLegMax: half.toString(),
        otherLegsMin: half.toString(),
      },
      actual: {
        selfCapital: self.toString(), teamBusiness: total.toString(),
        powerLeg: power.toString(), otherLegs: others.toString(),
      },
      achieved: Boolean(got),
      achievedAt: got?.achievedAt ?? null,
      reward: r.reward.toString(),
      percentComplete: pct,
    };
  });
}
