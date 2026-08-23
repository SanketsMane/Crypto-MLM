import { prisma } from '../../core/db.js';
import { postEntry } from '../../core/ledger.js';
import { money } from '../../core/money.js';
import { makeReference } from '../../core/reference.js';
import { badRequest, notFound } from '../../core/errors.js';
import * as activity from '../../core/activity.js';
import { notifyAdmins, notifyMember } from '../../core/notify.js';
import type { Request } from 'express';

/** USDT BEP-20 deposits land in the FUND wallet, which is what buys packages. */
export async function create(userId: string, amount: string, txHash?: string, req?: Request) {
  const value = money(amount);
  if (value.lte(0)) throw badRequest('Amount must be positive');

  const deposit = await prisma.deposit.create({
    data: {
      userId,
      amount: value.toString(),
      txHash,
      network: 'BEP20',
      reference: makeReference('DEP', userId),
      status: 'PENDING',
    },
  });

  activity.record({
    userId, event: 'DEPOSIT_CREATED', req,
    summary: `Reported a deposit of $${value.toString()}`,
    meta: { amount: value.toString(), txHash: txHash ?? null },
  });

  notifyAdmins({
    type: 'ops.deposit_pending',
    dedupeKey: `deposit-pending:${deposit.id}`,
    title: 'Deposit awaiting confirmation',
    body: `$${value.toString()} reported by a member. Confirm it on chain before crediting.`,
    meta: { depositId: deposit.id, amount: value.toString() },
  });
  return deposit;
}

/** Admin/webhook confirmation. Credits the FUND wallet exactly once. */
export async function confirm(depositId: string) {
  return prisma.$transaction(async (tx) => {
    const dep = await tx.deposit.findUnique({ where: { id: depositId } });
    if (!dep) throw notFound('Deposit not found');
    // Already credited — confirming again is a no-op, not an error, because a
    // webhook or a retried job is entitled to repeat itself.
    if (dep.status === 'PROCESSED') return dep;
    /* Anything else is a decision that has already been made. Only PROCESSED is
       safely repeatable; crediting a deposit an operator rejected would hand a
       member funds nobody sent, and the old guard let exactly that through. */
    if (dep.status !== 'PENDING') {
      throw badRequest(`This deposit was ${dep.status.toLowerCase()} and cannot be credited`);
    }

    await postEntry(tx, {
      userId: dep.userId,
      walletType: 'FUND',
      direction: 'CREDIT',
      category: 'DEPOSIT',
      amount: money(dep.amount.toString()),
      reference: dep.reference,
      description: `Deposit ${dep.network}`,
      meta: { txHash: dep.txHash ?? null },
      sourceType: 'deposit',
      sourceId: dep.id,
    });

    const confirmed = await tx.deposit.update({
      where: { id: dep.id },
      data: { status: 'PROCESSED', confirmedAt: new Date() },
    });

    activity.record({
      userId: dep.userId, event: 'DEPOSIT_CONFIRMED',
      summary: `Deposit of $${dep.amount.toString()} credited to your Fund wallet`,
      meta: { amount: dep.amount.toString(), txHash: dep.txHash ?? null },
    });

    notifyMember({
      userId: dep.userId,
      type: 'deposit.credited',
      dedupeKey: `deposit-credited:${dep.id}`,
      title: 'Deposit credited',
      body: `$${dep.amount.toString()} is now in your Fund wallet and ready to invest.`,
      meta: { amount: dep.amount.toString(), txHash: dep.txHash },
    });
    return confirmed;
  });
}

export const listForUser = (userId: string) =>
  prisma.deposit.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });

/**
 * A deposit that arrived on chain and is already confirmed.
 *
 * Goes through the same ledger entry, activity trail and notification as a
 * manually confirmed one, so there is a single path by which money enters a
 * member's Fund wallet however it got here. Idempotent on `txHash`: the watcher
 * re-reads overlapping block ranges by design, and a transfer seen twice must
 * credit once.
 */
export async function createConfirmed(input: {
  userId: string; amount: string; txHash: string;
}) {
  const existing = await prisma.deposit.findUnique({ where: { txHash: input.txHash } });
  if (existing) return existing;

  const value = money(input.amount);
  if (value.lte(0)) throw badRequest('Amount must be positive');

  const deposit = await prisma.deposit.create({
    data: {
      userId: input.userId,
      amount: value.toString(),
      txHash: input.txHash,
      network: 'BEP20',
      reference: makeReference('DEP', input.userId),
      status: 'PENDING',
    },
  });

  return confirm(deposit.id);
}