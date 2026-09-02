export interface Pkg {
  id: string; name: string; amount: string; dailyRoiPercent: string;
  capPercent: string; sortOrder: number; isActive: boolean;
}
export interface Rule {
  id: string; kind: 'DIRECT' | 'GENERATION'; level: number; percent: string;
  requiredDirects: number; requiredTeamVolume: string; isActive: boolean;
}
export interface Rank {
  id: string; code: string; name: string; level: number;
  selfCapital: string; teamBusiness: string; reward: string; isActive: boolean;
}
export interface RewardTier {
  id: string; name: string; threshold: string; bonusPercent: string;
  maxBonus: string; isActive: boolean;
}
export interface Tier {
  id: string; track: string; destination: string;
  selfRequirement: string; teamRequirement: string;
}
export interface Award {
  id: string; userCode: string; email: string; track: string; destination: string;
  status: string; notes: string | null; achievedAt: string; fulfilledAt: string | null;
}
export interface Achievement {
  id: string; userCode: string; rank: string; rankLevel: number | null;
  reward: string; achievedAt: string;
}

/**
 * A plan's lifetime ceiling — capital × earn limit.
 *
 * Integer cents on both sides of the multiply, so the figure shown is the one
 * the ledger will enforce rather than a float that drifts a cent at the top
 * tier. This is the number an operator is actually committing to when they set
 * a cap, and it was nowhere on the screen before.
 */
export function ceilingUsd(amount: string, capPercent: string): number | null {
  const a = Number(amount);
  const c = Number(capPercent);
  if (!Number.isFinite(a) || !Number.isFinite(c) || a < 0 || c < 0) return null;
  return (Math.round(a * 100) * Math.round(c * 100)) / 1_000_000;
}

/** Trading days for a plan to reach its ceiling at the configured daily rate. */
export function daysToCap(capPercent: string, dailyPercent: string): number | null {
  const c = Number(capPercent);
  const d = Number(dailyPercent);
  if (!Number.isFinite(c) || !Number.isFinite(d) || d <= 0) return null;
  return Math.ceil(c / d);
}
