import type { Request, Response } from 'express';
import { z } from 'zod';
import * as reporter from '../../../core/error-reporter.js';

const listQuery = z.object({
  resolved: z.enum(['true', 'false']).optional(),
  take: z.coerce.number().int().min(1).max(200).optional(),
});

export const list = async (req: Request, res: Response) => {
  const q = listQuery.parse(req.query);
  const rows = await reporter.list({
    resolved: q.resolved === undefined ? undefined : q.resolved === 'true',
    take: q.take,
  });
  res.json({
    success: true,
    data: { unresolved: await reporter.unresolvedCount(), rows },
  });
};

export const detail = async (req: Request, res: Response) =>
  res.json({ success: true, data: await reporter.detail(String(req.params.id)) });

export const resolve = async (req: Request, res: Response) =>
  res.json({ success: true, data: await reporter.resolve(String(req.params.id), req.adminId!) });
