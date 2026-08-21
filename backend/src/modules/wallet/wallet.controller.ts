import type { Request, Response } from 'express';
import * as service from './wallet.service.js';
import type { LedgerCategory, WalletType } from '@prisma/client';

export const balances = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.balances(req.userId!) });

export const ledger = async (req: Request, res: Response) =>
  res.json({
    success: true,
    data: await service.ledger(req.userId!, {
      category: req.query.category as LedgerCategory | undefined,
      walletType: req.query.wallet as WalletType | undefined,
      take: Number(req.query.take ?? 50),
      skip: Number(req.query.skip ?? 0),
    }),
  });

export const transfer = async (req: Request, res: Response) =>
  res.json({
    success: true,
    data: await service.transfer(
      req.userId!, req.body.from as WalletType, req.body.to as WalletType, String(req.body.amount), req,
    ),
  });
