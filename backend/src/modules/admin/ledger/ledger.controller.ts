import type { Request, Response } from 'express';
import * as service from './ledger.service.js';

const page = (req: Request) => ({
  take: Math.min(Number(req.query.take ?? 50), 200),
  skip: Number(req.query.skip ?? 0),
});

export const transactions = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.transactions({ ...page(req), category: req.query.category as string | undefined, q: req.query.q as string | undefined }) });

export const commissions = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.commissions({ ...page(req), kind: req.query.kind as string | undefined }) });

export const investments = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.investments({ ...page(req), status: req.query.status as string | undefined }) });

export const walletSummary = async (_req: Request, res: Response) =>
  res.json({ success: true, data: await service.walletSummary() });

export const networkLevels = async (_req: Request, res: Response) =>
  res.json({ success: true, data: await service.networkLevels() });

export const genealogy = async (req: Request, res: Response) =>
  res.json({
    success: true,
    data: await service.genealogy({
      userId: req.query.userId ? String(req.query.userId) : undefined,
      userCode: req.query.userCode ? String(req.query.userCode) : undefined,
      depth: Number(req.query.depth ?? 3),
    }),
  });
