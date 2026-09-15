import { prisma } from '../../core/db.js';
import { config } from '../../core/runtime-config.js';
import { nextPayoutDate } from '../../core/payout-calendar.js';
import { chainState } from '../../core/chain/config.js';

/**
 * The published plan, as the platform actually enforces it.
 *
 * Every figure the member app and the public site show used to be a hardcoded
 * constant duplicating what the settings table and the catalogue hold. That is
 * not a cosmetic problem: change the withdrawal fee in the console and the
 * member's own form would still show the old one, quote them a net amount that
 * never arrives, and the terms of service page would still state the old figure
 * too. A marketing page that drifts from the engine is how a business ends up
 * promising something it does not pay.
 *
 * So there is one source, and it is this. Settings come from the same
 * `runtime-config` the money paths read; packages, commission rules, ranks and
 * tiers come from the same tables the engine walks.
 *
 * Public and unauthenticated on purpose — a visitor deciding whether to join
 * needs the terms as much as a member does. Only settings explicitly marked
 * `public` in the spec are included, so an operator setting cannot leak by
 * being forgotten in a list somewhere.
 */

/** Cached briefly. Read by every page load, and it changes rarely. */
const TTL_MS = 30_000;
let cache: { at: number; value: PublicConfig } | null = null;

export const invalidatePublicConfig = () => { cache = null; };

export interface PublicConfig {
  /** The genealogy the compensation plan runs on. */
  planStructure: 'UNILEVEL' | 'BINARY';
  platform: {
    registrationOpen: boolean;
    maintenanceMode: boolean;
    maintenanceMessage: string | null;
    depositsAutomatic: boolean;
  };
  returns: {
    dailyPercent: number;
    tradingDays: number[];
    tradingDaysLabel: string;
    capPassivePercent: number;
    capActivePercent: number;
  };
  investment: { minimum: number };
  withdrawal: {
    open: boolean;
    feePercent: number;
    taxPercent: number;
    minimum: number;
    maximum: number;
    slaHours: number;
    /** Days of the month payouts settle on. Empty means continuous. */
    payoutDays: number[];
    /** ISO date of the next settlement, or null when continuous. */
    nextPayoutDate: string | null;
    network: string;
    kycRequired: boolean;
    kycRequiredAbove: number;
  };
  packages: { id: string; name: string; amount: string; dailyRoiPercent: string; capPercent: string }[];
  directBonus: { level: number; percent: string }[];
  generationBonus: { level: number; percent: string; requiredDirects: number; requiredTeamVolume: string }[];
  ranks: { code: string; name: string; selfCapital: string; teamBusiness: string; reward: string }[];
  roamingTiers: { track: string; destination: string; selfRequirement: string; teamRequirement: string ;
    rewardLabel: string | null; rewardValue: string | null;
    validFrom: Date | null; validUntil: Date | null; }[];
  rewardTiers: { name: string; threshold: string; bonusPercent: string; maxBonus: string }[];
}

const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** "Monday to Friday" when contiguous, otherwise a plain list. */
function describeDays(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  if (!sorted.length) return 'No trading days';
  if (sorted.length === 1) return DAY_NAMES[sorted[0]!]!;

  const contiguous = sorted.every((d, i) => i === 0 || d === sorted[i - 1]! + 1);
  if (contiguous) return `${DAY_NAMES[sorted[0]!]} to ${DAY_NAMES[sorted.at(-1)!]}`;

  const names = sorted.map((d) => DAY_NAMES[d]!);
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

export async function publicConfig(): Promise<PublicConfig> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;

  const cfg = await config();
  const [packages, commissionRules, ranks, roamingTiers, rewardTiers] = await Promise.all([
    prisma.packagePlan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true, amount: true, dailyRoiPercent: true, capPercent: true },
    }),
    prisma.commissionRule.findMany({
      where: { isActive: true },
      orderBy: [{ kind: 'asc' }, { level: 'asc' }],
      select: { kind: true, level: true, percent: true, requiredDirects: true, requiredTeamVolume: true },
    }),
    prisma.rankDefinition.findMany({
      orderBy: { sortOrder: 'asc' },
      select: { code: true, name: true, selfCapital: true, teamBusiness: true, reward: true },
    }),
    /* Active only. This filter was missing while every other catalogue query
       beside it had one, so switching an offer off left it published on the
       public site and the member page — the operator's decision applied
       everywhere except the two places a member actually looks. */
    prisma.roamingClubTier.findMany({
      where: { isActive: true },
      orderBy: [{ track: 'asc' }, { sortOrder: 'asc' }, { teamRequirement: 'asc' }],
      select: {
        track: true, destination: true, selfRequirement: true, teamRequirement: true,
        rewardLabel: true, rewardValue: true, validFrom: true, validUntil: true,
      },
    }),
    prisma.rewardTier.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { name: true, threshold: true, bonusPercent: true, maxBonus: true },
    }),
  ]);

  const value: PublicConfig = {
    planStructure: cfg.planStructure,
    platform: {
      registrationOpen: cfg.registrationOpen,
      maintenanceMode: cfg.maintenanceMode,
      // Only sent while it is on — an unused message is not the visitor's business.
      maintenanceMessage: cfg.maintenanceMode ? cfg.maintenanceMessage : null,
      // Whether a member gets their own deposit address or has to report one.
      depositsAutomatic: chainState().canWatch,
    },
    returns: {
      dailyPercent: cfg.dailyRoiPercent,
      tradingDays: cfg.tradingDays,
      tradingDaysLabel: describeDays(cfg.tradingDays),
      capPassivePercent: cfg.capPassivePercent,
      capActivePercent: cfg.capActivePercent,
    },
    investment: { minimum: cfg.minInvestment },
    withdrawal: {
      open: cfg.withdrawalsOpen,
      feePercent: cfg.withdrawFeePercent,
      taxPercent: cfg.taxWithholdingPercent,
      minimum: cfg.withdrawMin,
      maximum: cfg.withdrawMax,
      slaHours: cfg.withdrawSlaHours,
      payoutDays: cfg.withdrawalPayoutDays,
      nextPayoutDate: nextPayoutDate(cfg.withdrawalPayoutDays)?.toISOString().slice(0, 10) ?? null,
      network: 'USDT · BEP-20',
      kycRequired: cfg.kycRequiredForWithdrawal,
      kycRequiredAbove: cfg.kycRequiredAbove,
    },
    packages: packages.map((p) => ({
      id: p.id, name: p.name,
      amount: p.amount.toString(),
      dailyRoiPercent: p.dailyRoiPercent.toString(),
      capPercent: p.capPercent.toString(),
    })),
    directBonus: commissionRules
      .filter((r) => r.kind === 'DIRECT')
      .map((r) => ({ level: r.level, percent: r.percent.toString() })),
    generationBonus: commissionRules
      .filter((r) => r.kind === 'GENERATION')
      .map((r) => ({
        level: r.level,
        percent: r.percent.toString(),
        requiredDirects: r.requiredDirects,
        requiredTeamVolume: r.requiredTeamVolume.toString(),
      })),
    ranks: ranks.map((r) => ({
      code: r.code, name: r.name,
      selfCapital: r.selfCapital.toString(),
      teamBusiness: r.teamBusiness.toString(),
      reward: r.reward.toString(),
    })),
    roamingTiers: roamingTiers.map((t) => ({
      track: t.track,
      destination: t.destination,
      selfRequirement: t.selfRequirement.toString(),
      teamRequirement: t.teamRequirement.toString(),
      rewardLabel: t.rewardLabel,
      rewardValue: t.rewardValue?.toString() ?? null,
      validFrom: t.validFrom,
      validUntil: t.validUntil,
    })),
    rewardTiers: rewardTiers.map((t) => ({
      name: t.name,
      threshold: t.threshold.toString(),
      bonusPercent: t.bonusPercent.toString(),
      maxBonus: t.maxBonus.toString(),
    })),
  };

  cache = { at: Date.now(), value };
  return value;
}
