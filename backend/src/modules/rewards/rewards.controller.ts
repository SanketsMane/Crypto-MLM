import type { Request, Response } from 'express';
import * as service from './rewards.service.js';

export const list = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.listFor(req.userId!) });

export const claim = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.claim(req.userId!, String(req.params.id)) });
