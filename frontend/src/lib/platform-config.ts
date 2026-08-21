import * as fallback from './plan';

/**
 * The shape of the published plan, and the values this build shipped with.
 *
 * Deliberately free of a `'use client'` directive: both the client hook and the
 * server fetcher import it, and a client-boundary module's exports are not
 * reliably available during a server render — which showed up as the whole
 * static build failing when the API was not running.
 */

export interface PlatformConfig {
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
    open: boolean; feePercent: number; taxPercent: number;
    minimum: number; maximum: number; slaHours: number; network: string;
    kycRequired: boolean; kycRequiredAbove: number;
  };
  packages: { id: string; name: string; amount: string; dailyRoiPercent: string; capPercent: string }[];
  directBonus: { level: number; percent: string }[];
  generationBonus: { level: number; percent: string; requiredDirects: number; requiredTeamVolume: string }[];
  ranks: { code: string; name: string; selfCapital: string; teamBusiness: string; reward: string }[];
  roamingTiers: { track: string; destination: string; selfRequirement: string; teamRequirement: string }[];
  rewardTiers: { name: string; threshold: string; bonusPercent: string; maxBonus: string }[];
}

/**
 * What this build shipped with.
 *
 * Used until the live config arrives, and as a floor when the API cannot be
 * reached — during a static build, or if it is briefly down. A page rendering
 * the deployed defaults is far better than one that fails to render: those
 * defaults are what the server is running unless an operator has changed them.
 */
export const DEPLOY_DEFAULTS: PlatformConfig = {
  platform: {
    registrationOpen: true,
    maintenanceMode: false,
    maintenanceMessage: null,
    depositsAutomatic: false,
  },
  returns: {
    dailyPercent: fallback.DAILY_RETURN_PERCENT,
    tradingDays: [1, 2, 3, 4, 5],
    tradingDaysLabel: fallback.TRADING_DAYS,
    capPassivePercent: fallback.CAP_PASSIVE_PERCENT,
    capActivePercent: fallback.CAP_ACTIVE_PERCENT,
  },
  investment: { minimum: 50 },
  withdrawal: {
    open: true,
    feePercent: fallback.WITHDRAW.feePercent,
    taxPercent: 0,
    minimum: fallback.WITHDRAW.min,
    maximum: fallback.WITHDRAW.max,
    slaHours: fallback.WITHDRAW.slaHours,
    network: fallback.WITHDRAW.network,
    kycRequired: true,
    kycRequiredAbove: 0,
  },
  packages: fallback.PACKAGES.map((amount, i) => ({
    id: `fallback-${i}`,
    name: `Plan ${i + 1}`,
    amount: String(amount),
    dailyRoiPercent: String(fallback.DAILY_RETURN_PERCENT),
    capPercent: String(fallback.CAP_PASSIVE_PERCENT),
  })),
  directBonus: fallback.DIRECT_BONUS.map((d) => ({ level: d.level, percent: String(d.percent) })),
  generationBonus: fallback.GENERATION_BANDS.flatMap((b) => {
    // The fallback publishes bands; the live config publishes levels. Expand so
    // both sides of the boundary speak the same shape.
    const [from, to] = b.levels.split(' – ').map(Number);
    const last = to ?? from!;
    return Array.from({ length: last - from! + 1 }, (_, i) => ({
      level: from! + i,
      percent: String(b.percent),
      requiredDirects: b.directs,
      requiredTeamVolume: String(b.volume),
    }));
  }),
  ranks: fallback.RANKS.map((r) => ({
    code: r.name.toUpperCase(),
    name: r.name,
    selfCapital: String(r.self),
    teamBusiness: String(r.team),
    reward: String(r.reward),
  })),
  roamingTiers: [
    ...fallback.ROAMING.affiliate.map((t) => ({
      track: 'AFFILIATE', destination: t.destination,
      selfRequirement: String(t.self), teamRequirement: String(t.team),
    })),
    ...fallback.ROAMING.selfCapitalist.map((t) => ({
      track: 'SELF_CAPITALIST', destination: t.destination,
      selfRequirement: String(t.self),
      // The self-capitalist track qualifies on own capital alone — no team
      // requirement, which the source data expresses by omitting the field.
      teamRequirement: '0',
    })),
  ],
  rewardTiers: [],
};
