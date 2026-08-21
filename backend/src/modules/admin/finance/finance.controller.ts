import type { Request, Response } from 'express';
import { z } from 'zod';
import * as service from './finance.service.js';

const reasonSchema = z.object({ reason: z.string().min(3).max(300) });

const page = (req: Request) => ({
  take: Math.min(Number(req.query.take ?? 50), 200),
  skip: Number(req.query.skip ?? 0),
});

export const deposits = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.deposits({ ...page(req), status: req.query.status as never }) });

export const confirmDeposit = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.confirmDeposit(req.adminId!, String(req.params.id), req) });

export const rejectDeposit = async (req: Request, res: Response) => {
  const { reason } = reasonSchema.parse(req.body);
  res.json({ success: true, data: await service.rejectDeposit(req.adminId!, String(req.params.id), reason, req) });
};

export const withdrawals = async (req: Request, res: Response) =>
  res.json({
    success: true,
    data: await service.withdrawals({
      ...page(req),
      status: req.query.status as never,
      overdueOnly: req.query.overdue === 'true',
    }),
  });

export const approveWithdrawal = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.approveWithdrawal(req.adminId!, String(req.params.id), req.body?.txHash, req) });

export const rejectWithdrawal = async (req: Request, res: Response) => {
  const { reason } = reasonSchema.parse(req.body);
  res.json({ success: true, data: await service.rejectWithdrawal(req.adminId!, String(req.params.id), reason, req) });
};

export const queues = async (_req: Request, res: Response) =>
  res.json({ success: true, data: await service.queues() });
