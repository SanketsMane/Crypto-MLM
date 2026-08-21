import { prisma, type Tx } from '../../core/db.js';
import { money } from '../../core/money.js';

/**
 * Roaming Club (FortuneX p16/p17) — two independent tracks:
 *   AFFILIATE        — self capital AND team business
 *   SELF_CAPITALIST  — self capital only
 *
 * Awards are travel entitlements, not cash, so nothing is posted to the ledger
 * and they sit outside the earnings cap (p18). Fulfilment is an admin workflow.
 */
export async function evaluate(userId: string, db: Tx = prisma) {
  const [user, tv, tiers, existing] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { totalInvested: true, status: true } }),
    db.teamVolume.findUnique({ where: { userId } }),
    db.roamingClubTier.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
    db.roamingClubAward.findMany({ where: { userId }, select: { tierId: true } }),
  ]);
  if (!user || user.status !== 'ACTIVE') return [];

  const have = new Set(existing.map((e) => e.tierId));
  const self = money(user.totalInvested.toString());
  const team = money(tv?.totalTeamBusiness?.toString() ?? 0);
  const won: string[] = [];

  for (const tier of tiers) {
    if (have.has(tier.id)) continue;
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

  const won = new Map(awards.map((a) => [a.tierId, a]));
  const self = money(user?.totalInvested?.toString() ?? 0);
  const team = money(tv?.totalTeamBusiness?.toString() ?? 0);

  return tiers.map((t) => ({
    track: t.track,
    destination: t.destination,
    selfRequirement: t.selfRequirement.toString(),
    teamRequirement: t.teamRequirement.toString(),
    selfActual: self.toString(),
    teamActual: team.toString(),
    achieved: won.has(t.id),
    achievedAt: won.get(t.id)?.achievedAt ?? null,
    status: won.get(t.id)?.status ?? null,
  }));
}
