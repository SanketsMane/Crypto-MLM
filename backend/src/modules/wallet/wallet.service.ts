import type { LedgerCategory, WalletType } from '@prisma/client';
import { prisma } from '../../core/db.js';
import { transferBetweenWallets } from '../../core/ledger.js';
import { money } from '../../core/money.js';
import { makeReference } from '../../core/reference.js';
import { getCapState } from '../../core/capping.js';
import * as activity from '../../core/activity.js';
import type { Request } from 'express';

export async function balances(userId: string) {
  const wallets = await prisma.walletAccount.findMany({ where: { userId }, orderBy: { type: 'asc' } });
  const cap = await getCapState(userId);
  return {
    wallets: wallets.map((w) => ({
      type: w.type,
      balance: w.balance.toString(),
      locked: w.locked.toString(),
      available: money(w.balance.toString()).sub(money(w.locked.toString())).toString(),
    })),
    capping: {
      limit: cap.capLimit.toString(),
      earned: cap.totalEarned.toString(),
      remaining: cap.remaining.toString(),
      isCapped: cap.isCapped,
      usedPercent: cap.capLimit.gt(0)
        ? Number(cap.totalEarned.div(cap.capLimit).mul(100).toFixed(2))
        : 0,
    },
  };
}

export async function ledger(
  userId: string,
  opts: { category?: LedgerCategory; walletType?: WalletType; take?: number; skip?: number } = {},
) {
  const where = {
    userId,
    ...(opts.category ? { category: opts.category } : {}),
    ...(opts.walletType ? { wallet: { type: opts.walletType } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: opts.take ?? 50,
      skip: opts.skip ?? 0,
      include: { wallet: { select: { type: true } } },
    }),
    prisma.ledgerEntry.count({ where }),
  ]);

  return {
    total,
    entries: rows.map((r) => ({
      id: r.id,
      wallet: r.wallet.type,
      direction: r.direction,
      category: r.category,
      amount: r.amount.toString(),
      balanceAfter: r.balanceAfter.toString(),
      reference: r.reference,
      description: r.description,
      meta: r.meta,
      createdAt: r.createdAt,
    })),
  };
}

export async function transfer(
  userId: string, from: WalletType, to: WalletType, amount: string, req?: Request,
) {
  const result = await transferBetweenWallets({
    userId, from, to,
    amount: money(amount),
    reference: makeReference('TRF', userId),
    description: `Transfer ${from} → ${to}`,
  });

  activity.record({
    userId, event: 'WALLET_TRANSFER', req,
    summary: `Moved $${amount} from your ${from.toLowerCase()} wallet to your ${to.toLowerCase()} wallet`,
    meta: { from, to, amount },
  });
  return result;
}
