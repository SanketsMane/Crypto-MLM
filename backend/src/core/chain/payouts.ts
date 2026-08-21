import { getAddress, isAddress } from 'ethers';
import { prisma } from '../db.js';
import { logger } from '../logger.js';
import { chainState, requireChain } from './config.js';
import { getProvider, getSigner, getToken, toUnits } from './provider.js';
import { sendQuietly } from '../email/mailer.js';
import * as templates from '../email/templates.js';

/**
 * Outbound USDT payments for approved withdrawals.
 *
 * Sending money on a public chain is not a function call that succeeds or
 * fails. It can time out while succeeding, get stuck behind gas and land twenty
 * minutes later, or be mined and then revert. Every one of those looks like
 * "error" to a naive caller, and retrying on "error" is how a platform pays a
 * member twice.
 *
 * So a payout is a small state machine backed by a row:
 *
 *   QUEUED    → approved, nothing broadcast
 *   BROADCAST → a transaction hash exists; the money may already be gone
 *   CONFIRMED → mined with status 1
 *   REVERTED  → mined with status 0; nothing moved, safe to retry
 *   FAILED    → never made it onto the network; safe to retry
 *
 * The rule that keeps this safe: a row in BROADCAST is NEVER re-sent. Its
 * transaction hash is checked instead. Only a payout that provably did not
 * happen — reverted, or rejected before broadcast — is ever retried.
 *
 * `withdrawalId` is unique, so one withdrawal can hold at most one payout row
 * no matter how many times anything here is called.
 */

export interface PayoutResult {
  status: 'QUEUED' | 'BROADCAST' | 'CONFIRMED' | 'REVERTED' | 'FAILED' | 'SKIPPED';
  txHash?: string | null;
  reason?: string;
}

/** Queues an approved withdrawal for payment. Broadcasts nothing itself. */
export async function enqueue(withdrawalId: string): Promise<PayoutResult> {
  const state = chainState();
  if (!state.canPay) {
    return { status: 'SKIPPED', reason: 'on-chain payouts are not configured — pay this one manually' };
  }

  const w = await prisma.withdrawal.findUnique({ where: { id: withdrawalId } });
  if (!w) return { status: 'SKIPPED', reason: 'withdrawal not found' };
  if (!isAddress(w.walletAddress)) {
    return { status: 'SKIPPED', reason: 'the stored payout address is not valid' };
  }

  const existing = await prisma.chainPayout.findUnique({ where: { withdrawalId } });
  if (existing) return { status: existing.status as PayoutResult['status'], txHash: existing.txHash };

  const row = await prisma.chainPayout.create({
    data: {
      withdrawalId,
      toAddress: getAddress(w.walletAddress),
      // The member receives the net; the fee stays with the platform.
      amount: w.netAmount.toString(),
    },
  });
  return { status: 'QUEUED', txHash: row.txHash };
}

/**
 * Works through queued payouts, one at a time.
 *
 * Serial on purpose. Every transaction from one signer consumes the next nonce,
 * and two in flight concurrently will race for it — the loser is rejected, or
 * worse, silently replaces the winner.
 */
export async function processQueue(limit = 10) {
  const state = chainState();
  if (!state.canPay) return { skipped: true, processed: 0, confirmed: 0, failed: 0 };

  // Anything already broadcast is reconciled first: it may have confirmed while
  // we were not looking, and knowing that comes before sending anything new.
  await reconcileBroadcast();

  const queued = await prisma.chainPayout.findMany({
    where: { status: { in: ['QUEUED', 'REVERTED', 'FAILED'] }, attempts: { lt: 3 } },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });

  let confirmed = 0;
  let failed = 0;

  for (const payout of queued) {
    const result = await broadcast(payout.id);
    if (result.status === 'CONFIRMED') confirmed += 1;
    if (result.status === 'FAILED' || result.status === 'REVERTED') failed += 1;
  }

  return { skipped: false, processed: queued.length, confirmed, failed };
}

async function broadcast(payoutId: string): Promise<PayoutResult> {
  const cfg = requireChain();

  // Claim it. The guard on status is what stops two workers broadcasting the
  // same payout: only one UPDATE can move it out of a retryable state.
  const { count } = await prisma.chainPayout.updateMany({
    where: { id: payoutId, status: { in: ['QUEUED', 'REVERTED', 'FAILED'] } },
    data: { status: 'BROADCAST', attempts: { increment: 1 }, error: null },
  });
  if (count === 0) return { status: 'SKIPPED', reason: 'already claimed' };

  const payout = await prisma.chainPayout.findUniqueOrThrow({ where: { id: payoutId } });

  try {
    const signer = getSigner();
    const token = getToken().connect(signer) as unknown as {
      transfer: (to: string, value: bigint) => Promise<{ hash: string; wait: (n?: number) => Promise<{ status: number | null; gasUsed: bigint } | null> }>;
    };

    const value = toUnits(payout.amount.toString());
    const tx = await token.transfer(payout.toAddress, value);

    // Record the hash IMMEDIATELY. If this process dies in the next second,
    // the money is already committed on the network, and the hash is the only
    // way to find out what happened to it.
    await prisma.chainPayout.update({
      where: { id: payout.id },
      data: { txHash: tx.hash, broadcastAt: new Date() },
    });
    logger.info({ payoutId, txHash: tx.hash, to: payout.toAddress }, 'payout broadcast');

    const receipt = await tx.wait(cfg.confirmations);
    if (!receipt) return { status: 'BROADCAST', txHash: tx.hash };

    if (receipt.status === 0) {
      // Mined but reverted: no tokens moved, so this is genuinely retryable.
      await prisma.chainPayout.update({
        where: { id: payout.id },
        data: { status: 'REVERTED', error: 'Transaction reverted on chain' },
      });
      logger.error({ payoutId, txHash: tx.hash }, 'payout reverted on chain');
      return { status: 'REVERTED', txHash: tx.hash };
    }

    await settle(payout.id, tx.hash, receipt.gasUsed?.toString());
    return { status: 'CONFIRMED', txHash: tx.hash };
  } catch (err) {
    return handleBroadcastFailure(payout.id, err);
  }
}

/**
 * A throw during broadcast is ambiguous, and treating it as failure is the
 * dangerous default.
 *
 * If a hash was recorded, the transaction reached the network and may well be
 * mined; the row stays BROADCAST and reconciliation will find out. Only an
 * error with no hash — rejected by the node, never sent — is safe to mark
 * FAILED and retry.
 */
async function handleBroadcastFailure(payoutId: string, err: unknown): Promise<PayoutResult> {
  const message = err instanceof Error ? err.message : String(err);
  const row = await prisma.chainPayout.findUniqueOrThrow({ where: { id: payoutId } });

  if (row.txHash) {
    await prisma.chainPayout.update({
      where: { id: payoutId },
      data: { error: message.slice(0, 500) },
    });
    logger.error(
      { payoutId, txHash: row.txHash, err },
      'payout broadcast errored after the transaction was sent — left for reconciliation, NOT retried',
    );
    return { status: 'BROADCAST', txHash: row.txHash, reason: message };
  }

  await prisma.chainPayout.update({
    where: { id: payoutId },
    data: { status: 'FAILED', error: message.slice(0, 500) },
  });
  logger.error({ payoutId, err }, 'payout failed before broadcast — safe to retry');
  return { status: 'FAILED', reason: message };
}

/** Checks on payouts that were broadcast but never resolved. */
export async function reconcileBroadcast() {
  const inFlight = await prisma.chainPayout.findMany({
    where: { status: 'BROADCAST', txHash: { not: null } },
    take: 50,
  });
  if (!inFlight.length) return 0;

  const provider = getProvider();
  let settled = 0;

  for (const payout of inFlight) {
    try {
      const receipt = await provider.getTransactionReceipt(payout.txHash!);
      if (!receipt) continue; // still pending

      if (receipt.status === 0) {
        await prisma.chainPayout.update({
          where: { id: payout.id },
          data: { status: 'REVERTED', error: 'Transaction reverted on chain' },
        });
      } else {
        await settle(payout.id, payout.txHash!, receipt.gasUsed?.toString());
        settled += 1;
      }
    } catch (err) {
      logger.warn({ err, payoutId: payout.id }, 'could not reconcile a broadcast payout');
    }
  }

  if (settled) logger.info({ settled }, 'reconciled broadcast payouts');
  return settled;
}

/** Marks a payout confirmed and tells the member their money is on its way. */
async function settle(payoutId: string, txHash: string, gasUsed?: string) {
  const payout = await prisma.chainPayout.update({
    where: { id: payoutId },
    data: { status: 'CONFIRMED', txHash, gasUsed, confirmedAt: new Date(), error: null },
  });

  const w = await prisma.withdrawal.update({
    where: { id: payout.withdrawalId },
    data: { txHash, processedAt: new Date() },
    include: { user: { select: { email: true } } },
  });

  logger.info({ payoutId, txHash, withdrawal: w.reference }, 'payout confirmed');
  sendQuietly(
    templates.withdrawalProcessed({
      to: w.user.email,
      amount: w.amount.toString(),
      net: w.netAmount.toString(),
      address: `${w.walletAddress.slice(0, 6)}…${w.walletAddress.slice(-4)}`,
      txHash,
    }),
  );
}

/** Hot wallet health — an operator needs to know before payouts start bouncing. */
export async function treasuryStatus() {
  const state = chainState();
  if (!state.canPay) {
    return { configured: false as const, reasons: state.reasons };
  }

  const signer = getSigner();
  const token = getToken();
  const [native, balance, pending] = await Promise.all([
    getProvider().getBalance(signer.address),
    (token as unknown as { balanceOf: (a: string) => Promise<bigint> }).balanceOf(signer.address),
    prisma.chainPayout.aggregate({
      where: { status: { in: ['QUEUED', 'BROADCAST'] } },
      _sum: { amount: true },
      _count: true,
    }),
  ]);

  const { fromUnits } = await import('./provider.js');
  return {
    configured: true as const,
    address: signer.address,
    tokenBalance: fromUnits(balance),
    // Gas is paid in BNB, and running out of it stops payouts just as dead as
    // running out of USDT — a separate number an operator has to watch.
    gasBalance: (Number(native) / 1e18).toFixed(6),
    queuedCount: pending._count,
    queuedAmount: pending._sum.amount?.toString() ?? '0',
  };
}
