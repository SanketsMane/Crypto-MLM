import { Contract, JsonRpcProvider, Wallet, formatUnits, parseUnits } from 'ethers';
import { decrypt } from '../crypto.js';
import { logger } from '../logger.js';
import { env } from '../../config/env.js';
import { requireChain } from './config.js';

/**
 * The RPC connection and the token contract.
 *
 * Only the fragments actually used are declared. A full ERC-20 ABI would let a
 * typo call something unintended; four entries cannot.
 */
export const TOKEN_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'function transfer(address to, uint256 value) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
] as const;

let provider: JsonRpcProvider | null = null;

export function getProvider(): JsonRpcProvider {
  if (provider) return provider;
  const cfg = requireChain();
  // staticNetwork: the chain id never changes under us, so skip the probe on
  // every call and fail fast if the endpoint is on a different network.
  provider = new JsonRpcProvider(cfg.rpcUrl, cfg.chainId, { staticNetwork: true });
  return provider;
}

export const getToken = () => new Contract(requireChain().tokenAddress, TOKEN_ABI, getProvider());

/**
 * The signer for outbound payments.
 *
 * The key is stored encrypted and decrypted only here, at the moment it is
 * needed. It is never logged, never returned, and never reaches a request
 * handler — payouts run in the worker process, not the API.
 */
/** An encrypted payout key is stored as a `v1.` blob; anything else is raw. */
export const isEncryptedPayoutKey = (key: string): boolean => key.startsWith('v1.');

/**
 * A raw key is a development convenience, and it used to be accepted silently
 * everywhere — including production, where this one value can move every payout
 * the platform makes. Left unencrypted in `.env` it is readable by anyone with
 * file access and travels into process dumps, container inspects and backups.
 *
 * Refused outright in production rather than warned about: the failure mode of
 * a warning is that nobody reads it until the funds are gone. Elsewhere it is
 * allowed but says so loudly, once per process.
 *
 * Pure and exported so the rule can be tested without booting a chain — the
 * production branch of this file was otherwise unreachable from a test.
 */
export function assertPayoutKeyAcceptable(payoutKey: string, isProd: boolean): void {
  if (isEncryptedPayoutKey(payoutKey)) return;
  if (isProd) {
    throw new Error(
      'CHAIN_PAYOUT_KEY must be encrypted in production. Encrypt it with ENCRYPTION_KEY '
      + '(the stored value starts "v1.") — a raw private key in the environment is readable '
      + 'by anything that can read the process.',
    );
  }
  warnRawKeyOnce();
}

let rawKeyWarned = false;
function warnRawKeyOnce() {
  if (rawKeyWarned) return;
  rawKeyWarned = true;
  logger.warn(
    'CHAIN_PAYOUT_KEY is not encrypted. Acceptable against a local chain; production refuses it.',
  );
}

export function getSigner(): Wallet {
  const cfg = requireChain();
  if (!cfg.payoutKey) throw new Error('No payout key configured');

  const encrypted = cfg.payoutKey.startsWith('v1.');
  assertPayoutKeyAcceptable(cfg.payoutKey, env.isProd);

  let key: string;
  try {
    key = encrypted ? decrypt(cfg.payoutKey) : cfg.payoutKey;
  } catch (err) {
    logger.error({ err }, 'could not decrypt the payout key');
    throw new Error('Payout key could not be decrypted');
  }
  return new Wallet(key, getProvider());
}

/** Token units → a human amount string, at the token's decimals. */
export const fromUnits = (value: bigint) => formatUnits(value, requireChain().tokenDecimals);

/**
 * A human amount → token units.
 *
 * Truncates rather than rounds. Paying out a fraction more than was requested
 * is the platform's loss on every single withdrawal, and it compounds.
 */
export function toUnits(amount: string): bigint {
  const decimals = requireChain().tokenDecimals;
  const [whole, frac = ''] = amount.split('.');
  return parseUnits(`${whole}.${frac.slice(0, decimals).padEnd(decimals, '0')}`, decimals);
}

/** Test seam. */
export const __resetProvider = () => { provider = null; };
