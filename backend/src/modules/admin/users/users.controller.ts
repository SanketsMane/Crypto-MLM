import type { Request, Response } from 'express';
import { z } from 'zod';
import * as service from './users.service.js';
import * as approval from './adjustment-approval.service.js';

const statusSchema = z.object({ status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'BLOCKED']) });
const modeSchema = z.object({ affiliateMode: z.enum(['PASSIVE', 'ACTIVE']) });
const adjustSchema = z.object({
  walletType: z.enum(['MAIN', 'FUND', 'DIGITAL']),
  direction: z.enum(['CREDIT', 'DEBIT']),
  amount: z.string().min(1),
  reason: z.string().min(3).max(300),
});

export const list = async (req: Request, res: Response) =>
  res.json({
    success: true,
    data: await service.list({
      take: Math.min(Number(req.query.take ?? 50), 200),
      skip: Number(req.query.skip ?? 0),
      search: req.query.q ? String(req.query.q) : undefined,
      status: req.query.status as never,
    }),
  });

export const detail = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.detail(String(req.params.id)) });

export const setStatus = async (req: Request, res: Response) => {
  const { status } = statusSchema.parse(req.body);
  res.json({ success: true, data: await service.setStatus(req.adminId!, String(req.params.id), status, req) });
};

export const setMode = async (req: Request, res: Response) => {
  const { affiliateMode } = modeSchema.parse(req.body);
  res.json({ success: true, data: await service.setAffiliateMode(req.adminId!, String(req.params.id), affiliateMode, req) });
};

export const adjust = async (req: Request, res: Response) => {
  const body = adjustSchema.parse(req.body);
  res.json({ success: true, data: await service.adjustBalance(req.adminId!, { userId: String(req.params.id), ...body }, req) });
};

const createSchema = z.object({
  email: z.email(),
  firstName: z.string().min(2).max(60),
  lastName: z.string().max(60).optional(),
  phone: z.string().max(30).optional(),
  password: z.string().min(8).max(200),
  sponsorCode: z.string().max(20).optional(),
});
const passwordSchema = z.object({ password: z.string().min(8).max(200) });

export const create = async (req: Request, res: Response) =>
  res.status(201).json({ success: true, data: await service.createMember(req.adminId!, createSchema.parse(req.body), req) });

export const resetPassword = async (req: Request, res: Response) => {
  const { password } = passwordSchema.parse(req.body);
  res.json({ success: true, data: await service.resetPassword(req.adminId!, String(req.params.id), password, req) });
};

export const recalcTeam = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.recalcTeam(req.adminId!, String(req.params.id), req) });

const bulkStatusSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1).max(200),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'BLOCKED', 'PENDING']),
  reason: z.string().trim().min(3).max(300),
});

export const bulkStatus = async (req: Request, res: Response) => {
  const b = bulkStatusSchema.parse(req.body);
  res.json({ success: true, data: await service.bulkStatus(req.adminId!, b.userIds, b.status, b.reason, req) });
};

const bulkModeSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1).max(200),
  mode: z.enum(['ACTIVE', 'PASSIVE']),
});

export const bulkAffiliateMode = async (req: Request, res: Response) => {
  const b = bulkModeSchema.parse(req.body);
  res.json({ success: true, data: await service.bulkAffiliateMode(req.adminId!, b.userIds, b.mode, req) });
};

/* ── manual adjustments awaiting a second operator ───────────────────── */

export const pendingAdjustments = async (_req: Request, res: Response) =>
  res.json({ success: true, data: await approval.listPending() });

export const approveAdjustment = async (req: Request, res: Response) =>
  res.json({
    success: true,
    data: await approval.approveAdjustment(
      req.adminId!,
      String(req.params.id),
      // The applying function is handed in, so the approval module never has to
      // import the one that calls it.
      (adminId, input, r) => service.adjustBalance(adminId, input, r, true),
      typeof req.body?.note === 'string' ? req.body.note : undefined,
      req,
    ),
  });

export const rejectAdjustment = async (req: Request, res: Response) =>
  res.json({
    success: true,
    data: await approval.rejectAdjustment(
      req.adminId!, String(req.params.id), String(req.body?.note ?? ''), req,
    ),
  });
