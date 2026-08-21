import type { Request, Response } from 'express';
import { z } from 'zod';
import * as service from './lottery.service.js';

// ── member ──

export const view = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.memberView(req.userId!) });

export const claim = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.claimPrize(req.userId!, String(req.params.id)) });

// ── operator ──

const drawSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(3).max(120),
  notes: z.string().max(1000).optional(),
  ticketThreshold: z.string(),
  maxTicketsPerMember: z.number().int().min(1).max(1000).optional(),
  closesAt: z.string().nullable().optional(),
  prizes: z.array(z.object({
    position: z.number().int().min(1).max(100),
    label: z.string().trim().min(1).max(80),
    amount: z.string(),
  })).min(1).max(100),
});

export const list = async (_req: Request, res: Response) =>
  res.json({ success: true, data: await service.listDraws() });

export const upsert = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.upsertDraw(req.adminId!, drawSchema.parse(req.body)) });

export const open = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.openDraw(req.adminId!, String(req.params.id)) });

export const close = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.closeDraw(req.adminId!, String(req.params.id)) });

export const run = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.runDraw(req.adminId!, String(req.params.id)) });
