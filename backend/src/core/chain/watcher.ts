import { id as keccak, zeroPadValue, getAddress } from 'ethers';
import { prisma } from '../db.js';
import { logger } from '../logger.js';
import { money } from '../money.js';
import { chainState, requireChain } from './config.js';
import { fromUnits, getProvider, getToken } from './provider.js';
import { watchedAddresses } from './addresses.js';
import * as deposits from '../../modules/deposit/deposit.service.js';

/**
 * The deposit watcher.
 *
 * It reads `Transfer` logs for the token, filtered to addresses we handed out,
 * and credits the member once a transfer is deep enough to be safe.
 *
 * Four things this has to survive, all of which happen in practice:
 *
 *   • **Restarts.** The cursor lives in the database, so a restart resumes at
 *     the last finished block rather than rescanning from zero or skipping.
 *   • **Reorgs.** Nothing is credited until CHAIN_CONFIRMATIONS deep, and the
 *     scan window deliberately overlaps what it already read, so a transfer
 *     that moved blocks is seen again rather than lost.
 *   • **Double crediting.** Which the overlap above makes certain to be tried.
 *     The unique (txHash, logIndex) refuses it at the database.
 *   • **RPC limits.** Providers cap `eth_getLogs` ranges, so scanning is
 *     batched and a batch that fails simply retries next tick — the cursor is
 *     only advanced past blocks that were actually processed.
 */

const CURSOR_ID = 'BEP20:token-deposits';
const TRANSFER_TOPIC = keccak('Transfer(address,address,uint256)');

export interface ScanResult {
  skipped: boolean;
  reason?: string;
  fromBlock: number;
  toBlock: number;
  seen: number;
  credited: number;
}

export async function scanForDeposits(): Promise<ScanResult> {
  const state = chainState();
  if (!state.canWatch) {
    return { skipped: true, reason: state.reasons.join('; '), fromBlock: 0, toBlock: 0, seen: 0, credited: 0 };
  }

  const cfg = requireChain();
  const provider = getProvider();
  const head = await provider.getBlockNumber();

  // Only scan up to where confirmations are already satisfied. Reading fresher
  // blocks would mean holding transfers we cannot act on yet.
  const safeHead = head - cfg.confirmations;
  if (safeHead <= 0) {
    return { skipped: true, reason: 'chain too short', fromBlock: 0, toBlock: 0, seen: 0, credited: 0 };
  }

  const cursor = await prisma.chainCursor.findUnique({ where: { id: CURSOR_ID } });
  // First run starts at the safe head rather than at genesis: there is no
  // history to credit, and scanning millions of blocks would achieve nothing.
  const fromBlock = cursor ? Number(cursor.lastBlock) + 1 : safeHead;

  if (fromBlock > safeHead) {
    return { skipped: true, reason: 'up to date', fromBlock, toBlock: safeHead, seen: 0, credited: 0 };
  }

  const toBlock = Math.min(fromBlock + cfg.scanBatch - 1, safeHead);
  const watched = await watchedAddresses();

  let seen = 0;
  let credited = 0;

  if (watched.size > 0) {
    const logs = await provider.getLogs({
      address: cfg.tokenAddress,
      fromBlock,
      toBlock,
      // Filter on the recipient at the node rather than in our process. The
      // second indexed argument of Transfer is `to`.
      topics: [TRANSFER_TOPIC, null, [...watched.keys()].map((a) => zeroPadValue(a, 32))],
    });

    const token = getToken();
    for (const log of logs) {
      const parsed = token.interface.parseLog({ topics: [...log.topics], data: log.data });
      if (!parsed) continue;

      const to = String(parsed.args.to).toLowerCase();
      const from = String(parsed.args.from).toLowerCase();
      const userId = watched.get(to);
      if (!userId) continue;

      // A transfer that originated from an address we control is our own money
      // moving — a sweep, or a mis-set treasury sharing the deposit tree. It is
      // not a member funding their account, and crediting it would invent
      // balance out of nothing.
      if (watched.has(from)) {
        await ignoreTransfer(log.transactionHash, log.index, log.blockNumber, from, to,
          fromUnits(parsed.args.value as bigint), 'Internal transfer between our own addresses');
        continue;
      }

      seen += 1;
      const amount = fromUnits(parsed.args.value as bigint);
      const result = await recordTransfer({
        txHash: log.transactionHash,
        logIndex: log.index,
        blockNumber: log.blockNumber,
        from: String(parsed.args.from),
        to,
        amount,
        userId,
        minDeposit: cfg.minDeposit,
      });
      if (result === 'credited') credited += 1;
    }
  }

  // Advance only after the whole batch succeeded. A throw above leaves the
  // cursor where it was, so the range is retried rather than silently skipped.
  await prisma.chainCursor.upsert({
    where: { id: CURSOR_ID },
    create: { id: CURSOR_ID, lastBlock: BigInt(toBlock) },
    update: { lastBlock: BigInt(toBlock) },
  });

  if (seen) logger.info({ fromBlock, toBlock, seen, credited }, 'chain scan credited deposits');
  return { skipped: false, fromBlock, toBlock, seen, credited };
}

/** Records a transfer we deliberately will not credit, so it is still auditable. */
async function ignoreTransfer(
  txHash: string, logIndex: number, blockNumber: number,
  from: string, to: string, amount: string, note: string,
) {
  await prisma.onChainTransfer
    .create({
      data: {
        txHash, logIndex, blockNumber: BigInt(blockNumber),
        fromAddress: getAddress(from), toAddress: getAddress(to),
        amount, status: 'IGNORED', note,
      },
    })
    .catch(() => undefined); // already recorded
  logger.info({ txHash, note }, 'on-chain transfer ignored');
}

type TransferOutcome = 'credited' | 'ignored' | 'duplicate';

async function recordTransfer(input: {
  txHash: string; logIndex: number; blockNumber: number;
  from: string; to: string; amount: string; userId: string; minDeposit: number;
}): Promise<TransferOutcome> {
  const value = money(input.amount);
  const belowMinimum = value.lt(input.minDeposit);

  try {
    await prisma.onChainTransfer.create({
      data: {
        txHash: input.txHash,
        logIndex: input.logIndex,
        blockNumber: BigInt(input.blockNumber),
        fromAddress: getAddress(input.from),
        toAddress: getAddress(input.to),
        amount: value.toString(),
        userId: input.userId,
        status: belowMinimum ? 'IGNORED' : 'SEEN',
        note: belowMinimum ? `Below the ${input.minDeposit} minimum` : null,
      },
    });
  } catch {
    // Already recorded. The scan overlaps by design, so this is the common
    // path, not an error.
    return 'duplicate';
  }

  if (belowMinimum) {
    logger.info({ txHash: input.txHash, amount: input.amount }, 'on-chain transfer below minimum — ignored');
    return 'ignored';
  }

  // Credit through the ordinary deposit path, so an on-chain deposit produces
  // exactly the same ledger entries, activity trail and emails as a manual one.
  const deposit = await deposits.createConfirmed({
    userId: input.userId,
    amount: value.toString(),
    txHash: input.txHash,
  });

  await prisma.onChainTransfer.updateMany({
    where: { txHash: input.txHash, logIndex: input.logIndex },
    data: { status: 'CREDITED', depositId: deposit.id, creditedAt: new Date() },
  });

  logger.info(
    { userId: input.userId, amount: input.amount, txHash: input.txHash },
    'on-chain deposit credited',
  );
  return 'credited';
}

/** Where the watcher has read to — for the operator dashboard. */
export async function watcherStatus() {
  const state = chainState();
  const cursor = await prisma.chainCursor.findUnique({ where: { id: CURSOR_ID } });

  if (!state.enabled) {
    return { enabled: false, reasons: state.reasons, lastBlock: null, head: null, behind: null };
  }

  let head: number | null = null;
  try {
    head = await getProvider().getBlockNumber();
  } catch (err) {
    logger.warn({ err }, 'could not reach the chain RPC');
  }

  const lastBlock = cursor ? Number(cursor.lastBlock) : null;
  return {
    enabled: true,
    canWatch: state.canWatch,
    canPay: state.canPay,
    reasons: state.reasons,
    lastBlock,
    head,
    behind: head !== null && lastBlock !== null ? Math.max(0, head - lastBlock) : null,
    confirmations: state.config?.confirmations ?? null,
  };
}
