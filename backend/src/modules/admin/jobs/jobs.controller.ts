import type { Request, Response } from 'express';
import { z } from 'zod';
import * as service from './jobs.service.js';

const runSchema = z.object({ date: z.string().optional() });

export const overview = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.overview(Math.min(Number(req.query.days ?? 14), 60)) });

export const runDailyRoi = async (req: Request, res: Response) => {
  const { date } = runSchema.parse(req.body ?? {});
  res.json({ success: true, data: await service.runDailyRoi(req.adminId!, date, req) });
};
