import {
  ContractFactory, HDNodeWallet, JsonRpcProvider, Mnemonic, NonceManager, Wallet, parseUnits,
} from 'ethers';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ERC20_ABI, ERC20_BYTECODE } from './fixtures/erc20.js';
import { prisma, resetData, seedPlan, makeUser, balanceOf, verifyKyc } from './helpers.js';

/**
 * The chain layer, against a real chain.
 *
 * These run against a local anvil node with a genuinely deployed ERC-20, so the
 * watcher parses real `Transfer` logs and the payout path signs and broadcasts
 * a real transaction. A mocked provider would only confirm that our mock agrees
 * with our assumptions — which is exactly the thing worth doubting in code that
 * moves money.
 *
 * The suite skips itself when no node is listening, so it never becomes the
 * reason a build fails on a machine without Docker.
 */

const RPC = process.env.TEST_RPC_URL ?? 'http://localhost:8545';
const MNEMONIC = 'test test test test test test test test test test test junk';
const CHAIN_ID = 31337;

/**
 * Probed at module load, not in `beforeAll`: `describe.skipIf` is evaluated
 * when the file is collected, which happens before any hook runs.
 */
/**
 * `cacheTimeout: -1` turns off ethers' response cache.
 *
 * It memoises `eth_getTransactionCount` for a moment, which is sensible against
 * a public RPC and wrong here: these tests send transfers faster than the cache
 * expires, so the nonce comes back stale and the node rejects the next one as
 * `nonce too low`.
 */
const provider = new JsonRpcProvider(RPC, CHAIN_ID, { staticNetwork: true, cacheTimeout: -1 });
const available = await provider
  .getBlockNumber()
  .then(() => true)
  .catch(() => false);

let wallet: Wallet;
/**
 * Wrapped in a NonceManager.
 *
 * These tests send several transfers between mined blocks, and ethers caches
 * `getTransactionCount` for a moment — so a naive send reuses a nonce and the
 * node rejects it as `nonce too low`. Tracking the nonce by hand fixed that and
 * introduced a worse failure: any drift left a gap, anvil held the transaction
 * in the pool without mining it, and `tx.wait()` hung until the test timed out.
 * NonceManager is the part of ethers that exists for this.
 */
let deployer: NonceManager;
let tokenAddress: string;
let xpub: string;

/** Re-imports the chain modules with fresh env, since config is read once. */
async function chainModules() {
  const config = await import('../src/core/chain/config.js');
  const provider_ = await import('../src/core/chain/provider.js');
  config.__resetChainState();
  provider_.__resetProvider();
  return {
    watcher: await import('../src/core/chain/watcher.js'),
    payouts: await import('../src/core/chain/payouts.js'),
    addresses: await import('../src/core/chain/addresses.js'),
    config,
  };
}

beforeAll(async () => {
  if (!available) return;

  // The deposit tree and the treasury are DELIBERATELY different accounts.
  // Sharing them would put the treasury inside the watched set, and its own
  // transfers — the initial mint, every sweep — would be credited to whichever
  // member happened to be assigned that index.
  const root = HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(MNEMONIC), "m/44'/60'/1'");
  xpub = root.neuter().extendedKey;

  // Account 0 index 0 is anvil's first pre-funded account; it deploys and pays.
  wallet = new Wallet(
    HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(MNEMONIC), "m/44'/60'/0'/0/0").privateKey,
    provider,
  );
  deployer = new NonceManager(wallet);

  const factory = new ContractFactory(ERC20_ABI, ERC20_BYTECODE, deployer);
  const token = await factory.deploy(parseUnits('1000000', 18));
  await token.waitForDeployment();
  tokenAddress = await token.getAddress();

  // Point the chain layer at this node.
  process.env.CHAIN_ENABLED = 'true';
  process.env.CHAIN_RPC_URL = RPC;
  process.env.CHAIN_ID = String(CHAIN_ID);
  process.env.CHAIN_TOKEN_ADDRESS = tokenAddress;
  process.env.CHAIN_TOKEN_DECIMALS = '18';
  process.env.CHAIN_DEPOSIT_XPUB = xpub;
  process.env.CHAIN_PAYOUT_KEY = wallet.privateKey;
  process.env.CHAIN_CONFIRMATIONS = '1';
  process.env.CHAIN_SCAN_BATCH = '500';
  process.env.CHAIN_MIN_DEPOSIT = '1';

  await seedPlan();
}, 120_000);

afterAll(async () => {
  /**
   * Every variable, and the cached state with them.
   *
   * `fileParallelism` is off, so the whole suite shares one process and one
   * `process.env`. This used to clear two of the nine variables it sets and
   * leave the memoised chain config alone — which did not matter while these
   * tests skipped themselves, and broke a dozen unrelated withdrawal tests the
   * moment a node was actually running: they saw a chain configured and queued
   * payouts instead of asking for a manual one.
   */
  for (const key of [
    'CHAIN_ENABLED', 'CHAIN_RPC_URL', 'CHAIN_ID',
    'CHAIN_TOKEN_ADDRESS', 'CHAIN_TOKEN_DECIMALS',
    'CHAIN_DEPOSIT_XPUB', 'CHAIN_PAYOUT_KEY',
    'CHAIN_CONFIRMATIONS', 'CHAIN_SCAN_BATCH', 'CHAIN_MIN_DEPOSIT',
  ]) delete process.env[key];

  const config = await import('../src/core/chain/config.js');
  const provider_ = await import('../src/core/chain/provider.js');
  config.__resetChainState();
  provider_.__resetProvider();
});

/**
 * The chain is append-only and shared by every test in this file, while the
 * database is wiped between them — so a member in one test can be handed the
 * same derived address as a member in the last. Anchoring the cursor to the
 * head at the start of each test keeps each scan to the transfers that test
 * actually made.
 */
let scanFrom = 0;

beforeEach(async () => {
  if (!available) return;
  await resetData();
  scanFrom = await provider.getBlockNumber();
  deployer.reset();
});

const sendTokens = async (to: string, amount: string) => {
  const { Contract } = await import('ethers');
  const token = new Contract(tokenAddress, ERC20_ABI, deployer);
  const tx = await (token as unknown as {
    transfer: (t: string, v: bigint) => Promise<{ wait: () => Promise<unknown> }>;
  }).transfer(to, parseUnits(amount, 18));
  await tx.wait();

  /**
   * One more block, so the transfer is actually confirmed.
   *
   * Anvil mines on demand, so a transfer lands in the head block and nothing
   * follows it. The watcher only reads up to `head - confirmations`, which is
   * correct — holding a transfer until it is confirmed is the whole point — so
   * without this the scan reports "up to date" and sees nothing. A chain that
   * produces blocks on a timer hides the gap; this one does not.
   */
  await provider.send('evm_mine', []);
};

/** Points the cursor at this test's starting block. */
const primeCursor = () =>
  prisma.chainCursor.upsert({
    where: { id: 'BEP20:token-deposits' },
    create: { id: 'BEP20:token-deposits', lastBlock: BigInt(scanFrom) },
    update: { lastBlock: BigInt(scanFrom) },
  });

describe.skipIf(!available)('deposit watcher against a live chain', () => {
  it('credits a member whose deposit address receives tokens', async () => {
    const { watcher, addresses } = await chainModules();
    const u = await makeUser();
    const address = await addresses.addressFor(u.id);

    await sendTokens(address, '250');
    await primeCursor();
    const result = await watcher.scanForDeposits();

    expect(result.skipped).toBe(false);
    expect(result.credited).toBe(1);
    expect(await balanceOf(u.id, 'FUND')).toBeCloseTo(250, 6);

    const deposit = await prisma.deposit.findFirstOrThrow({ where: { userId: u.id } });
    expect(deposit.status).toBe('PROCESSED');
    expect(deposit.txHash).toMatch(/^0x[0-9a-f]{64}$/);
  }, 60_000);

  it('credits exactly once however many times the same range is rescanned', async () => {
    const { watcher, addresses } = await chainModules();
    const u = await makeUser();
    await sendTokens(await addresses.addressFor(u.id), '100');

    // Three overlapping scans of the same blocks — which is what the watcher
    // does in production every time it restarts.
    for (let i = 0; i < 3; i += 1) {
      await primeCursor();
      await watcher.scanForDeposits();
    }

    expect(await balanceOf(u.id, 'FUND')).toBeCloseTo(100, 6);
    expect(await prisma.deposit.count({ where: { userId: u.id } })).toBe(1);
    expect(await prisma.onChainTransfer.count()).toBe(1);
  }, 60_000);

  it('attributes each transfer to the right member', async () => {
    const { watcher, addresses } = await chainModules();
    const a = await makeUser();
    const b = await makeUser();

    await sendTokens(await addresses.addressFor(a.id), '10');
    await sendTokens(await addresses.addressFor(b.id), '77');
    await primeCursor();
    await watcher.scanForDeposits();

    expect(await balanceOf(a.id, 'FUND')).toBeCloseTo(10, 6);
    expect(await balanceOf(b.id, 'FUND')).toBeCloseTo(77, 6);
  }, 60_000);

  it('ignores dust below the configured minimum', async () => {
    const { watcher, addresses } = await chainModules();
    const u = await makeUser();
    await sendTokens(await addresses.addressFor(u.id), '0.4');

    await primeCursor();
    await watcher.scanForDeposits();

    expect(await balanceOf(u.id, 'FUND')).toBe(0);
    const row = await prisma.onChainTransfer.findFirstOrThrow();
    expect(row.status).toBe('IGNORED');
  }, 60_000);

  it('ignores transfers to addresses that are not ours', async () => {
    const { watcher, addresses } = await chainModules();
    const u = await makeUser();
    await addresses.addressFor(u.id);
    await sendTokens(Wallet.createRandom().address, '500');

    await primeCursor();
    const result = await watcher.scanForDeposits();

    expect(result.credited).toBe(0);
    expect(await balanceOf(u.id, 'FUND')).toBe(0);
  }, 60_000);

  it('advances its cursor so the next scan starts where it stopped', async () => {
    const { watcher, addresses } = await chainModules();
    const u = await makeUser();
    await primeCursor();
    // A transaction plus a couple of blocks, so there is a real range to read
    // rather than a cursor already level with the confirmed head.
    await sendTokens(await addresses.addressFor(u.id), '5');
    await new Promise((r) => setTimeout(r, 2500));

    const first = await watcher.scanForDeposits();
    expect(first.skipped).toBe(false);

    const cursor = await prisma.chainCursor.findUniqueOrThrow({ where: { id: 'BEP20:token-deposits' } });
    expect(Number(cursor.lastBlock)).toBe(first.toBlock);

    // The next scan never re-reads a block it has already finished.
    const second = await watcher.scanForDeposits();
    expect(second.fromBlock).toBe(first.toBlock + 1);
  }, 60_000);

  it('reports how far behind the chain head it is', async () => {
    const { watcher } = await chainModules();
    await primeCursor();
    const status = await watcher.watcherStatus();

    expect(status.enabled).toBe(true);
    expect(status.head).toBeGreaterThan(0);
    expect(status.behind).toBeGreaterThanOrEqual(0);
  }, 60_000);
});

describe.skipIf(!available)('payouts against a live chain', () => {
  const ADDR_FOR_PAYOUT = () => Wallet.createRandom().address;

  const approvedWithdrawal = async (amount = '100') => {
    const u = await makeUser();
    await verifyKyc(u.id);
    await prisma.$executeRaw`UPDATE wallet_accounts SET balance = 5000 WHERE "userId" = ${u.id} AND type = 'MAIN'`;
    const { request } = await import('../src/modules/withdrawal/withdrawal.service.js');
    return request(u.id, amount, ADDR_FOR_PAYOUT());
  };

  it('actually sends the tokens and confirms', async () => {
    const { payouts } = await chainModules();
    const w = await approvedWithdrawal('100');

    await payouts.enqueue(w.id);
    const result = await payouts.processQueue();

    expect(result.confirmed).toBe(1);
    const row = await prisma.chainPayout.findUniqueOrThrow({ where: { withdrawalId: w.id } });
    expect(row.status).toBe('CONFIRMED');
    expect(row.txHash).toMatch(/^0x[0-9a-f]{64}$/);

    // The member received the NET amount — the fee stayed behind.
    const { Contract } = await import('ethers');
    const token = new Contract(tokenAddress, ERC20_ABI, provider);
    const received = await (token as unknown as { balanceOf: (a: string) => Promise<bigint> })
      .balanceOf(row.toAddress);
    expect(Number(received) / 1e18).toBeCloseTo(95, 6);
  }, 90_000);

  it('does not send twice when the queue runs again', async () => {
    const { payouts } = await chainModules();
    const w = await approvedWithdrawal('100');
    await payouts.enqueue(w.id);
    await payouts.processQueue();

    const first = await prisma.chainPayout.findUniqueOrThrow({ where: { withdrawalId: w.id } });
    await payouts.processQueue();
    await payouts.processQueue();
    const after = await prisma.chainPayout.findUniqueOrThrow({ where: { withdrawalId: w.id } });

    expect(after.txHash).toBe(first.txHash);
    expect(after.attempts).toBe(1);

    const { Contract } = await import('ethers');
    const token = new Contract(tokenAddress, ERC20_ABI, provider);
    const received = await (token as unknown as { balanceOf: (a: string) => Promise<bigint> })
      .balanceOf(after.toAddress);
    expect(Number(received) / 1e18).toBeCloseTo(95, 6);   // still 95, not 190
  }, 90_000);

  it('writes the transaction hash back onto the withdrawal', async () => {
    const { payouts } = await chainModules();
    const w = await approvedWithdrawal('100');
    await payouts.enqueue(w.id);
    await payouts.processQueue();

    const after = await prisma.withdrawal.findUniqueOrThrow({ where: { id: w.id } });
    expect(after.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(after.processedAt).not.toBeNull();
  }, 90_000);

  it('reports the treasury balance and what is queued against it', async () => {
    const { payouts } = await chainModules();
    const status = await payouts.treasuryStatus();

    expect(status.configured).toBe(true);
    if (status.configured) {
      expect(Number(status.tokenBalance)).toBeGreaterThan(0);
      expect(Number(status.gasBalance)).toBeGreaterThan(0);
    }
  }, 60_000);
});
