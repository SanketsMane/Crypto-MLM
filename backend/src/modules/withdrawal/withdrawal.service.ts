import { prisma } from '../../core/db.js';
import { postEntry } from '../../core/ledger.js';
import { money, percentOf, type Money } from '../../core/money.js';
import { makeReference } from '../../core/reference.js';
import { AppError, badRequest, notFound } from '../../core/errors.js';
import { config, type RuntimeConfig } from '../../core/runtime-config.js';
import * as activity from '../../core/activity.js';
import { notifyAdmins, notifyMember } from '../../core/notify.js';
import type { Request } from 'express';

/**
 * Withdrawals (FortuneX p18): 5% fee, $10 min, $5,000 max, USDT BEP-20,
 * processed within 48 hours.
 *
 * The balance is debited in the SAME transaction that creates the request, and
 * the debit carries its own `balance >= amount` guard. There is deliberately no
 * check-then-deduct across two requests — that pattern is what made the previous
 * platform double-spendable.
 *
 * Every limit below comes from runtime config, so the Settings screen actually
 * governs this path rather than merely describing it.
 */
/**
 * Identity verification gate.
 *
 * KYC was fully built — submission, document storage, an operator review queue —
 * and enforced in exactly no place, so an unverified member could withdraw
 * freely and the whole apparatus was decoration. The check belongs here, on the
 * way out, because that is the only moment it protects anything.
 *
 * Both the requirement and the threshold are operator settings: some
 * jurisdictions verify every payout, others only above a figure, and that is a
 * compliance decision rather than ours to hard-code.
 */
async function assertVerified(userId: string, amount: Money, cfg: RuntimeConfig) {
  if (!cfg.kycRequiredForWithdrawal) return;
  if (cfg.kycRequiredAbove > 0 && amount.lte(cfg.kycRequiredAbove)) return;

  const approved = await prisma.kycSubmission.findFirst({
    where: { userId, status: 'APPROVED' },
    select: { id: true },
  });
  if (approved) return;

  const pending = await prisma.kycSubmission.findFirst({
    where: { userId, status: 'PENDING' },
    select: { id: true },
  });

  throw new AppError(
    pending
      ? 'Your identity documents are still under review. Withdrawals open once verification is approved.'
      : 'Verify your identity before withdrawing. It takes a few minutes and only needs doing once.',
    403,
    pending ? 'KYC_PENDING' : 'KYC_REQUIRED',
  );
}

export async function request(userId: string, amount: string, walletAddress: string, req?: Request) {
  const cfg = await config();
  const value = money(amount);

  if (!cfg.withdrawalsOpen) throw badRequest('Withdrawals are temporarily closed');
  if (value.lt(cfg.withdrawMin)) throw badRequest(`Minimum withdrawal is $${cfg.withdrawMin}`);
  if (value.gt(cfg.withdrawMax)) throw badRequest(`Maximum withdrawal is $${cfg.withdrawMax}`);
  if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) throw badRequest('Invalid BEP-20 address');

  await assertVerified(userId, value, cfg);

  const fee = percentOf(value, cfg.withdrawFeePercent);

  /**
   * Withholding, on the amount after the platform fee.
   *
   * After the fee rather than on the gross, because the fee never reaches the
   * member — withholding on money they were never paid would over-deduct.
   * Zero unless the operator has set a rate.
   */
  const taxable = value.sub(fee);
  const tax = cfg.taxWithholdingPercent > 0
    ? percentOf(taxable, cfg.taxWithholdingPercent)
    : money(0);
  const net = taxable.sub(tax);

  if (net.lte(0)) {
    throw badRequest('After fees and withholding this payout would come to nothing');
  }
  const reference = makeReference('WDR', userId);
  const slaDueAt = new Date(Date.now() + cfg.withdrawSlaHours * 60 * 60 * 1000);

  return prisma.$transaction(async (tx) => {
    // Guarded debit — fails atomically if funds are insufficient.
    await postEntry(tx, {
      userId, walletType: 'MAIN', direction: 'DEBIT', category: 'WITHDRAWAL',
      amount: value, reference,
      description: 'Withdrawal request',
      meta: {
        fee: fee.toString(), tax: tax.toString(), net: net.toString(),
        feePercent: String(cfg.withdrawFeePercent),
        taxPercent: String(cfg.taxWithholdingPercent),
      },
    });

    const created = await tx.withdrawal.create({
      data: {
        userId,
        amount: value.toString(),
        feePercent: cfg.withdrawFeePercent,
        fee: fee.toString(),
        taxPercent: cfg.taxWithholdingPercent,
        tax: tax.toString(),
        netAmount: net.toString(),
        walletAddress,
        network: 'BEP20',
        reference,
        slaDueAt,
        status: 'PENDING',
      },
    });

    const masked = activity.maskAddress(walletAddress);

    notifyMember({
      userId,
      type: 'withdrawal.requested',
      dedupeKey: `withdrawal-requested:${created.id}`,
      title: 'Withdrawal requested',
      body: tax.gt(0)
        ? `$${value.toString()} requested to ${masked}. You will receive $${net.toString()} after the ${cfg.withdrawFeePercent}% fee and ${cfg.taxWithholdingPercent}% withholding, usually within ${cfg.withdrawSlaHours} hours.`
        : `$${value.toString()} requested to ${masked}. You will receive $${net.toString()} after the ${cfg.withdrawFeePercent}% fee, usually within ${cfg.withdrawSlaHours} hours.`,
      meta: { withdrawalId: created.id, amount: value.toString(), fee: fee.toString(), tax: tax.toString(), net: net.toString() },
    });

    notifyAdmins({
      type: 'ops.withdrawal_pending',
      dedupeKey: `withdrawal-pending:${created.id}`,
      title: 'Withdrawal awaiting approval',
      body: `$${value.toString()} to ${masked}. Due within ${cfg.withdrawSlaHours} hours.`,
      meta: { withdrawalId: created.id, amount: value.toString() },
    });

    activity.record({
      userId, event: 'WITHDRAWAL_REQUESTED', req,
      summary: `Requested a withdrawal of $${value.toString()} to ${activity.maskAddress(walletAddress)}`,
      meta: { amount: value.toString(), fee: fee.toString(), net: net.toString(), address: walletAddress },
    });

    return created;
  });
}

/**
 * Mark a withdrawal paid.
 *
 * The status transition is the lock. Reading the row and then updating it lets
 * two operators who open the queue at the same moment both pass the check and
 * both succeed — and since approval enqueues an on-chain payout, that is a
 * double spend, not a duplicate row. Matching on `status: 'PENDING'` inside the
 * write means the database decides the winner, and exactly one caller sees a
 * count of 1.
 */
export async function approve(id: string, txHash?: string) {
  const claimed = await prisma.withdrawal.updateMany({
    where: { id, status: 'PENDING' },
    data: { status: 'PROCESSED', txHash, processedAt: new Date() },
  });

  if (claimed.count === 0) {
    const existing = await prisma.withdrawal.findUnique({ where: { id }, select: { status: true } });
    if (!existing) throw notFound('Withdrawal not found');
    throw badRequest(`Withdrawal is not pending (already ${existing.status.toLowerCase()})`);
  }

  return prisma.withdrawal.findUniqueOrThrow({ where: { id } });
}

/**
 * Rejection refunds the full amount — fee included.
 *
 * Claimed the same way as `approve`: the transition itself is what stops a
 * second rejection, so two operators cannot each credit the refund.
 */
export async function reject(id: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.withdrawal.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'REJECTED', rejectReason: reason, processedAt: new Date() },
    });
    if (claimed.count === 0) {
      const existing = await tx.withdrawal.findUnique({ where: { id }, select: { status: true } });
      if (!existing) throw notFound('Withdrawal not found');
      throw badRequest(`Withdrawal is not pending (already ${existing.status.toLowerCase()})`);
    }

    const w = await tx.withdrawal.findUniqueOrThrow({ where: { id } });

    await postEntry(tx, {
      userId: w.userId, walletType: 'MAIN', direction: 'CREDIT', category: 'REFUND',
      amount: money(w.amount.toString()),
      reference: `${w.reference}-REFUND`,
      description: `Withdrawal rejected: ${reason}`,
      sourceType: 'withdrawal', sourceId: w.id,
    });

    return w;
  });
}

export const listForUser = (userId: string) =>
  prisma.withdrawal.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });

/** Ageing report — anything past its 48-hour SLA. */
export const overdue = () =>
  prisma.withdrawal.findMany({
    where: { status: 'PENDING', slaDueAt: { lt: new Date() } },
    orderBy: { slaDueAt: 'asc' },
    include: { user: { select: { userCode: true, email: true } } },
  });
