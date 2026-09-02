/**
 * Seeds the FortuneX compensation plan exactly as specified in Doc/FortuneX.pdf.
 * Idempotent — safe to re-run.
 */
import 'dotenv/config';
import { PrismaClient, type CommissionKind, type RoamingTrack } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

/** p12 — the ten investment tiers. 0.5% daily (p10), 250% cap for PASSIVE (p18). */
const PACKAGES = [110, 270, 530, 1100, 2650, 5300, 10500, 26100, 52200, 104300];

/** p11 — direct sponsor bonus, 5% split across three levels. */
const DIRECT_RULES = [
  { level: 1, percent: 4 },
  { level: 2, percent: 0.5 },
  { level: 3, percent: 0.5 },
];

/**
 * p13 — generation bonus across 30 levels, with per-band qualification on
 * active directs and accumulated team volume.
 */
const GENERATION_BANDS = [
  { from: 1,  to: 1,  percent: 13,  directs: 0,  volume: 0 },
  { from: 2,  to: 2,  percent: 8,   directs: 2,  volume: 1_000 },
  { from: 3,  to: 5,  percent: 5,   directs: 6,  volume: 6_000 },
  { from: 6,  to: 10, percent: 2,   directs: 8,  volume: 12_000 },
  { from: 11, to: 20, percent: 1,   directs: 15, volume: 30_000 },
  { from: 21, to: 30, percent: 0.5, directs: 18, volume: 60_000 },
];

/** p14 — executive rank ladder. */
const RANKS = [
  { code: 'STARTER',   name: 'Starter',   level: 1,  self: 300,    team: 5_000,     reward: 300 },
  { code: 'SILVER',    name: 'Silver',    level: 2,  self: 500,    team: 25_000,    reward: 1_000 },
  { code: 'BRONZE',    name: 'Bronze',    level: 3,  self: 1_000,  team: 75_000,    reward: 2_000 },
  { code: 'GOLD',      name: 'Gold',      level: 4,  self: 1_500,  team: 150_000,   reward: 5_000 },
  { code: 'PLATINUM',  name: 'Platinum',  level: 5,  self: 2_000,  team: 250_000,   reward: 7_500 },
  { code: 'DIAMOND',   name: 'Diamond',   level: 6,  self: 2_500,  team: 500_000,   reward: 15_000 },
  { code: 'ELITE',     name: 'Elite',     level: 7,  self: 3_000,  team: 750_000,   reward: 30_000 },
  { code: 'MASTER',    name: 'Master',    level: 8,  self: 5_000,  team: 1_500_000, reward: 75_000 },
  { code: 'CHAMPION',  name: 'Champion',  level: 9,  self: 7_500,  team: 3_000_000, reward: 150_000 },
  { code: 'LEGEND',    name: 'Legend',    level: 10, self: 10_000, team: 5_000_000, reward: 250_000 },
];

/** p16 / p17 — Flyers Club, two tracks. */
const ROAMING = [
  { track: 'AFFILIATE',       destination: 'Thailand',  self: 500,    team: 3_000 },
  { track: 'AFFILIATE',       destination: 'Malaysia',  self: 1_000,  team: 6_000 },
  { track: 'AFFILIATE',       destination: 'Dubai',     self: 2_000,  team: 9_000 },
  { track: 'AFFILIATE',       destination: 'Singapore', self: 3_000,  team: 12_000 },
  { track: 'AFFILIATE',       destination: 'Europe',    self: 5_000,  team: 15_000 },
  { track: 'SELF_CAPITALIST', destination: 'Thailand',  self: 5_000,  team: 0 },
  { track: 'SELF_CAPITALIST', destination: 'Malaysia',  self: 7_500,  team: 0 },
  { track: 'SELF_CAPITALIST', destination: 'Dubai',     self: 10_000, team: 0 },
  { track: 'SELF_CAPITALIST', destination: 'Singapore', self: 15_000, team: 0 },
  { track: 'SELF_CAPITALIST', destination: 'Europe',    self: 25_000, team: 0 },
];

async function main() {
  // ── packages ──
  for (const [i, amount] of PACKAGES.entries()) {
    const name = `FortuneX Plan ${i + 1}`;
    const existing = await prisma.packagePlan.findFirst({ where: { name } });
    const data = {
      name,
      amount: String(amount),
      dailyRoiPercent: '0.5',
      capPercent: '250',
      sortOrder: i + 1,
      isActive: true,
    };
    if (existing) await prisma.packagePlan.update({ where: { id: existing.id }, data });
    else await prisma.packagePlan.create({ data });
  }

  // ── direct sponsor rules ──
  for (const r of DIRECT_RULES) {
    await prisma.commissionRule.upsert({
      where: { kind_level: { kind: 'DIRECT' as CommissionKind, level: r.level } },
      create: { kind: 'DIRECT', level: r.level, percent: String(r.percent) },
      update: { percent: String(r.percent), isActive: true },
    });
  }

  // ── generation rules, expanded from bands to 30 discrete levels ──
  for (const band of GENERATION_BANDS) {
    for (let level = band.from; level <= band.to; level++) {
      await prisma.commissionRule.upsert({
        where: { kind_level: { kind: 'GENERATION' as CommissionKind, level } },
        create: {
          kind: 'GENERATION', level,
          percent: String(band.percent),
          requiredDirects: band.directs,
          requiredTeamVolume: String(band.volume),
        },
        update: {
          percent: String(band.percent),
          requiredDirects: band.directs,
          requiredTeamVolume: String(band.volume),
          isActive: true,
        },
      });
    }
  }

  // ── ranks ──
  for (const r of RANKS) {
    await prisma.rankDefinition.upsert({
      where: { code: r.code },
      create: {
        code: r.code, name: r.name, level: r.level,
        selfCapital: String(r.self), teamBusiness: String(r.team),
        reward: String(r.reward), sortOrder: r.level,
      },
      update: {
        name: r.name, selfCapital: String(r.self),
        teamBusiness: String(r.team), reward: String(r.reward), isActive: true,
      },
    });
  }

  // ── flyers club ──
  for (const [i, t] of ROAMING.entries()) {
    await prisma.roamingClubTier.upsert({
      where: { track_destination: { track: t.track as RoamingTrack, destination: t.destination } },
      create: {
        track: t.track as RoamingTrack, destination: t.destination,
        selfRequirement: String(t.self), teamRequirement: String(t.team), sortOrder: i + 1,
      },
      update: {
        selfRequirement: String(t.self), teamRequirement: String(t.team), isActive: true,
      },
    });
  }

  // Admin accounts live in seed-rbac.ts — they need a role relation, which
  // only exists once permissions and roles are seeded. `npm run db:seed` runs
  // both, in that order.

  const counts = {
    packages: await prisma.packagePlan.count(),
    directRules: await prisma.commissionRule.count({ where: { kind: 'DIRECT' } }),
    generationRules: await prisma.commissionRule.count({ where: { kind: 'GENERATION' } }),
    ranks: await prisma.rankDefinition.count(),
    roamingTiers: await prisma.roamingClubTier.count(),
  };
  console.log('Seed complete:', counts);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
