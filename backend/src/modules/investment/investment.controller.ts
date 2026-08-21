import type { Request, Response } from 'express';
import * as service from './investment.service.js';
import { badRequest } from '../../core/errors.js';

export const purchase = async (req: Request, res: Response) => {
  const packageId = String(req.body?.packageId ?? '');
  if (!packageId) throw badRequest('packageId is required');
  res.status(201).json({ success: true, data: await service.purchase(req.userId!, packageId, req) });
};

export const list = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.listForUser(req.userId!) });

export const overview = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.overview(req.userId!) });
