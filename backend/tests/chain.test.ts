import { HDNodeWallet, Mnemonic } from 'ethers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deriveAddress } from '../src/core/chain/addresses.js';
import { chainState } from '../src/core/chain/config.js';
import { enqueue } from '../src/core/chain/payouts.js';
import { encrypt, decrypt } from '../src/core/crypto.js';
import { prisma, resetData, seedPlan, makeUser, verifyKyc } from './helpers.js';
import { request as requestWithdrawal } from '../src/modules/withdrawal/withdrawal.service.js';

/**
 * The chain is intentionally NOT configured in the test environment, so these
 * exercise the parts that must be correct whether or not an RPC is reachable:
 * address derivation, the off-by-default gate, and the payout state machine
 * that decides whether something may be retried.
 */

const MNEMONIC = 'test test test test test test test test test test test junk';
const xpub = HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(MNEMONIC), "m/44'/60'/0'").neuter().extendedKey;
const ADDR = '0x1234567890abcdef1234567890abcdef12345678';

beforeAll(seedPlan);
beforeEach(resetData);

describe('deposit address derivation', () => {
  it('derives the same address for an index every time', () => {
    expect(deriveAddress(xpub, 0)).toBe(deriveAddress(xpub, 0));
    expect(deriveAddress(xpub, 7)).toBe(deriveAddress(xpub, 7));
  });

  it('gives every index a different address', () => {
    const addresses = Array.from({ length: 25 }, (_, i) => deriveAddress(xpub, i));
    expect(new Set(addresses).size).toBe(25);
  });

  it('matches what the private key would produce for the same path', () => {
    // If these diverged, members would be sent to addresses the platform
    // cannot sweep — funds would arrive and be unrecoverable.
    for (const i of [0, 1, 5, 42]) {
      const signer = HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(MNEMONIC), `m/44'/60'/0'/0/${i}`);
      expect(deriveAddress(xpub, i)).toBe(signer.address);
    }
  });

  it('produces checksummed addresses', () => {
    const a = deriveAddress(xpub, 3);
    expect(a).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(a).not.toBe(a.toLowerCase());   // mixed case = checksummed
  });
});

describe('the chain subsystem is off unless configured', () => {
  it('reports itself off and says why', () => {
    const state = chainState();
    expect(state.enabled).toBe(false);
    expect(state.canWatch).toBe(false);
    expect(state.canPay).toBe(false);
    expect(state.reasons.length).toBeGreaterThan(0);
    expect(state.config).toBeNull();
  });

  it('does not queue a payout, and says the withdrawal needs paying by hand', async () => {
    const u = await makeUser();
    await verifyKyc(u.id);
    await prisma.$executeRaw`UPDATE wallet_accounts SET balance = 500 WHERE "userId" = ${u.id} AND type = 'MAIN'`;
    const w = await requestWithdrawal(u.id, '100', ADDR, undefined, 'password');

    const result = await enqueue(w.id);

    expect(result.status).toBe('SKIPPED');
    expect(result.reason).toMatch(/manually/);
    expect(await prisma.chainPayout.count()).toBe(0);
  });
});

describe('payout state machine', () => {
  /**
   * These drive the table directly. The rule under test is which states are
   * considered safe to retry — that decision, not the RPC call, is what
   * prevents paying a member twice.
   */
  const RETRYABLE = ['QUEUED', 'REVERTED', 'FAILED'] as const;
  const NOT_RETRYABLE = ['BROADCAST', 'CONFIRMED'] as const;

  const makePayout = async (status: string, txHash?: string) => {
    const u = await makeUser();
    await verifyKyc(u.id);
    await prisma.$executeRaw`UPDATE wallet_accounts SET balance = 500 WHERE "userId" = ${u.id} AND type = 'MAIN'`;
    const w = await requestWithdrawal(u.id, '100', ADDR, undefined, 'password');
    return prisma.chainPayout.create({
      data: { withdrawalId: w.id, toAddress: ADDR, amount: '95', status: status as never, txHash },
    });
  };

  it('one withdrawal can never have two payout rows', async () => {
    const p = await makePayout('QUEUED');
    await expect(
      prisma.chainPayout.create({
        data: { withdrawalId: p.withdrawalId, toAddress: ADDR, amount: '95' },
      }),
    ).rejects.toThrow();
  });

  it('enqueue returns the existing row instead of creating a second', async () => {
    const p = await makePayout('BROADCAST', '0xaaa');
    const again = await enqueue(p.withdrawalId);
    expect(await prisma.chainPayout.count({ where: { withdrawalId: p.withdrawalId } })).toBe(1);
    expect(again.status).toBe('SKIPPED');   // not configured here, so it stops earlier
  });

  it('treats only provably-unsent states as retryable', async () => {
    for (const status of RETRYABLE) {
      const p = await makePayout(status);
      const claimed = await prisma.chainPayout.updateMany({
        where: { id: p.id, status: { in: [...RETRYABLE] } },
        data: { status: 'BROADCAST' },
      });
      expect(claimed.count, `${status} should be retryable`).toBe(1);
      await resetData();
    }
  });

  it('never re-sends something already broadcast or confirmed', async () => {
    for (const status of NOT_RETRYABLE) {
      const p = await makePayout(status, `0x${status.toLowerCase()}`);
      const claimed = await prisma.chainPayout.updateMany({
        where: { id: p.id, status: { in: [...RETRYABLE] } },
        data: { status: 'BROADCAST' },
      });
      expect(claimed.count, `${status} must NOT be retried`).toBe(0);
      await resetData();
    }
  });

  it('only one of two concurrent workers can claim a payout', async () => {
    const p = await makePayout('QUEUED');
    const claim = () =>
      prisma.chainPayout.updateMany({
        where: { id: p.id, status: { in: [...RETRYABLE] } },
        data: { status: 'BROADCAST', attempts: { increment: 1 } },
      });

    const [a, b] = await Promise.all([claim(), claim()]);
    expect(a.count + b.count).toBe(1);

    const after = await prisma.chainPayout.findUniqueOrThrow({ where: { id: p.id } });
    expect(after.attempts).toBe(1);
  });

  it('pays the net amount, not the gross — the fee stays with the platform', async () => {
    const u = await makeUser();
    await verifyKyc(u.id);
    await prisma.$executeRaw`UPDATE wallet_accounts SET balance = 500 WHERE "userId" = ${u.id} AND type = 'MAIN'`;
    const w = await requestWithdrawal(u.id, '100', ADDR, undefined, 'password');

    const row = await prisma.chainPayout.create({
      data: { withdrawalId: w.id, toAddress: ADDR, amount: w.netAmount.toString() },
    });
    expect(Number(row.amount)).toBeCloseTo(95, 6);
    expect(Number(row.amount)).toBeLessThan(Number(w.amount));
  });
});

describe('observed transfers', () => {
  it('cannot record the same transfer twice', async () => {
    const u = await makeUser();
    const row = {
      txHash: '0xabc123', logIndex: 4, blockNumber: BigInt(100),
      fromAddress: ADDR, toAddress: ADDR, amount: '250', userId: u.id,
    };

    await prisma.onChainTransfer.create({ data: row });
    await expect(prisma.onChainTransfer.create({ data: row })).rejects.toThrow();
  });

  it('allows two transfers in the same transaction at different log indexes', async () => {
    const u = await makeUser();
    const base = {
      txHash: '0xbatch', blockNumber: BigInt(101),
      fromAddress: ADDR, toAddress: ADDR, amount: '10', userId: u.id,
    };

    await prisma.onChainTransfer.create({ data: { ...base, logIndex: 0 } });
    await prisma.onChainTransfer.create({ data: { ...base, logIndex: 1 } });
    expect(await prisma.onChainTransfer.count({ where: { txHash: '0xbatch' } })).toBe(2);
  });
});

describe('key material at rest', () => {
  it('round-trips an encrypted payout key', () => {
    const key = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
    const sealed = encrypt(key);

    expect(sealed).not.toContain(key);
    expect(sealed).toMatch(/^v1\./);
    expect(decrypt(sealed)).toBe(key);
  });

  it('produces different ciphertext each time, so equality leaks nothing', () => {
    const key = 'the-same-secret';
    expect(encrypt(key)).not.toBe(encrypt(key));
  });

  it('refuses ciphertext that has been tampered with', () => {
    const sealed = encrypt('the-same-secret');
    const parts = sealed.split('.');
    // Flip a character in the ciphertext body.
    parts[3] = parts[3]!.slice(0, -1) + (parts[3]!.endsWith('A') ? 'B' : 'A');

    expect(() => decrypt(parts.join('.'))).toThrow();
  });
});

describe('confirmation depth', () => {
  const withEnv = async (value: string) => {
    const before = process.env.CHAIN_CONFIRMATIONS;
    Object.assign(process.env, {
      CHAIN_ENABLED: 'true',
      CHAIN_RPC_URL: 'http://127.0.0.1:1',
      CHAIN_DEPOSIT_XPUB: 'xpub-placeholder',
      CHAIN_CONFIRMATIONS: value,
    });
    const config = await import('../src/core/chain/config.js');
    config.__resetChainState();
    const depth = config.chainState().config?.confirmations;
    config.__resetChainState();

    for (const k of ['CHAIN_ENABLED', 'CHAIN_RPC_URL', 'CHAIN_DEPOSIT_XPUB']) delete process.env[k];
    if (before === undefined) delete process.env.CHAIN_CONFIRMATIONS;
    else process.env.CHAIN_CONFIRMATIONS = before;
    return depth;
  };

  it('never settles on the head block', async () => {
    /**
     * At zero the watcher would treat the chain head as final and credit a
     * deposit out of it. Heads get reorged; the member would be paid for money
     * that never arrived, and the ledger entry is append-only.
     */
    expect(await withEnv('0')).toBe(1);
  });

  it('refuses to scan past the head', async () => {
    // A negative depth reads blocks that do not exist yet.
    expect(await withEnv('-5')).toBe(1);
  });

  it('keeps a sensible depth as given', async () => {
    expect(await withEnv('15')).toBe(15);
  });

  it('does not accept a fractional block', async () => {
    expect(await withEnv('3.7')).toBe(3);
  });
});
