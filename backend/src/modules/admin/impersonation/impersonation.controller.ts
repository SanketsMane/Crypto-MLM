import type { Request, Response } from 'express';
import { z } from 'zod';
import * as service from './impersonation.service.js';

const schema = z.object({ reason: z.string().trim().min(5).max(300) });

export const start = async (req: Request, res: Response) => {
  const { reason } = schema.parse(req.body);
  res.json({ success: true, data: await service.start(req.adminId!, String(req.params.id), reason, req) });
};
