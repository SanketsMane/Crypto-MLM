import { prisma } from '../../core/db.js';
import { postEntry } from '../../core/ledger.js';
import { money, percentOf, type Money } from '../../core/money.js';
import { makeReference } from '../../core/reference.js';
import { AppError, badRequest, notFound } from '../../core/errors.js';
import { config, type RuntimeConfig } from '../../core/runtime-config.js';
import * as activity from '../../core/activity.js';
import { notifyAdmins, notifyMember } from '../../core/notify.js';
import type { Request } from 'express';
import { stepUpRequired } from '../auth/step-up.service.js';
import { isSimulating } from '../../middleware/request-context.js';

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
/**
 * How far back unverified withdrawals are totalled for the threshold above.
 * Thirty days is the usual reporting period; it is deliberately not an
 * operator setting, because a tunable AML window is a tunable AML control.
 */
const UNVERIFIED_WINDOW_DAYS = 30;

async function assertVerified(userId: string, amount: Money, cfg: RuntimeConfig) {
  if (!cfg.kycRequiredForWithdrawal) return;

  /**
   * Verified once, and the threshold stops mattering.
   *
   * Checked before the threshold arithmetic below so a verified member never
   * pays for the extra query.
   */
  const approved = await prisma.kycSubmission.findFirst({
    where: { userId, status: 'APPROVED' },
    select: { id: true },
  });
  if (approved) return;

  /**
   * The threshold is cumulative, not per request.
   *
   * It used to compare this single amount against `kycRequiredAbove`, which is
   * defeated by splitting: with the threshold at $1,000, five withdrawals of
   * $999 moved $4,995 without a document ever being submitted. That is
   * structuring, and it is the pattern the threshold exists to catch.
   *
   * So the figure weighed is everything this member has already taken out
   * unverified within the window, plus what they are asking for now. Rejected
   * requests are excluded — they were refunded, so no value left the platform.
   */
  if (cfg.kycRequiredAbove > 0) {
    const since = new Date(Date.now() - UNVERIFIED_WINDOW_DAYS * 86_400_000);
    const prior = await prisma.withdrawal.aggregate({
      where: { userId, status: { in: ['PENDING', 'APPROVED', 'PROCESSED'] }, createdAt: { gte: since } },
      _sum: { amount: true },
    });
    const cumulative = money(prior._sum.amount?.toString() ?? 0).add(amount);
    if (cumulative.lte(cfg.kycRequiredAbove)) return;
  }

  const pending = await prisma.kycSubmission.findFirst({
    where: { userId, status: 'PENDING' },
    select: { id: true },
  });

  throw new AppError(
    pending
      ? 'Your identity documents are still under review. Withdrawals open once verification is approved.'
      : 'You have reached the limit for unverified withdrawals. Verify your identity to continue — '
        + 'it takes a few minutes and only needs doing once.',
    403,
    pending ? 'KYC_PENDING' : 'KYC_REQUIRED',
  );
}

/**
 * A password is enough for a small payout; a large one needs the authenticator.
 *
 * Device biometrics and a password both prove possession of an unlocked phone,
 * which is exactly what an opportunistic thief has. A time-based code proves
 * possession of a second enrolled factor, which they do not. The threshold is
 * an operator setting because where that line sits is a business decision, not
 * an engineering one.
 */
async function assertStepUpSufficient(
  amount: Money,
  cfg: RuntimeConfig,
  method?: 'password' | 'totp',
) {
  // A dry run moves no money and has no member present to re-authenticate.
  // Same exemption the activity log already makes for modelled data.
  if (isSimulating()) return;
  if (!method) throw stepUpRequired('Confirm it is you before withdrawing.');
  if (method === 'totp') return;
  if (cfg.stepUpTotpAbove > 0 && amount.lte(cfg.stepUpTotpAbove)) return;

  throw stepUpRequired(
    `Withdrawals over $${cfg.stepUpTotpAbove} need a code from your authenticator app.`,
    'totp',
  );
}

/**
 * Refuses a payout while the destination is still new.
 *
 * This is the control that actually breaks the theft chain. Re-authentication
 * can be defeated by someone who has both the phone and the password; a hold
 * cannot, because it costs the attacker the one thing they do not have — time
 * during which the member reads the notification and revokes the session.
 *
 * Measured from the change, not from the request, so an attacker cannot reset
 * the clock by asking again.
 */
async function assertAddressSettled(userId: string, cfg: RuntimeConfig) {
  if (isSimulating()) return;
  if (cfg.withdrawalAddressHoldHours <= 0) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { walletAddressChangedAt: true },
  });
  const changedAt = user?.walletAddressChangedAt;
  if (!changedAt) return;

  const holdMs = cfg.withdrawalAddressHoldHours * 3_600_000;
  const releasesAt = new Date(changedAt.getTime() + holdMs);
  if (releasesAt <= new Date()) return;

  const hoursLeft = Math.ceil((releasesAt.getTime() - Date.now()) / 3_600_000);
  throw new AppError(
    `Your payout address changed recently, so withdrawals are on hold for another `
      + `${hoursLeft} hour${hoursLeft === 1 ? '' : 's'}. This protects your funds if someone `
      + `else reached your account. If you did not make this change, contact support now.`,
    403,
    'PAYOUT_ADDRESS_HOLD',
    { releasesAt: releasesAt.toISOString() },
  );
}

export async function request(
  userId: string,
  amount: string,
  walletAddress: string,
  req?: Request,
  stepUpMethod?: 'password' | 'totp',
) {
  const cfg = await config();
  const value = money(amount);

  if (!cfg.withdrawalsOpen) throw badRequest('Withdrawals are temporarily closed');
  if (value.lt(cfg.withdrawMin)) throw badRequest(`Minimum withdrawal is $${cfg.withdrawMin}`);
  if (value.gt(cfg.withdrawMax)) throw badRequest(`Maximum withdrawal is $${cfg.withdrawMax}`);
  if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) throw badRequest('Invalid BEP-20 address');

  await assertStepUpSufficient(value, cfg, stepUpMethod);
  await assertAddressSettled(userId, cfg);
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

  const created = await prisma.$transaction(async (tx) => {
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

    return created;
  });

  /**
   * Told after it is true, not before.
   *
   * These three writes go through the GLOBAL prisma client — deliberately, so
   * a failed notification can never fail a withdrawal. The consequence is that
   * they do not participate in the transaction above, so calling them from
   * inside it committed them on a separate connection regardless of whether
   * the enclosing transaction went on to commit. A late rollback — a commit
   * conflict, the interactive timeout, a dropped connection — left the member
   * holding "Withdrawal requested" and the operator holding a queue item for a
   * withdrawal that did not exist.
   */
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
    summary: `Requested a withdrawal of $${value.toString()} to ${masked}`,
    meta: { amount: value.toString(), fee: fee.toString(), net: net.toString(), address: walletAddress },
  });

  return created;
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

/**
 * The payout rail refused it after approval — give the money back.
 *
 * A gateway that answers `canceled` or `rejected` has told us the transfer
 * will never happen. Until this existed, that callback only wrote
 * `gatewayStatus` and stopped: the withdrawal stayed PROCESSED, the member
 * stayed debited, no refund was posted and nothing alerted. The member had
 * simply lost the money, and the only way anyone found out was a support
 * ticket.
 *
 * Claimed the same way as `approve` and `reject`: the status transition is the
 * lock, so a callback delivered twice refunds once. The ledger's unique
 * `reference` is the second guard behind it.
 */
export async function markPayoutFailed(id: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.withdrawal.updateMany({
      where: { id, status: 'PROCESSED' },
      data: { status: 'FAILED', rejectReason: reason },
    });
    if (claimed.count === 0) return null; // already handled, or never approved

    const w = await tx.withdrawal.findUniqueOrThrow({ where: { id } });

    // The full amount, fee included — the member is no worse off for an
    // approval that could not be delivered.
    await postEntry(tx, {
      userId: w.userId, walletType: 'MAIN', direction: 'CREDIT', category: 'REFUND',
      amount: money(w.amount.toString()),
      reference: `${w.reference}-GWFAIL`,
      description: `Payout failed at the gateway: ${reason}`,
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
