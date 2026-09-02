import type { Request, Response } from 'express';
import * as service from './withdrawal.service.js';

export const request = async (req: Request, res: Response) =>
  res.status(201).json({
    success: true,
    data: await service.request(
      req.userId!, String(req.body.amount), String(req.body.walletAddress), req, req.stepUpMethod,
    ),
  });

/**
 * What this amount would pay out. Read-only, so no idempotency key and no
 * step-up: the member is still typing.
 */
export const quote = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.quote(String(req.query.amount ?? '0')) });

export const list = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.listForUser(req.userId!) });
