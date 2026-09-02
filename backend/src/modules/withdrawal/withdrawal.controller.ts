import type { Request, Response } from 'express';
import * as service from './withdrawal.service.js';

export const request = async (req: Request, res: Response) =>
  res.status(201).json({
    success: true,
    data: await service.request(
      req.userId!, String(req.body.amount), String(req.body.walletAddress), req, req.stepUpMethod,
    ),
  });

export const list = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.listForUser(req.userId!) });
