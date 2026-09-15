import type { TxStatus } from '@prisma/client';
import type { Request } from 'express';
import { prisma } from '../../../core/db.js';
import { notFound, badRequest } from '../../../core/errors.js';
import * as withdrawalService from '../../withdrawal/withdrawal.service.js';
import * as depositService from '../../deposit/deposit.service.js';
import * as audit from '../audit/audit.service.js';
import * as activity from '../../../core/activity.js';
import { notifyMember } from '../../../core/notify.js';
import * as payouts from '../../../core/chain/payouts.js';
import * as gateway from '../../../core/gateway/gateway.service.js';
import { logger } from '../../../core/logger.js';
import { assertPayoutRail } from '../../../core/payout-rail.js';

// ── deposits ──

export async function deposits(opts: { status?: TxStatus; take: number; skip: number }) {
  const where = opts.status ? { status: opts.status } : {};
  const [rows, total] = await Promise.all([
    prisma.deposit.findMany({
      where, orderBy: { createdAt: 'desc' }, take: opts.take, skip: opts.skip,
      include: { user: { select: { userCode: true, email: true } } },
    }),
    prisma.deposit.count({ where }),
  ]);
  return {
    total,
    rows: rows.map((d) => ({
      id: d.id, userCode: d.user.userCode, email: d.user.email,
      amount: d.amount.toString(), network: d.network, txHash: d.txHash,
      reference: d.reference, status: d.status, confirmedAt: d.confirmedAt, createdAt: d.createdAt,
    })),
  };
}

export async function confirmDeposit(adminId: string, id: string, req?: Request) {
  const dep = await depositService.confirm(id);
  await audit.record({
    adminId, action: 'APPROVE', entityType: 'deposit', entityId: id,
    summary: `Deposit ${dep.reference} confirmed — ${dep.amount.toString()}`,
    after: { status: dep.status }, req,
  });
  return dep;
}

export async function rejectDeposit(adminId: string, id: string, reason: string, req?: Request) {
  const dep = await prisma.deposit.findUnique({ where: { id } });
  if (!dep) throw notFound('Deposit not found');

  /* The transition is the lock — see the note on withdrawal.approve. Reading
     the status and then writing lets two operators both pass the check. */
  const claimed = await prisma.deposit.updateMany({
    where: { id, status: 'PENDING' },
    data: { status: 'REJECTED' },
  });
  if (claimed.count === 0) {
    const now = await prisma.deposit.findUnique({ where: { id }, select: { status: true } });
    throw badRequest(`Deposit is not pending (already ${now?.status.toLowerCase() ?? 'gone'})`);
  }
  const updated = await prisma.deposit.findUniqueOrThrow({ where: { id } });
  await audit.record({
    adminId, action: 'REJECT', entityType: 'deposit', entityId: id,
    summary: `Deposit ${dep.reference} rejected — ${reason}`,
    before: { status: dep.status }, after: { status: 'REJECTED', reason }, req,
  });

  notifyMember({
    userId: dep.userId,
    type: 'deposit.rejected',
    dedupeKey: `deposit-rejected:${id}`,
    title: 'Deposit not accepted',
    body: `Your reported deposit of $${dep.amount.toString()} could not be confirmed. Reason: ${reason}`,
    meta: { depositId: id, amount: dep.amount.toString(), reason },
  });
  return updated;
}

// ── withdrawals ──

export async function withdrawals(opts: { status?: TxStatus; overdueOnly?: boolean; take: number; skip: number }) {
  const where = {
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.overdueOnly ? { status: 'PENDING' as TxStatus, slaDueAt: { lt: new Date() } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.withdrawal.findMany({
      where, orderBy: { createdAt: 'desc' }, take: opts.take, skip: opts.skip,
      include: { user: { select: { userCode: true, email: true } } },
    }),
    prisma.withdrawal.count({ where }),
  ]);
  const now = Date.now();
  return {
    total,
    rows: rows.map((w) => ({
      id: w.id, userCode: w.user.userCode, email: w.user.email,
      amount: w.amount.toString(), fee: w.fee.toString(), netAmount: w.netAmount.toString(),
      walletAddress: w.walletAddress, network: w.network, txHash: w.txHash,
      reference: w.reference, status: w.status,
      slaDueAt: w.slaDueAt,
      /* The settlement date, so the queue can be worked by payout batch rather
         than by arrival order — which is what a fortnightly calendar actually
         asks an operator to do. */
      scheduledFor: w.scheduledFor,
      overdue: w.status === 'PENDING' && w.slaDueAt.getTime() < now,
      hoursRemaining: w.status === 'PENDING'
        ? Math.round((w.slaDueAt.getTime() - now) / 3_600_000)
        : null,
      processedAt: w.processedAt, rejectReason: w.rejectReason, createdAt: w.createdAt,
    })),
  };
}

export async function approveWithdrawal(adminId: string, id: string, txHash: string | undefined, req?: Request) {
  /**
   * Exactly one rail sends the money.
   *
   * Resolved BEFORE the withdrawal is claimed: an unresolvable configuration
   * throws here, leaving the request PENDING and re-approvable once the
   * operator has fixed it, rather than stranding it approved-but-unpaid.
   *
   * This used to call both rails unconditionally, which paid the member twice
   * wherever both were configured. See core/payout-rail.ts.
   */
  const rail = assertPayoutRail(await gateway.gatewaySwitches());

  const w = await withdrawalService.approve(id, txHash);
  await audit.record({
    adminId, action: 'APPROVE', entityType: 'withdrawal', entityId: id,
    summary: `Withdrawal ${w.reference} approved — net ${w.netAmount.toString()} via ${rail.rail}`,
    after: { status: w.status, txHash: txHash ?? null, rail: rail.rail }, req,
  });

  // Approving is an accounting decision; paying is a network operation. The
  // on-chain payout is queued here and broadcast by the worker, so a slow or
  // unreachable RPC can never hold up an operator's queue.
  let queued: payouts.PayoutResult = { status: 'SKIPPED', reason: rail.reason };

  if (rail.rail === 'chain') {
    queued = await payouts.enqueue(id);
  } else if (rail.rail === 'gateway') {
    /* A gateway failure must not unwind an approval an operator already made —
       the payout is left handed-over-but-unsent for them to retry, and the
       failure is logged rather than thrown. */
    try {
      await gateway.sendPayout(id);
    } catch (cause) {
      logger.error({ cause, withdrawalId: id }, 'gateway payout could not be dispatched — retry from the console');
    }
  } else {
    logger.info({ withdrawalId: id, reason: rail.reason }, 'withdrawal approved for manual payment');
  }

  notifyMember({
    userId: w.userId,
    type: 'withdrawal.sent',
    dedupeKey: `withdrawal-approved:${id}`,
    title: 'Withdrawal approved',
    body: `$${w.netAmount.toString()} is on its way to ${activity.maskAddress(w.walletAddress)}. Settlement on the network usually takes a few minutes.`,
    meta: { withdrawalId: id, net: w.netAmount.toString(), txHash: txHash ?? null },
  });

  activity.record({
    userId: w.userId, event: 'WITHDRAWAL_APPROVED', actorAdminId: adminId,
    summary: `Withdrawal of $${w.amount.toString()} approved — $${w.netAmount.toString()} sent to ${activity.maskAddress(w.walletAddress)}`,
    meta: { amount: w.amount.toString(), net: w.netAmount.toString(), txHash: txHash ?? null },
  });
  return { ...w, payout: queued };
}

export async function rejectWithdrawal(adminId: string, id: string, reason: string, req?: Request) {
  if (!reason?.trim()) throw badRequest('A rejection reason is required');
  const w = await withdrawalService.reject(id, reason);
  await audit.record({
    adminId, action: 'REJECT', entityType: 'withdrawal', entityId: id,
    summary: `Withdrawal ${w.reference} rejected and refunded — ${reason}`,
    after: { status: w.status, reason }, req,
  });

  notifyMember({
    userId: w.userId,
    type: 'withdrawal.rejected',
    dedupeKey: `withdrawal-rejected:${id}`,
    title: 'Withdrawal rejected',
    body: `Your $${w.amount.toString()} withdrawal was not approved and the full amount has been returned to your wallet. Reason: ${reason}`,
    meta: { withdrawalId: id, amount: w.amount.toString(), reason },
  });

  activity.record({
    userId: w.userId, event: 'WITHDRAWAL_REJECTED', actorAdminId: adminId,
    summary: `Withdrawal of $${w.amount.toString()} was rejected and the full amount refunded — ${reason}`,
    meta: { amount: w.amount.toString(), reason },
  });
  return w;
}

/** Queue health for the operations dashboard. */
export async function queues() {
  const now = new Date();
  const [pendingDeposits, pendingWithdrawals, overdue, oldest] = await Promise.all([
    prisma.deposit.count({ where: { status: 'PENDING' } }),
    prisma.withdrawal.count({ where: { status: 'PENDING' } }),
    prisma.withdrawal.count({ where: { status: 'PENDING', slaDueAt: { lt: now } } }),
    prisma.withdrawal.findFirst({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
  ]);
  return {
    pendingDeposits, pendingWithdrawals, overdueWithdrawals: overdue,
    oldestPendingHours: oldest ? Math.round((now.getTime() - oldest.createdAt.getTime()) / 3_600_000) : null,
  };
}
