import type { Request, Response } from 'express';
import * as service from './package.service.js';

export const list = async (_req: Request, res: Response) =>
  res.json({ success: true, data: await service.listActive() });
