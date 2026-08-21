import { HDNodeWallet, getAddress } from 'ethers';
import { prisma } from '../db.js';
import { badRequest } from '../errors.js';
import { logger } from '../logger.js';
import { requireChain, chainState } from './config.js';

/**
 * Per-member deposit addresses, derived from an extended public key.
 *
 * The important property is what this file does NOT have: a private key. An
 * xpub derives every address in the chain but signs nothing, so the process
 * that hands out deposit addresses — the one on the public internet, taking
 * requests — is structurally incapable of moving funds. Sweeping and payouts
 * live elsewhere, behind a key that is not loaded here.
 *
 * Addresses are assigned once and never rotated. A member who saved their
 * address and sends to it a year later must still be credited, so an address is
 * permanently theirs.
 */

const PATH = '0/'; // receive chain, matching BIP-44 external addresses

/** Derives the address at an index. Pure — no database, no key material. */
export function deriveAddress(xpub: string, index: number): string {
  const node = HDNodeWallet.fromExtendedKey(xpub);
  return getAddress(node.derivePath(`${PATH}${index}`).address);
}

/**
 * The member's deposit address, creating it on first use.
 *
 * The index is allocated from a max()+1 under a serialised transaction. Two
 * members registering at the same instant must not be handed the same index,
 * and the unique constraint on both index and address is the backstop if they
 * somehow are.
 */
export async function addressFor(userId: string): Promise<string> {
  const existing = await prisma.depositAddress.findUnique({
    where: { userId },
    select: { address: true },
  });
  if (existing) return existing.address;

  const cfg = requireChain();
  if (!cfg.depositXpub) throw badRequest('Deposit addresses are not configured');

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const rows = await prisma.$queryRaw<{ next: number }[]>`
      SELECT COALESCE(MAX("derivationIndex"), -1) + 1 AS next FROM deposit_addresses`;
    const next = Number(rows[0]?.next ?? 0);

    const address = deriveAddress(cfg.depositXpub, next);
    try {
      const row = await prisma.depositAddress.create({
        data: { userId, address, derivationIndex: next },
      });
      logger.info({ userId, index: next }, 'deposit address assigned');
      return row.address;
    } catch {
      // Another request took this index. Re-read and try the next one.
      const now = await prisma.depositAddress.findUnique({
        where: { userId },
        select: { address: true },
      });
      if (now) return now.address;
    }
  }
  throw new Error('Could not allocate a deposit address');
}

/** Every address we watch, as a lookup for the block scanner. */
export async function watchedAddresses(): Promise<Map<string, string>> {
  const rows = await prisma.depositAddress.findMany({
    select: { address: true, userId: true },
  });
  // Lower-cased because log topics are not checksummed.
  return new Map(rows.map((r) => [r.address.toLowerCase(), r.userId]));
}

/**
 * What the member is shown.
 *
 * When the chain is not configured this returns null rather than a fabricated
 * address — showing a placeholder that looks like an address is how funds get
 * sent into nothing.
 */
export async function depositDetails(userId: string) {
  const state = chainState();
  if (!state.canWatch) {
    return {
      configured: false as const,
      address: null,
      network: 'BEP20',
      token: 'USDT',
      minimum: null,
      confirmations: null,
    };
  }

  const cfg = requireChain();
  return {
    configured: true as const,
    address: await addressFor(userId),
    network: 'BEP20',
    token: 'USDT',
    tokenAddress: cfg.tokenAddress,
    chainId: cfg.chainId,
    minimum: cfg.minDeposit,
    confirmations: cfg.confirmations,
  };
}
