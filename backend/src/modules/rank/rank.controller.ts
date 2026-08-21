import type { Request, Response } from 'express';
import * as service from './rank.service.js';

export const progress = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.progress(req.userId!) });

export const evaluate = async (req: Request, res: Response) =>
  res.json({ success: true, data: { achieved: await service.evaluate(req.userId!) } });
