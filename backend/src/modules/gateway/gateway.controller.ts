import type { Request, Response } from 'express';
import { z } from 'zod';
import * as gateway from '../../core/gateway/gateway.service.js';
import { gatewayState } from '../../core/gateway/oxapay.js';
import { prisma } from '../../core/db.js';

const startSchema = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,8})?$/, 'Amount must be a positive number'),
});

/** Whether the member app should offer gateway payment at all. */
export const status = async (_req: Request, res: Response) => {
  const s = gatewayState();
  res.json({ success: true, data: { canCharge: s.canCharge, canPay: s.canPay, sandbox: s.sandbox } });
};

/** Raise an invoice and hand the member the payment link. */
export const start = async (req: Request, res: Response) => {
  const { amount } = startSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { email: true } });
  const deposit = await gateway.startDeposit(req.userId!, amount, user?.email);

  res.status(201).json({
    success: true,
    data: {
      id: deposit.id,
      reference: deposit.reference,
      amount: deposit.amount.toString(),
      paymentUrl: deposit.paymentUrl,
      expiresAt: deposit.expiresAt,
    },
  });
};

/**
 * OxaPay callbacks.
 *
 * Unauthenticated by necessity — the gateway holds no token of ours. The HMAC
 * over the raw body IS the authentication, so this handler must never do
 * anything before `handleCallback` has checked it.
 *
 * Always answered `200 ok`, even when the payload is rejected. A gateway that
 * receives an error retries, and retrying a forged or malformed callback
 * achieves nothing except noise; the outcome is recorded either way.
 */
const callback = (kind: 'payment' | 'payout') => async (req: Request, res: Response) => {
  const raw = (req as Request & { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
  await gateway.handleCallback(kind, raw, req.get('HMAC') ?? undefined);
  res.status(200).type('text/plain').send('ok');
};

export const paymentCallback = callback('payment');
export const payoutCallback = callback('payout');
