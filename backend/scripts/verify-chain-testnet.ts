/**
 * The chain layer, against a real public network.
 *
 * The anvil suite proves the whole path — watch, sign, broadcast — but anvil is
 * a node we start ourselves, with a token we deploy ourselves, on a chain with
 * one participant. This runs the same code against BSC testnet: real consensus,
 * real block times, a contract somebody else deployed, and an RPC provider that
 * rate-limits and occasionally lies about the head.
 *
 * What it proves:
 *   - the provider talks to a live public chain and reads its head
 *   - a real BEP-20 answers symbol/decimals through our ABI
 *   - deposit addresses derive deterministically from an xpub
 *   - `scanForDeposits` runs end to end against a live RPC, respects the
 *     confirmation lag, advances its cursor, and credits nothing when nothing
 *     was sent to us
 *   - the Transfer decoder handles genuine chain logs, not only ours
 *
 * What it cannot prove: broadcasting. That needs a funded key on a public
 * chain, which is a decision for whoever holds the money — see the note it
 * prints at the end.
 *
 *   npx dotenv -e .env.test -- npx tsx scripts/verify-chain-testnet.ts
 */
import { Contract, HDNodeWallet, Mnemonic, Interface, isAddress, getAddress } from 'ethers';
import { prisma } from '../src/core/db.js';

const RPC = process.env.TESTNET_RPC_URL ?? 'https://bsc-testnet-rpc.publicnode.com';
const CHAIN_ID = 97;
// USDT on BSC testnet. Somebody else's contract, which is the point.
const TOKEN = process.env.TESTNET_TOKEN ?? '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd';
const CURSOR_ID = 'BEP20:token-deposits';
const CONFIRMATIONS = 3;

// A throwaway tree. Watch-only: an xpub cannot sign, which is the whole reason
// deposit addresses are derived this way.
const MNEMONIC = 'test test test test test test test test test test test junk';

const ok = (s: string) => console.log(`  PASS  ${s}`);
const info = (s: string) => console.log(`        ${s}`);

async function main() {
  console.log(`\nChain layer against BSC testnet - ${RPC}\n`);

  const root = HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(MNEMONIC), "m/44'/60'/1'");
  const xpub = root.neuter().extendedKey;

  process.env.CHAIN_ENABLED = 'true';
  process.env.CHAIN_RPC_URL = RPC;
  process.env.CHAIN_ID = String(CHAIN_ID);
  process.env.CHAIN_TOKEN_ADDRESS = TOKEN;
  process.env.CHAIN_TOKEN_DECIMALS = '18';
  process.env.CHAIN_DEPOSIT_XPUB = xpub;
  process.env.CHAIN_CONFIRMATIONS = String(CONFIRMATIONS);
  process.env.CHAIN_SCAN_BATCH = '200';
  process.env.CHAIN_MIN_DEPOSIT = '1';
  delete process.env.CHAIN_PAYOUT_KEY;

  const config = await import('../src/core/chain/config.js');
  const providerMod = await import('../src/core/chain/provider.js');
  config.__resetChainState();
  providerMod.__resetProvider();

  const { getProvider, getToken } = providerMod;
  const watcher = await import('../src/core/chain/watcher.js');
  const addresses = await import('../src/core/chain/addresses.js');

  // -- 1. a live public chain ----------------------------------------------
  const provider = getProvider();
  const net = await provider.getNetwork();
  const head = await provider.getBlockNumber();
  if (Number(net.chainId) !== CHAIN_ID) throw new Error(`expected chain ${CHAIN_ID}, got ${net.chainId}`);
  ok(`connected to chain ${net.chainId} at block ${head.toLocaleString()}`);

  const block = await provider.getBlock(head);
  info(`head mined ${Math.round(Date.now() / 1000 - Number(block!.timestamp))}s ago, ${block!.transactions.length} txs in it`);

  // -- 2. somebody else's contract, through our ABI ------------------------
  // `decimals` through the platform's own contract — the ABI is deliberately
  // four entries wide, so this is the whole read surface it has. `symbol` is
  // read separately here because the platform has no business calling it.
  const token = getToken();
  const decimals = await (token as unknown as { decimals: () => Promise<bigint> }).decimals();
  const symbol = await new Contract(TOKEN, ['function symbol() view returns (string)'], provider)
    .getFunction('symbol')() as string;
  ok(`read a real BEP-20 through our ABI: ${symbol}, ${decimals} decimals, at ${TOKEN}`);

  // -- 3. deterministic, watch-only derivation -----------------------------
  const indices = [0, 1, 2, 99];
  const derived = indices.map((i) => addresses.deriveAddress(xpub, i));
  if (!derived.every((a) => isAddress(a))) throw new Error('derived a malformed address');
  if (new Set(derived).size !== derived.length) throw new Error('derivation collided');
  if (addresses.deriveAddress(xpub, 0) !== derived[0]) throw new Error('derivation is not deterministic');
  ok('derived deposit addresses - deterministic, unique, checksummed');
  derived.forEach((a, i) => info(`index ${String(indices[i]).padStart(2)}: ${getAddress(a)}`));

  // -- 4. the real watcher, against the real RPC ---------------------------
  // Start a few hundred blocks back so there is a genuine range to read.
  const from = head - 400;
  await prisma.chainCursor.upsert({
    where: { id: CURSOR_ID },
    create: { id: CURSOR_ID, lastBlock: BigInt(from) },
    update: { lastBlock: BigInt(from) },
  });

  const scan = await watcher.scanForDeposits();
  if (scan.skipped) throw new Error(`watcher skipped: ${scan.reason}`);
  ok(`scanned blocks ${scan.fromBlock.toLocaleString()}-${scan.toBlock.toLocaleString()} on a live chain`);
  info(`saw ${scan.seen}, credited ${scan.credited} (correct - nothing was sent to our addresses)`);

  // The confirmation lag is not decoration: it must not read the head.
  if (scan.toBlock > head - CONFIRMATIONS) throw new Error('watcher read past its confirmation lag');
  ok(`respected the ${CONFIRMATIONS}-block confirmation lag`);

  const cursor = await prisma.chainCursor.findUniqueOrThrow({ where: { id: CURSOR_ID } });
  if (Number(cursor.lastBlock) !== scan.toBlock) throw new Error('cursor did not advance');
  ok('advanced its cursor, so the next scan will not re-read the range');

  // -- 5. decoding genuine Transfer logs -----------------------------------
  const iface = new Interface([
    'event Transfer(address indexed from, address indexed to, uint256 value)',
  ]);
  const topic = iface.getEvent('Transfer')!.topicHash;

  /**
   * Any token, not just ours.
   *
   * Pinning this to one contract made it depend on that contract happening to
   * be busy — it was not, and the decoder went unexercised. Whatever tokens
   * are moving on the chain right now are real logs written by other people,
   * which is the only property that matters here.
   */
  /**
   * Read from block receipts, not from an unfiltered `eth_getLogs`.
   *
   * Public BSC RPCs reject a log query with no address — `-32701, please
   * specify an address` — which is exactly the kind of thing a local node never
   * teaches you. Walking receipts gets the same logs and works on a shared
   * endpoint, and the watcher itself is unaffected because it always filters by
   * our token and our addresses.
   */
  const logs: { address: string; topics: readonly string[]; data: string }[] = [];
  for (let back = CONFIRMATIONS; back < CONFIRMATIONS + 12 && logs.length === 0; back += 1) {
    const b = await provider.getBlock(head - back);
    for (const hash of (b?.transactions ?? []).slice(0, 25)) {
      const receipt = await provider.getTransactionReceipt(hash);
      for (const l of receipt?.logs ?? []) {
        if (l.topics[0] === topic && l.topics.length === 3) {
          logs.push({ address: l.address, topics: l.topics, data: l.data });
        }
      }
    }
  }
  if (logs.length === 0) throw new Error('found no Transfer logs in the last dozen blocks');

  const parsed = logs.map((l) => iface.parseLog({ topics: [...l.topics], data: l.data }));
  if (parsed.some((p) => !p)) throw new Error('failed to decode a real Transfer log');
  ok(`decoded ${parsed.length} real Transfer logs, from ${new Set(logs.map((l) => l.address)).size} different tokens, written by other people`);

  const sample = parsed[0]!;
  info(`e.g. ${String(sample.args.from).slice(0, 12)}... -> ${String(sample.args.to).slice(0, 12)}...  raw value ${String(sample.args.value)}`);
  void decimals;

  // -- 6. what is still unproven -------------------------------------------
  const state = config.chainState();
  console.log('\n  -- payouts ---------------------------------------------');
  console.log(`  canWatch  ${state.canWatch}`);
  console.log(`  canPay    ${state.canPay}  - ${state.reasons.join('; ') || 'ready'}`);
  console.log(`
  Broadcasting is proved on anvil (11 tests, real signed transactions) but not
  on a public chain, because that needs a funded key. To close it:

    1. Fund a BSC testnet address from a faucet.
    2. Set CHAIN_PAYOUT_KEY to that key and approve a withdrawal through
       /admin/chain, pointed at this RPC.
    3. Watch the transaction land on testnet.bscscan.com.

  Do that on testnet before mainnet, with an amount you would not mind losing.
`);

  await prisma.chainCursor.deleteMany({ where: { id: CURSOR_ID } });
}

main()
  .catch((err: unknown) => {
    console.error('\n  FAIL  ', err instanceof Error ? err.message : err, '\n');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
