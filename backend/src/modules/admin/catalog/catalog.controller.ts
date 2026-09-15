import type { Request, Response } from 'express';
import { z } from 'zod';
import * as service from './catalog.service.js';

/**
 * Every figure on this screen is a string on the wire and a Decimal in the
 * column, so the shape has to be checked here or not at all.
 *
 * Unvalidated, `percent: "abc"` reached Prisma and came back as a 500 with no
 * usable message, and `"-5"` would have been stored as a negative rate that the
 * payout run would happily apply. A plan value is always a non-negative decimal
 * with a sane ceiling.
 */
const decimalString = (label: string, max: number) =>
  z.string().trim()
    .regex(/^\d{1,12}(\.\d{1,8})?$/, `${label} must be a positive number`)
    .refine((v) => Number(v) <= max, `${label} must not exceed ${max.toLocaleString('en-US')}`);

const MONEY_MAX = 1_000_000_000_000;

const packageSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2).max(80),
  amount: decimalString('Amount', MONEY_MAX),
  dailyRoiPercent: decimalString('Daily return', 100),
  capPercent: decimalString('Earn limit', 10_000),
  sortOrder: z.number().int().min(0).max(9_999).optional(),
  isActive: z.boolean().optional(),
});

const ruleSchema = z.object({
  kind: z.enum(['DIRECT', 'GENERATION']),
  level: z.number().int().min(1).max(30),
  percent: decimalString('Percent', 100),
  requiredDirects: z.number().int().min(0).max(10_000).optional(),
  requiredTeamVolume: decimalString('Team volume', MONEY_MAX).optional(),
  isActive: z.boolean().optional(),
});

/**
 * A band edit arrives as every level it covers, so the whole span commits or
 * none of it does. Capped at 30 because that is the depth of the plan, and a
 * level may appear once — two upserts on one row in a single transaction would
 * silently keep the last and drop the first.
 */
const ruleBatchSchema = z.object({
  rules: z.array(ruleSchema).min(1).max(30),
}).refine(
  (b) => new Set(b.rules.map((r) => `${r.kind}-${r.level}`)).size === b.rules.length,
  { message: 'Each level may appear only once in a batch' },
);

const rankSchema = z.object({
  selfCapital: decimalString('Self capital', MONEY_MAX).optional(),
  teamBusiness: decimalString('Team business', MONEY_MAX).optional(),
  reward: decimalString('Reward', MONEY_MAX).optional(),
  isActive: z.boolean().optional(),
});

export const packages = async (_req: Request, res: Response) =>
  res.json({ success: true, data: await service.packages() });

export const upsertPackage = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.upsertPackage(req.adminId!, packageSchema.parse(req.body), req) });

export const commissionRules = async (_req: Request, res: Response) =>
  res.json({ success: true, data: await service.commissionRules() });

export const updateCommissionRule = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.updateCommissionRule(req.adminId!, ruleSchema.parse(req.body), req) });

export const updateCommissionRules = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.updateCommissionRules(req.adminId!, ruleBatchSchema.parse(req.body).rules, req) });

export const ranks = async (_req: Request, res: Response) =>
  res.json({ success: true, data: await service.ranks() });

export const updateRank = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.updateRank(req.adminId!, { id: String(req.params.id), ...rankSchema.parse(req.body) }, req) });

export const rankAchievements = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.rankAchievements({
    take: Math.min(Number(req.query.take ?? 50), 200),
    skip: Number(req.query.skip ?? 0),
  }) });

export const roamingTiers = async (_req: Request, res: Response) =>
  res.json({ success: true, data: await service.roamingTiers() });

export const roamingAwards = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.roamingAwards({
    take: Math.min(Number(req.query.take ?? 50), 200),
    skip: Number(req.query.skip ?? 0),
    status: req.query.status ? (String(req.query.status) as never) : undefined,
  }) });

const fulfilSchema = z.object({ notes: z.string().min(3).max(300) });

export const fulfilRoaming = async (req: Request, res: Response) => {
  const { notes } = fulfilSchema.parse(req.body);
  res.json({ success: true, data: await service.fulfilRoamingAward(req.adminId!, String(req.params.id), notes, req) });
};

export const rewardTiers = async (_req: Request, res: Response) =>
  res.json({ success: true, data: await service.rewardTiers() });

const rewardTierSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2).max(80),
  threshold: decimalString('Unlocks at', MONEY_MAX),
  bonusPercent: decimalString('Bonus', 100),
  maxBonus: decimalString('Max bonus', MONEY_MAX),
  sortOrder: z.number().int().min(0).max(9_999).optional(),
  isActive: z.boolean().optional(),
});

export const upsertRewardTier = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.upsertRewardTier(req.adminId!, rewardTierSchema.parse(req.body), req) });

/**
 * An offer's window is optional — omit both dates for one that always runs.
 * Sent as ISO strings; the service is what rejects a window that closes before
 * it opens, so a direct POST cannot store an offer that can never be earned.
 */
const roamingTierSchema = z.object({
  id: z.string().optional(),
  track: z.enum(['AFFILIATE', 'SELF_CAPITALIST']),
  destination: z.string().trim().min(2).max(120),
  selfRequirement: decimalString('Self requirement', MONEY_MAX),
  teamRequirement: decimalString('Team requirement', MONEY_MAX),
  rewardLabel: z.string().trim().max(200).nullish(),
  rewardValue: decimalString('Reward value', MONEY_MAX).nullish(),
  validFrom: z.string().nullish(),
  validUntil: z.string().nullish(),
  sortOrder: z.number().int().min(0).max(9_999).optional(),
  isActive: z.boolean().optional(),
});

export const upsertRoamingTier = async (req: Request, res: Response) =>
  res.json({
    success: true,
    data: await service.upsertRoamingTier(req.adminId!, roamingTierSchema.parse(req.body), req),
  });
