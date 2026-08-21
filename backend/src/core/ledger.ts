import type { LedgerCategory, LedgerDirection, WalletType, Prisma } from '@prisma/client';
import { prisma, type Tx } from './db.js';
import { toDb } from './money.js';
import { conflict, insufficientFunds, notFound } from './errors.js';
import type { Decimal } from 'decimal.js';

/**
 * The ledger is the only place in this codebase permitted to move money.
 *
 * Two rules make it safe under concurrency — both are direct responses to the
 * defect found in the platform this project replaces, where balances were read
 * into PHP, modified, and written back (losing 71% of concurrent credits):
 *
 *   1. Balances move with an atomic `balance = balance + ?` in SQL. The value is
 *      never read into application memory and written back.
 *   2. Debits carry their guard in the same statement (`AND balance >= ?`), so a
 *      race cannot overdraw: whichever transaction loses simply matches 0 rows.
 *
 * Every entry needs a unique `reference`. A retried job reusing one hits the
 * unique index and is rejected rather than paying twice.
 */

export interface PostEntryInput {
  userId: string;
  walletType: WalletType;
  direction: LedgerDirection;
  category: LedgerCategory;
  amount: Decimal;
  reference: string;
  description?: string;
  meta?: Prisma.InputJsonValue;
  sourceType?: string;
  sourceId?: string;
}

interface BalanceRow {
  id: string;
  balance: string;
}

/** Ensures the three wallets exist for a user. Idempotent. */
export async function ensureWallets(userId: string, db: Tx = prisma): Promise<void> {
  const types: WalletType[] = ['MAIN', 'FUND', 'DIGITAL'];
  await db.walletAccount.createMany({
    data: types.map((type) => ({ userId, type })),
    skipDuplicates: true,
  });
}

/**
 * Post a single entry. MUST be called inside a transaction when it is part of a
 * larger unit of work (e.g. an investment purchase).
 */
export async function postEntry(db: Tx, input: PostEntryInput) {
  const amount = input.amount.toDecimalPlaces(8);
  if (amount.lte(0)) {
    throw conflict(`Ledger amount must be positive (got ${amount.toString()})`);
  }

  const wallet = await db.walletAccount.findUnique({
    where: { userId_type: { userId: input.userId, type: input.walletType } },
    select: { id: true },
  });
  if (!wallet) throw notFound(`Wallet ${input.walletType} not found for user`);

  const delta = input.direction === 'CREDIT' ? amount : amount.neg();

  // Atomic move. For debits the guard rides in the WHERE clause, so an
  // overdraw is impossible even under concurrent requests.
  const rows =
    input.direction === 'DEBIT'
      ? await db.$queryRaw<BalanceRow[]>`
          UPDATE wallet_accounts
             SET balance = balance + ${toDb(delta)}::numeric,
                 "updatedAt" = now()
           WHERE id = ${wallet.id}
             AND balance >= ${toDb(amount)}::numeric
       RETURNING id, balance::text AS balance`
      : await db.$queryRaw<BalanceRow[]>`
          UPDATE wallet_accounts
             SET balance = balance + ${toDb(delta)}::numeric,
                 "updatedAt" = now()
           WHERE id = ${wallet.id}
       RETURNING id, balance::text AS balance`;

  const row = rows[0];
  if (!row) throw insufficientFunds('Insufficient balance for this operation');

  return db.ledgerEntry.create({
    data: {
      userId: input.userId,
      walletId: wallet.id,
      direction: input.direction,
      category: input.category,
      amount: toDb(amount),
      balanceAfter: row.balance,
      reference: input.reference,
      description: input.description,
      meta: input.meta,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
    },
  });
}

/** Convenience wrapper that opens its own transaction for a standalone move. */
export async function post(input: PostEntryInput) {
  return prisma.$transaction((tx) => postEntry(tx, input));
}

/** Move value between two wallets owned by the same user, atomically. */
export async function transferBetweenWallets(params: {
  userId: string;
  from: WalletType;
  to: WalletType;
  amount: Decimal;
  reference: string;
  description?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const out = await postEntry(tx, {
      userId: params.userId,
      walletType: params.from,
      direction: 'DEBIT',
      category: 'TRANSFER_OUT',
      amount: params.amount,
      reference: `${params.reference}-OUT`,
      description: params.description,
    });
    const into = await postEntry(tx, {
      userId: params.userId,
      walletType: params.to,
      direction: 'CREDIT',
      category: 'TRANSFER_IN',
      amount: params.amount,
      reference: `${params.reference}-IN`,
      description: params.description,
    });
    return { out, into };
  });
}

/** True when the reference has already been posted — cheap pre-flight check. */
export async function alreadyPosted(reference: string, db: Tx = prisma): Promise<boolean> {
  const found = await db.ledgerEntry.findUnique({ where: { reference }, select: { id: true } });
  return found !== null;
}
