import type { CommissionKind, TxStatus } from '@prisma/client';
import type { Request } from 'express';
import { prisma } from '../../../core/db.js';
import { badRequest, notFound } from '../../../core/errors.js';
import { money, toDb } from '../../../core/money.js';
import { config } from '../../../core/runtime-config.js';
import { invalidatePublicConfig } from '../../config/config.service.js';
import * as audit from '../audit/audit.service.js';

/**
 * The plan itself is data, not code. Packages, the 33 commission rules, ranks
 * and Flyers Club tiers are all editable here so the compensation plan can be
 * tuned without a deploy — every change audited.
 */

// ── packages ──

export const packages = () => prisma.packagePlan.findMany({ orderBy: { sortOrder: 'asc' } });

export async function upsertPackage(
  adminId: string,
  input: { id?: string; name: string; amount: string; dailyRoiPercent: string; capPercent: string; sortOrder?: number; isActive?: boolean },
  req?: Request,
) {
  // Validated here, not at purchase: an operator finds out while editing,
  // instead of members hitting an error on an already-published plan.
  const cfg = await config();
  const amount = money(input.amount);
  if (amount.lte(0)) throw badRequest('Amount must be positive');
  if (amount.lt(cfg.minInvestment)) throw badRequest(`Amount cannot be below the $${cfg.minInvestment} minimum investment`);

  const data = {
    name: input.name,
    amount: toDb(amount),
    dailyRoiPercent: input.dailyRoiPercent,
    capPercent: input.capPercent,
    sortOrder: input.sortOrder ?? 0,
    isActive: input.isActive ?? true,
  };

  // Packages appear on the public plans page, so the cached copy has to go.
  invalidatePublicConfig();

  const before = input.id ? await prisma.packagePlan.findUnique({ where: { id: input.id } }) : null;
  const row = input.id
    ? await prisma.packagePlan.update({ where: { id: input.id }, data })
    : await prisma.packagePlan.create({ data });

  await audit.record({
    adminId, action: input.id ? 'UPDATE' : 'CREATE', entityType: 'package', entityId: row.id,
    summary: `${input.id ? 'Updated' : 'Created'} package ${row.name} — ${row.amount.toString()} @ ${row.dailyRoiPercent.toString()}%/day, cap ${row.capPercent.toString()}%`,
    before: before ? { amount: before.amount.toString(), dailyRoiPercent: before.dailyRoiPercent.toString(), isActive: before.isActive } : undefined,
    after: { amount: row.amount.toString(), dailyRoiPercent: row.dailyRoiPercent.toString(), isActive: row.isActive },
    req,
  });
  return row;
}

// ── commission rules (3 direct + 30 generation) ──

export const commissionRules = () =>
  prisma.commissionRule.findMany({ orderBy: [{ kind: 'asc' }, { level: 'asc' }] });

export async function updateCommissionRule(
  adminId: string,
  input: { kind: CommissionKind; level: number; percent: string; requiredDirects?: number; requiredTeamVolume?: string; isActive?: boolean },
  req?: Request,
) {
  const before = await prisma.commissionRule.findUnique({
    where: { kind_level: { kind: input.kind, level: input.level } },
  });

  const row = await prisma.commissionRule.upsert({
    where: { kind_level: { kind: input.kind, level: input.level } },
    create: {
      kind: input.kind, level: input.level, percent: input.percent,
      requiredDirects: input.requiredDirects ?? 0,
      requiredTeamVolume: input.requiredTeamVolume ?? '0',
      isActive: input.isActive ?? true,
    },
    update: {
      percent: input.percent,
      ...(input.requiredDirects !== undefined ? { requiredDirects: input.requiredDirects } : {}),
      ...(input.requiredTeamVolume !== undefined ? { requiredTeamVolume: input.requiredTeamVolume } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });

  await audit.record({
    adminId, action: 'UPDATE', entityType: 'commission_rule', entityId: row.id,
    summary: `${input.kind} L${input.level}: ${before?.percent?.toString() ?? '—'}% → ${row.percent.toString()}% (directs ${row.requiredDirects}, volume ${row.requiredTeamVolume.toString()})`,
    before: before ? { percent: before.percent.toString(), requiredDirects: before.requiredDirects } : undefined,
    after: { percent: row.percent.toString(), requiredDirects: row.requiredDirects },
    req,
  });
  return row;
}

/**
 * Write several commission rules as one unit.
 *
 * A generation band spans up to ten levels. Sending them one request at a time
 * means a failure halfway leaves the plan inconsistent — levels 11–15 on the new
 * percent, 16–20 still on the old one — and the next payout run would pay a
 * blend of two plans that was never approved. One transaction, so a band either
 * moves whole or does not move at all.
 */
export async function updateCommissionRules(
  adminId: string,
  rules: Array<{
    kind: CommissionKind; level: number; percent: string;
    requiredDirects?: number; requiredTeamVolume?: string; isActive?: boolean;
  }>,
  req?: Request,
) {
  const before = await prisma.commissionRule.findMany({
    where: { OR: rules.map((r) => ({ kind: r.kind, level: r.level })) },
  });
  const priorBy = new Map(before.map((b) => [`${b.kind}-${b.level}`, b]));

  const rows = await prisma.$transaction(
    rules.map((r) =>
      prisma.commissionRule.upsert({
        where: { kind_level: { kind: r.kind, level: r.level } },
        create: {
          kind: r.kind, level: r.level, percent: r.percent,
          requiredDirects: r.requiredDirects ?? 0,
          requiredTeamVolume: r.requiredTeamVolume ?? '0',
          isActive: r.isActive ?? true,
        },
        update: {
          percent: r.percent,
          ...(r.requiredDirects !== undefined ? { requiredDirects: r.requiredDirects } : {}),
          ...(r.requiredTeamVolume !== undefined ? { requiredTeamVolume: r.requiredTeamVolume } : {}),
          ...(r.isActive !== undefined ? { isActive: r.isActive } : {}),
        },
      }),
    ),
  );

  // One audit row per rule, exactly as a single-level edit writes, so the audit
  // trail reads the same whether a level moved alone or inside a band.
  for (const row of rows) {
    const prior = priorBy.get(`${row.kind}-${row.level}`);
    await audit.record({
      adminId, action: 'UPDATE', entityType: 'commission_rule', entityId: row.id,
      summary: `${row.kind} L${row.level}: ${prior?.percent?.toString() ?? '—'}% → ${row.percent.toString()}% (directs ${row.requiredDirects}, volume ${row.requiredTeamVolume.toString()})`,
      before: prior
        ? { percent: prior.percent.toString(), requiredDirects: prior.requiredDirects, requiredTeamVolume: prior.requiredTeamVolume.toString() }
        : undefined,
      after: { percent: row.percent.toString(), requiredDirects: row.requiredDirects, requiredTeamVolume: row.requiredTeamVolume.toString() },
      req,
    });
  }
  return rows;
}

// ── ranks ──

export const ranks = () => prisma.rankDefinition.findMany({ orderBy: { level: 'asc' } });

export async function updateRank(
  adminId: string,
  input: { id: string; selfCapital?: string; teamBusiness?: string; reward?: string; isActive?: boolean },
  req?: Request,
) {
  const before = await prisma.rankDefinition.findUnique({ where: { id: input.id } });
  if (!before) throw notFound('Rank not found');

  const row = await prisma.rankDefinition.update({
    where: { id: input.id },
    data: {
      ...(input.selfCapital !== undefined ? { selfCapital: input.selfCapital } : {}),
      ...(input.teamBusiness !== undefined ? { teamBusiness: input.teamBusiness } : {}),
      ...(input.reward !== undefined ? { reward: input.reward } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });

  await audit.record({
    adminId, action: 'UPDATE', entityType: 'rank', entityId: row.id,
    summary: `Rank ${row.name}: self ${row.selfCapital.toString()}, team ${row.teamBusiness.toString()}, reward ${row.reward.toString()}`,
    before: { selfCapital: before.selfCapital.toString(), teamBusiness: before.teamBusiness.toString(), reward: before.reward.toString() },
    after: { selfCapital: row.selfCapital.toString(), teamBusiness: row.teamBusiness.toString(), reward: row.reward.toString() },
    req,
  });
  return row;
}

/** Who has hit which rank, newest first — the reward side of the plan. */
export async function rankAchievements(opts: { take: number; skip: number }) {
  const [rows, total, agg] = await Promise.all([
    prisma.rankAchievement.findMany({
      orderBy: { achievedAt: 'desc' }, take: opts.take, skip: opts.skip,
      include: { rank: { select: { name: true, code: true, level: true } }, user: { select: { userCode: true, email: true } } },
    }),
    prisma.rankAchievement.count(),
    prisma.rankAchievement.aggregate({ _sum: { rewardAmount: true } }),
  ]);
  return {
    total,
    rewarded: (agg._sum.rewardAmount ?? 0).toString(),
    rows: rows.map((r) => ({
      id: r.id, userCode: r.user.userCode, email: r.user.email,
      rank: r.rank.name, rankCode: r.rank.code, rankLevel: r.rank.level,
      reward: r.rewardAmount.toString(), achievedAt: r.achievedAt,
    })),
  };
}

// ── flyers club ──

export const roamingTiers = () =>
  prisma.roamingClubTier.findMany({ orderBy: [{ track: 'asc' }, { sortOrder: 'asc' }] });

/**
 * The Flyers Club fulfilment queue.
 *
 * Awards are earned automatically; a human still has to book the trip, so each
 * one sits here until an operator marks it fulfilled with a note.
 */
export async function roamingAwards(opts: { take: number; skip: number; status?: TxStatus }) {
  const where = opts.status ? { status: opts.status } : {};
  const [rows, total, pending] = await Promise.all([
    prisma.roamingClubAward.findMany({
      where, orderBy: { achievedAt: 'desc' }, take: opts.take, skip: opts.skip,
      include: { tier: true, user: { select: { userCode: true, email: true } } },
    }),
    prisma.roamingClubAward.count({ where }),
    prisma.roamingClubAward.count({ where: { status: 'PENDING' } }),
  ]);
  return {
    total,
    pending,
    rows: rows.map((a) => ({
      id: a.id, userCode: a.user.userCode, email: a.user.email,
      track: a.tier.track, destination: a.tier.destination,
      selfRequirement: a.tier.selfRequirement.toString(),
      teamRequirement: a.tier.teamRequirement.toString(),
      status: a.status, notes: a.notes,
      achievedAt: a.achievedAt, fulfilledAt: a.fulfilledAt,
    })),
  };
}

export async function fulfilRoamingAward(adminId: string, id: string, notes: string, req?: Request) {
  const award = await prisma.roamingClubAward.findUnique({ where: { id }, include: { tier: true, user: { select: { userCode: true } } } });
  if (!award) throw notFound('Award not found');

  const row = await prisma.roamingClubAward.update({
    where: { id }, data: { status: 'PROCESSED', fulfilledAt: new Date(), notes },
  });
  await audit.record({
    adminId, action: 'APPROVE', entityType: 'roaming_award', entityId: id,
    summary: `Flyers Club ${award.tier.destination} fulfilled for ${award.user.userCode}`,
    after: { status: 'PROCESSED', notes }, req,
  });
  return row;
}

// ── reward tiers ──

export const rewardTiers = () => prisma.rewardTier.findMany({ orderBy: { sortOrder: 'asc' } });

/**
 * A tier's economics can be tuned, but only for cards not yet issued.
 *
 * Cards fix their amount at unlock time, so retuning a tier never changes what
 * a member is already holding — which is the behaviour we want, and worth
 * saying out loud in the summary so an operator is not surprised by it.
 */
export async function upsertRewardTier(
  adminId: string,
  input: {
    id?: string; name: string; threshold: string;
    bonusPercent: string; maxBonus: string; sortOrder?: number; isActive?: boolean;
  },
  req?: Request,
) {
  const threshold = money(input.threshold);
  const maxBonus = money(input.maxBonus);
  if (threshold.lte(0)) throw badRequest('The unlock threshold must be positive');
  if (maxBonus.lte(0)) throw badRequest('The maximum bonus must be positive');
  if (Number(input.bonusPercent) <= 0) throw badRequest('The bonus percentage must be positive');

  const data = {
    name: input.name.trim(),
    threshold: toDb(threshold),
    bonusPercent: input.bonusPercent,
    maxBonus: toDb(maxBonus),
    sortOrder: input.sortOrder ?? 0,
    isActive: input.isActive ?? true,
  };

  const before = input.id ? await prisma.rewardTier.findUnique({ where: { id: input.id } }) : null;
  const row = input.id
    ? await prisma.rewardTier.update({ where: { id: input.id }, data })
    : await prisma.rewardTier.create({ data });

  const issued = input.id
    ? await prisma.rewardCard.count({ where: { tierId: input.id } })
    : 0;

  await audit.record({
    adminId, action: input.id ? 'UPDATE' : 'CREATE', entityType: 'reward_tier', entityId: row.id,
    summary: `${input.id ? 'Updated' : 'Created'} reward tier ${row.name} — unlocks at ${row.threshold.toString()}, pays ${row.bonusPercent.toString()}% capped at ${row.maxBonus.toString()}`
      + (issued ? ` (${issued} card${issued === 1 ? '' : 's'} already issued keep their original amount)` : ''),
    before: before
      ? { threshold: before.threshold.toString(), bonusPercent: before.bonusPercent.toString(), maxBonus: before.maxBonus.toString(), isActive: before.isActive }
      : undefined,
    after: { threshold: row.threshold.toString(), bonusPercent: row.bonusPercent.toString(), maxBonus: row.maxBonus.toString(), isActive: row.isActive },
    req,
  });
  return row;
}