import { prisma } from './db.js';

/**
 * Which genealogy the compensation plan runs on.
 *
 * This is the one setting that cannot be changed once the platform has a
 * downline, and the reason is structural rather than administrative:
 *
 *   Unilevel pays by LEVEL down a sponsor tree of unlimited width. A member's
 *   position is implied by who referred them — nothing else is stored.
 *
 *   Binary pays on the WEAKER of exactly two legs, which means every member
 *   needs a placement (a parent and a left/right slot) decided when they join.
 *
 * Switching after a tree exists would mean inventing placements for people who
 * never had one, which silently rewrites what everybody has earned. So the
 * platform makes the choice once, before the first downline forms, and then
 * refuses to move.
 */

export type PlanStructureCode = 'UNILEVEL' | 'BINARY';

export interface PlanStructureInfo {
  code: PlanStructureCode;
  label: string;
  /** One line, for the selector card. */
  summary: string;
  /** What an operator is actually choosing. Shown under the card. */
  detail: string;
  /** Concrete consequences, listed in the console before confirming. */
  effects: string[];
  /**
   * Whether the payout engine can actually run this plan today.
   *
   * Offering a structure the engine cannot pay would be a switch with a broken
   * position — the console would promise commissions that never arrive. Until
   * the binary engine exists (placement, pay-leg calculation, carryover), the
   * option is visible but not selectable.
   */
  implemented: boolean;
}

export const PLAN_STRUCTURES: Record<PlanStructureCode, PlanStructureInfo> = {
  UNILEVEL: {
    code: 'UNILEVEL',
    label: 'Unilevel',
    summary: 'Unlimited width, paid down a fixed number of levels.',
    detail:
      'Every member you refer sits directly beneath you, however many you refer. '
      + 'Commission is paid per level — each level has its own rate, unlocked by '
      + 'direct referrals and team volume.',
    effects: [
      'New members attach directly to whoever referred them — no placement step at signup.',
      'Generation bonus pays by level, using the commission rules in Payouts.',
      'Rank qualification uses the 50:50 rule — half the required team volume from the strongest leg, half from the rest.',
      'No spillover: a member only benefits from people beneath them in their own tree.',
    ],
    implemented: true,
  },
  BINARY: {
    code: 'BINARY',
    label: 'Binary',
    summary: 'Exactly two legs, paid on the weaker leg with carryover.',
    detail:
      'Every member holds two positions, left and right. A third recruit is placed '
      + 'further down the tree, so volume spills over into the downline. Commission '
      + 'is a percentage of the weaker leg; the stronger leg’s surplus carries forward.',
    effects: [
      'Signup gains a placement step — each member is assigned a parent and a left/right slot.',
      'Commission is calculated on the weaker leg. The existing per-level generation rules stop applying.',
      'Unmatched volume on the stronger leg is banked as carryover between cycles.',
      'Spillover means an upline’s overflow can land in your legs.',
    ],
    implemented: true,
  },
};

export const PLAN_STRUCTURE_CODES = Object.keys(PLAN_STRUCTURES) as PlanStructureCode[];

export const isPlanStructure = (v: string): v is PlanStructureCode =>
  Object.prototype.hasOwnProperty.call(PLAN_STRUCTURES, v);

export interface PlanLockState {
  locked: boolean;
  /** Plain-language reason, for the console. Null while still open. */
  reason: string | null;
  /** Members who joined under a sponsor. This is what closes the door. */
  sponsoredMembers: number;
  /** When the first sponsored member joined — the moment it locked. */
  lockedAt: Date | null;
}

/**
 * Simulation accounts are excluded on purpose.
 *
 * The simulation tool exists to model a plan before launch, and it writes real
 * rows. If those counted, running a simulation would lock the very setting the
 * simulation was meant to help decide.
 */
const REAL_MEMBERS = { email: { not: { endsWith: '@simulation.invalid' } } } as const;

/**
 * Whether the plan structure may still be changed.
 *
 * The trigger is the first member who joined under a SPONSOR, not the first
 * member overall: a lone root account has no downline, so no genealogy exists
 * to be rewritten and nothing has been promised to anyone yet.
 */
export async function planLockState(): Promise<PlanLockState> {
  const [sponsoredMembers, first] = await Promise.all([
    prisma.user.count({ where: { ...REAL_MEMBERS, sponsorId: { not: null } } }),
    prisma.user.findFirst({
      where: { ...REAL_MEMBERS, sponsorId: { not: null } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
  ]);

  if (sponsoredMembers === 0) {
    return { locked: false, reason: null, sponsoredMembers: 0, lockedAt: null };
  }

  return {
    locked: true,
    reason:
      `${sponsoredMembers} member${sponsoredMembers === 1 ? ' has' : 's have'} already joined under a sponsor. `
      + 'Changing the plan structure now would require inventing a placement for each of them, '
      + 'which would rewrite what they have earned.',
    sponsoredMembers,
    lockedAt: first?.createdAt ?? null,
  };
}
