import type { Request, Response } from 'express';
import { z } from 'zod';
import * as service from './catalog.service.js';

const packageSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2),
  amount: z.string(),
  dailyRoiPercent: z.string(),
  capPercent: z.string(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

const ruleSchema = z.object({
  kind: z.enum(['DIRECT', 'GENERATION']),
  level: z.number().int().min(1).max(30),
  percent: z.string(),
  requiredDirects: z.number().int().min(0).optional(),
  requiredTeamVolume: z.string().optional(),
  isActive: z.boolean().optional(),
});

const rankSchema = z.object({
  selfCapital: z.string().optional(),
  teamBusiness: z.string().optional(),
  reward: z.string().optional(),
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
  threshold: z.string(),
  bonusPercent: z.string(),
  maxBonus: z.string(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const upsertRewardTier = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.upsertRewardTier(req.adminId!, rewardTierSchema.parse(req.body), req) });
