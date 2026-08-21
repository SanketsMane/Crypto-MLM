import type { Request, Response } from 'express';
import * as service from './reports.service.js';

export const overview = async (_req: Request, res: Response) =>
  res.json({ success: true, data: await service.overview() });

export const topEarners = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.topEarners(Number(req.query.take ?? 20)) });

export const incomeSeries = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.incomeSeries(Number(req.query.days ?? 30)) });

export const capUtilisation = async (_req: Request, res: Response) =>
  res.json({ success: true, data: await service.capUtilisation() });

export const cohorts = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.cohorts(req.query.months ? Number(req.query.months) : undefined) });

export const planPerformance = async (_req: Request, res: Response) =>
  res.json({ success: true, data: await service.planPerformance() });

export const solvency = async (_req: Request, res: Response) =>
  res.json({ success: true, data: await service.solvency() });
