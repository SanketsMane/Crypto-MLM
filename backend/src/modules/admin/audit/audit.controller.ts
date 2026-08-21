import type { Request, Response } from 'express';
import type { AuditAction } from '@prisma/client';
import * as service from './audit.service.js';

const date = (v: unknown): Date | undefined => {
  if (!v) return undefined;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? undefined : d;
};

export const list = async (req: Request, res: Response) =>
  res.json({
    success: true,
    data: await service.list({
      take: Math.min(Number(req.query.take ?? 50), 200),
      skip: Number(req.query.skip ?? 0),
      adminId: req.query.adminId ? String(req.query.adminId) : undefined,
      entityType: req.query.entityType ? String(req.query.entityType) : undefined,
      entityId: req.query.entityId ? String(req.query.entityId) : undefined,
      action: req.query.action ? (String(req.query.action) as AuditAction) : undefined,
      from: date(req.query.from),
      to: date(req.query.to),
      q: req.query.q ? String(req.query.q) : undefined,
    }),
  });

export const facets = async (_req: Request, res: Response) =>
  res.json({ success: true, data: await service.facets() });
