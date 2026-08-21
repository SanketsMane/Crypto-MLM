import type { Request, Response } from 'express';
import { z } from 'zod';
import * as service from './simulation.service.js';

const rate = z.number().min(0).max(1);

const paramsSchema = z.object({
  months: z.number().int().min(1).max(36),
  initialMembers: z.number().int().min(0).max(2000),
  joinsPerMonth: z.number().int().min(0).max(2000),
  joinPattern: z.enum(['STEADY', 'GROWTH', 'VIRAL', 'DECLINE']),
  intakeVariance: rate,
  minInvestment: z.number().positive(),
  maxInvestment: z.number().positive(),
  reinvestRate: rate,
  withdrawRate: rate,
  activeAffiliateRate: rate,
  avgDirectsPerRecruiter: z.number().min(1).max(40),
  recruiterRate: rate,
  startDate: z.string().min(8),
});

const startSchema = z.object({
  name: z.string().trim().max(120).optional(),
  seed: z.string().trim().max(64).optional(),
  params: paramsSchema,
});

// Async so it matches asyncHandler's signature like the rest.
export const defaults = async (_req: Request, res: Response) => {
  res.json({ success: true, data: service.DEFAULT_PARAMS });
};

export const list = async (_req: Request, res: Response) =>
  res.json({ success: true, data: await service.list() });

export const footprint = async (_req: Request, res: Response) =>
  res.json({ success: true, data: await service.footprint() });

export const detail = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.detail(String(req.params.id)) });

export const start = async (req: Request, res: Response) => {
  const body = startSchema.parse(req.body);
  res.status(202).json({
    success: true,
    data: await service.start(req.adminId!, body.name ?? '', body.params, body.seed),
  });
};

export const erase = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.erase(req.adminId!, String(req.params.id)) });
