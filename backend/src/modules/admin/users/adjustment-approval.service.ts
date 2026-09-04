import type { Request } from 'express';
import { prisma } from '../../../core/db.js';
import { money, toDb, type Money } from '../../../core/money.js';
import { badRequest, forbidden, notFound } from '../../../core/errors.js';
import { config } from '../../../core/runtime-config.js';
import { logger } from '../../../core/logger.js';
import * as audit from '../audit/audit.service.js';

/**
 * Dual control over manual balance adjustments.
 *
 * A manual adjustment is the only operation in this platform that *creates*
 * value rather than moving it: there is no counterparty, no deposit behind it,
 * and nothing to reconcile it against. Everywhere else, money that arrives came
 * from somewhere. That makes it the single most valuable thing an attacker can
 * reach with one stolen operator session — and the role that can post an
 * adjustment is the same role that can approve a withdrawal, so one account
 * could previously complete the whole chain unaided.
 *
 * Small corrections still apply immediately, because making an operator wait
 * for a colleague to refund $2 trains everyone to route around the control.
 * Above the threshold the request is parked and no money moves until a second,
 * different operator approves it.
 */

export interface AdjustmentInput {
  userId: string;
  walletType: 'MAIN' | 'FUND' | 'DIGITAL';
  direction: 'CREDIT' | 'DEBIT';
  amount: string;
  reason: string;
}

/** Whether this amount may be applied by one operator alone. */
export async function needsSecondApproval(amount: Money): Promise<boolean> {
  const { adjustmentApprovalAbove } = await config();
  // A threshold of zero means every adjustment is reviewed, however small.
  return adjustmentApprovalAbove <= 0 || amount.gt(adjustmentApprovalAbove);
}

/** Park an adjustment for review. No money moves here. */
export async function requestAdjustment(
  adminId: string,
  input: AdjustmentInput,
  req?: Request,
) {
  const value = money(input.amount);
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { userCode: true },
  });
  if (!user) throw notFound('User not found');

  const request = await prisma.balanceAdjustmentRequest.create({
    data: {
      userId: input.userId,
      walletType: input.walletType,
      direction: input.direction,
      amount: toDb(value),
      reason: input.reason.trim(),
      requestedById: adminId,
    },
  });

  await audit.record({
    adminId,
    action: 'CREATE',
    entityType: 'balance_adjustment_request',
    entityId: request.id,
    summary:
      `Requested ${input.direction} of ${toDb(value)} to ${user.userCode} `
      + `${input.walletType} — awaiting a second approval — ${input.reason}`,
    after: { amount: toDb(value), wallet: input.walletType, direction: input.direction },
    req,
  });

  logger.info(
    { requestId: request.id, adminId, userId: input.userId, amount: toDb(value) },
    'balance adjustment awaiting second approval',
  );
  return request;
}

export const listPending = () =>
  prisma.balanceAdjustmentRequest.findMany({
    where: { status: 'PENDING' },
    orderBy: { requestedAt: 'asc' },
    include: {
      user: { select: { userCode: true, email: true } },
      requestedBy: { select: { name: true, email: true } },
    },
  });

/**
 * Approve and apply. The applying function is injected rather than imported so
 * this module does not depend on the one that calls it.
 */
export async function approveAdjustment(
  adminId: string,
  requestId: string,
  apply: (adminId: string, input: AdjustmentInput, req?: Request) => Promise<unknown>,
  note?: string,
  req?: Request,
) {
  const request = await prisma.balanceAdjustmentRequest.findUnique({
    where: { id: requestId },
    include: { user: { select: { userCode: true } } },
  });
  if (!request) throw notFound('Adjustment request not found');
  if (request.status !== 'PENDING') {
    throw badRequest(`This request was already ${request.status.toLowerCase()}`);
  }

  /**
   * The whole point of the control. Without this the feature is theatre: an
   * operator would simply raise a request and approve it themselves.
   */
  if (request.requestedById === adminId) {
    throw forbidden(
      'You raised this adjustment, so you cannot approve it. It needs a different operator.',
    );
  }

  /**
   * Claimed before the money moves. Two approvers pressing at the same instant
   * both read PENDING; only one can move the row out of it, and only that one
   * goes on to post the entry.
   */
  const claimed = await prisma.balanceAdjustmentRequest.updateMany({
    where: { id: requestId, status: 'PENDING' },
    data: {
      status: 'APPROVED',
      decidedById: adminId,
      decidedAt: new Date(),
      decisionNote: note?.trim() || null,
    },
  });
  if (claimed.count === 0) throw badRequest('This request was already decided');

  try {
    await apply(
      adminId,
      {
        userId: request.userId,
        walletType: request.walletType as AdjustmentInput['walletType'],
        direction: request.direction as AdjustmentInput['direction'],
        amount: request.amount.toString(),
        reason: request.reason,
      },
      req,
    );
  } catch (err) {
    /**
     * The money did not move, so the request must not stay APPROVED — leaving
     * it there would make the ledger and this table disagree, and an operator
     * would believe a payment had been made that had not.
     */
    await prisma.balanceAdjustmentRequest.updateMany({
      where: { id: requestId, status: 'APPROVED' },
      data: { status: 'PENDING', decidedById: null, decidedAt: null },
    });
    logger.error({ err, requestId }, 'adjustment approved but could not be applied — returned to pending');
    throw err;
  }

  await audit.record({
    adminId,
    action: 'UPDATE',
    entityType: 'balance_adjustment_request',
    entityId: requestId,
    summary:
      `Approved ${request.direction} of ${request.amount.toString()} to `
      + `${request.user.userCode} ${request.walletType}, raised by another operator`,
    before: { status: 'PENDING' },
    after: { status: 'APPROVED', decidedById: adminId },
    req,
  });

  return prisma.balanceAdjustmentRequest.findUniqueOrThrow({ where: { id: requestId } });
}

export async function rejectAdjustment(
  adminId: string,
  requestId: string,
  note: string,
  req?: Request,
) {
  if (!note?.trim()) throw badRequest('A reason is required to reject an adjustment');

  const request = await prisma.balanceAdjustmentRequest.findUnique({ where: { id: requestId } });
  if (!request) throw notFound('Adjustment request not found');
  if (request.status !== 'PENDING') {
    throw badRequest(`This request was already ${request.status.toLowerCase()}`);
  }

  const claimed = await prisma.balanceAdjustmentRequest.updateMany({
    where: { id: requestId, status: 'PENDING' },
    data: {
      status: 'REJECTED',
      decidedById: adminId,
      decidedAt: new Date(),
      decisionNote: note.trim(),
    },
  });
  if (claimed.count === 0) throw badRequest('This request was already decided');

  await audit.record({
    adminId,
    action: 'UPDATE',
    entityType: 'balance_adjustment_request',
    entityId: requestId,
    summary: `Rejected a manual adjustment of ${request.amount.toString()} — ${note.trim()}`,
    before: { status: 'PENDING' },
    after: { status: 'REJECTED', decidedById: adminId },
    req,
  });

  return prisma.balanceAdjustmentRequest.findUniqueOrThrow({ where: { id: requestId } });
}
