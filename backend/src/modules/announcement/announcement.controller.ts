import type { Request, Response } from 'express';
import { z } from 'zod';
import * as service from './announcement.service.js';

const upsertSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(3).max(160),
  body: z.string().min(10).max(4000),
  severity: z.enum(['INFO', 'SUCCESS', 'WARNING', 'CRITICAL']).optional(),
  audience: z.enum(['ALL', 'INVESTED', 'NOT_INVESTED']).optional(),
  link: z.string().max(500).optional(),
  pinned: z.boolean().optional(),
  expiresAt: z.string().nullable().optional(),
});

export const list = async (req: Request, res: Response) =>
  res.json({
    success: true,
    data: await service.list({
      take: req.query.take ? Number(req.query.take) : undefined,
      skip: req.query.skip ? Number(req.query.skip) : undefined,
    }),
  });

export const upsert = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.upsert(req.adminId!, upsertSchema.parse(req.body), req) });

export const publish = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.publish(req.adminId!, String(req.params.id), req) });

export const withdraw = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.withdraw(req.adminId!, String(req.params.id), req) });

export const remove = async (req: Request, res: Response) => {
  await service.remove(req.adminId!, String(req.params.id), req);
  res.json({ success: true, data: { ok: true } });
};

// ── member ──

export const banners = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.bannersFor(req.userId!) });

export const dismiss = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.dismiss(req.userId!, String(req.params.id)) });
