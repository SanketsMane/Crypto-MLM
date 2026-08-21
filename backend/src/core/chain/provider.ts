import { Contract, JsonRpcProvider, Wallet, formatUnits, parseUnits } from 'ethers';
import { decrypt } from '../crypto.js';
import { logger } from '../logger.js';
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
export function getSigner(): Wallet {
  const cfg = requireChain();
  if (!cfg.payoutKey) throw new Error('No payout key configured');

  let key: string;
  try {
    // Accept either an encrypted blob or, for a local chain, a raw key.
    key = cfg.payoutKey.startsWith('v1.') ? decrypt(cfg.payoutKey) : cfg.payoutKey;
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
