import type { Request, Response } from 'express';
import * as service from './deposit.service.js';

export const create = async (req: Request, res: Response) =>
  res.status(201).json({ success: true, data: await service.create(req.userId!, String(req.body.amount), req.body.txHash, req) });

export const list = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.listForUser(req.userId!) });

/** Where this member should send funds. Null when the chain is not configured. */
export const address = async (req: Request, res: Response) => {
  const { depositDetails } = await import('../../core/chain/addresses.js');
  res.json({ success: true, data: await depositDetails(req.userId!) });
};
