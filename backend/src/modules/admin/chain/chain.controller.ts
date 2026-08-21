import type { Request, Response } from 'express';
import { prisma } from '../../../core/db.js';
import { watcherStatus, scanForDeposits } from '../../../core/chain/watcher.js';
import { treasuryStatus, processQueue, reconcileBroadcast } from '../../../core/chain/payouts.js';
import * as audit from '../audit/audit.service.js';

/**
 * Operator view of on-chain settlement.
 *
 * Everything here answers a question an operator actually has at 3am: is the
 * watcher keeping up, is there enough gas, and what is stuck.
 */

export const overview = async (_req: Request, res: Response) => {
  const [watcher, treasury, payouts, transfers] = await Promise.all([
    watcherStatus(),
    treasuryStatus().catch((err: unknown) => ({
      configured: false as const,
      reasons: [err instanceof Error ? err.message : String(err)],
    })),
    prisma.chainPayout.groupBy({ by: ['status'], _count: true, _sum: { amount: true } }),
    prisma.onChainTransfer.groupBy({ by: ['status'], _count: true }),
  ]);

  res.json({
    success: true,
    data: {
      watcher,
      treasury,
      payouts: payouts.map((p) => ({
        status: p.status,
        count: p._count,
        amount: p._sum.amount?.toString() ?? '0',
      })),
      transfers: transfers.map((t) => ({ status: t.status, count: t._count })),
    },
  });
};

/** Payouts an operator needs to look at — stuck, reverted, or out of retries. */
export const stuckPayouts = async (_req: Request, res: Response) => {
  const rows = await prisma.chainPayout.findMany({
    where: { OR: [{ status: { in: ['FAILED', 'REVERTED'] } }, { attempts: { gte: 3 } }] },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  });

  const withdrawals = await prisma.withdrawal.findMany({
    where: { id: { in: rows.map((r) => r.withdrawalId) } },
    select: { id: true, reference: true, user: { select: { userCode: true, email: true } } },
  });
  const byId = new Map(withdrawals.map((w) => [w.id, w]));

  res.json({
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      withdrawal: byId.get(r.withdrawalId) ?? null,
      toAddress: r.toAddress,
      amount: r.amount.toString(),
      status: r.status,
      attempts: r.attempts,
      txHash: r.txHash,
      error: r.error,
      updatedAt: r.updatedAt,
    })),
  });
};

/** Runs a scan now, rather than waiting for the schedule. */
export const scanNow = async (req: Request, res: Response) => {
  const result = await scanForDeposits();
  await audit.record({
    adminId: req.adminId!, action: 'UPDATE', entityType: 'chain', entityId: 'watcher',
    summary: `Ran a chain scan manually — blocks ${result.fromBlock}–${result.toBlock}, ${result.credited} credited`,
    after: { ...result }, req,
  });
  res.json({ success: true, data: result });
};

/** Retries stuck payouts and reconciles anything already broadcast. */
export const processNow = async (req: Request, res: Response) => {
  const reconciled = await reconcileBroadcast();
  const result = await processQueue();
  await audit.record({
    adminId: req.adminId!, action: 'UPDATE', entityType: 'chain', entityId: 'payouts',
    summary: `Ran the payout queue manually — ${result.processed} processed, ${reconciled} reconciled`,
    after: { ...result, reconciled }, req,
  });
  res.json({ success: true, data: { ...result, reconciled } });
};
