import { prisma, type Tx } from '../../core/db.js';
import { money } from '../../core/money.js';

/**
 * Affiliate offers (FortuneX offers slide).
 *
 * These replaced the Flyers Club. The tier and award tables are the same ones —
 * they already carried award tracking, the operator fulfilment queue and the
 * member progress page, and no award had ever been granted, so the machinery
 * was reused rather than rebuilt beside an identical copy of itself.
 *
 * Two things changed in the rules:
 *
 *  1. **A window.** Offers run between `validFrom` and `validUntil`. The club
 *     ran forever, which is right for a standing benefit and wrong for a
 *     promotion — an offer with no end date is a liability nobody decided to
 *     take on, and it would keep paying out long after the campaign closed.
 *
 *  2. **One qualifying figure.** The club split self capital and team
 *     business; the offers publish a single amount, measured against team
 *     business. `selfRequirement` stays on the model and is still enforced, so
 *     an operator can add a self-capital condition without a schema change,
 *     but the published offers leave it at zero.
 *
 * Awards remain entitlements rather than cash: nothing is posted to the ledger,
 * and they sit outside the earnings cap. Fulfilment stays an operator workflow,
 * which is the only sane handling for "four days in Lakshadweep".
 */

/**
 * Whether an offer can be earned right now.
 *
 * Enforced here, at the moment an award would be created — not merely hidden in
 * the UI. A member who qualifies the day after a campaign closes must not be
 * granted it because a page was cached, and the check has to hold for anything
 * that calls `evaluate`, including a backfill.
 */
const isOpen = (tier: { validFrom: Date | null; validUntil: Date | null }, now: Date) => {
  if (tier.validFrom && now < tier.validFrom) return false;
  if (tier.validUntil && now > tier.validUntil) return false;
  return true;
};

export async function evaluate(userId: string, db: Tx = prisma) {
  const [user, tv, tiers, existing] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { totalInvested: true, status: true } }),
    db.teamVolume.findUnique({ where: { userId } }),
    db.roamingClubTier.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
    db.roamingClubAward.findMany({ where: { userId }, select: { tierId: true } }),
  ]);
  if (!user || user.status !== 'ACTIVE') return [];

  const now = new Date();
  const have = new Set(existing.map((e) => e.tierId));
  const self = money(user.totalInvested.toString());
  const team = money(tv?.totalTeamBusiness?.toString() ?? 0);
  const won: string[] = [];

  for (const tier of tiers) {
    if (have.has(tier.id)) continue;
    if (!isOpen(tier, now)) continue;
    if (self.lt(money(tier.selfRequirement.toString()))) continue;
    if (tier.track === 'AFFILIATE' && team.lt(money(tier.teamRequirement.toString()))) continue;

    await db.roamingClubAward.create({ data: { userId, tierId: tier.id } });
    won.push(tier.destination);
  }
  return won;
}

export async function progress(userId: string) {
  const [user, tv, tiers, awards] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { totalInvested: true } }),
    prisma.teamVolume.findUnique({ where: { userId } }),
    prisma.roamingClubTier.findMany({ where: { isActive: true }, orderBy: [{ track: 'asc' }, { sortOrder: 'asc' }] }),
    prisma.roamingClubAward.findMany({ where: { userId } }),
  ]);

  const now = new Date();
  const won = new Map(awards.map((a) => [a.tierId, a]));
  const self = money(user?.totalInvested?.toString() ?? 0);
  const team = money(tv?.totalTeamBusiness?.toString() ?? 0);

  return tiers.map((t) => ({
    track: t.track,
    destination: t.destination,
    rewardLabel: t.rewardLabel,
    rewardValue: t.rewardValue?.toString() ?? null,
    selfRequirement: t.selfRequirement.toString(),
    teamRequirement: t.teamRequirement.toString(),
    selfActual: self.toString(),
    teamActual: team.toString(),
    validFrom: t.validFrom,
    validUntil: t.validUntil,
    /**
     * Reported per offer rather than left for the client to work out.
     *
     * An offer that has closed still shows — a member who earned it keeps it,
     * and one who did not should see why the bar stopped moving rather than
     * find the row silently gone.
     */
    open: isOpen(t, now),
    expired: Boolean(t.validUntil && now > t.validUntil),
    upcoming: Boolean(t.validFrom && now < t.validFrom),
    achieved: won.has(t.id),
    achievedAt: won.get(t.id)?.achievedAt ?? null,
    status: won.get(t.id)?.status ?? null,
  }));
}
