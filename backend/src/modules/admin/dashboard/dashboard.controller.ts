import type { Request, Response } from 'express';
import * as service from './dashboard.service.js';

export const summary = async (_req: Request, res: Response) =>
  res.json({ success: true, data: await service.summary() });

export const investmentSeries = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.investmentSeries(Number(req.query.days ?? 7)) });
