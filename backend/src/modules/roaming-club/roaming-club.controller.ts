import type { Request, Response } from 'express';
import * as service from './roaming-club.service.js';

export const progress = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.progress(req.userId!) });
