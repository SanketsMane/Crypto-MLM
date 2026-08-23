import { env } from '../../config/env.js';
import { logger } from '../logger.js';

/**
 * Chain settings are read live from the environment rather than from the
 * frozen boot snapshot.
 *
 * An RPC endpoint gets rate limited, a hot wallet key gets rotated after a
 * scare, a token address changes when moving between mainnet and testnet.
 * These are operational values with a different lifecycle from a database URL,
 * and re-reading them means `__resetChainState()` is enough to pick up a
 * change — no redeploy, and the test suite can point the whole subsystem at a
 * local node.
 *
 * Shapes are still validated at boot by the schema in config/env.ts; this only
 * changes *when* the value is read.
 */
const str = (key: string, fallback?: string) => process.env[key]?.trim() || fallback;
const int = (key: string, fallback: number) => {
  const raw = process.env[key];
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) ? n : fallback;
};
const flag = (key: string, fallback: boolean) => {
  const raw = process.env[key]?.trim().toLowerCase();
  if (raw === undefined || raw === '') return fallback;
  return raw !== 'false' && raw !== '0' && raw !== 'off';
};

/**
 * Whether on-chain settlement is live.
 *
 * The subsystem is off unless it is fully configured, and it says why when it
 * refuses to start. A chain integration that boots half-configured and starts
 * scanning is how a testnet address ends up receiving mainnet funds, so the
 * default is off and the failure is loud.
 */

export interface ChainConfig {
  rpcUrl: string;
  chainId: number;
  tokenAddress: string;
  tokenDecimals: number;
  depositXpub: string | null;
  payoutKey: string | null;
  confirmations: number;
  scanBatch: number;
  minDeposit: number;
}

export interface ChainState {
  enabled: boolean;
  /** Can derive addresses and watch for deposits. */
  canWatch: boolean;
  /** Can sign and broadcast outbound payments. */
  canPay: boolean;
  reasons: string[];
  config: ChainConfig | null;
}

let cached: ChainState | null = null;

export function chainState(): ChainState {
  if (cached) return cached;

  const enabled = flag('CHAIN_ENABLED', env.CHAIN_ENABLED);
  const rpcUrl = str('CHAIN_RPC_URL', env.CHAIN_RPC_URL);
  const depositXpub = str('CHAIN_DEPOSIT_XPUB', env.CHAIN_DEPOSIT_XPUB);
  const payoutKey = str('CHAIN_PAYOUT_KEY', env.CHAIN_PAYOUT_KEY);

  const reasons: string[] = [];
  if (!enabled) reasons.push('CHAIN_ENABLED is off');
  if (!rpcUrl) reasons.push('CHAIN_RPC_URL is not set');

  const canWatchBase = enabled && Boolean(rpcUrl);
  if (canWatchBase && !depositXpub) {
    reasons.push('CHAIN_DEPOSIT_XPUB is not set — deposit addresses cannot be derived');
  }
  if (canWatchBase && !payoutKey) {
    reasons.push('CHAIN_PAYOUT_KEY is not set — payouts stay manual');
  }

  cached = {
    enabled: canWatchBase,
    canWatch: canWatchBase && Boolean(depositXpub),
    canPay: canWatchBase && Boolean(payoutKey),
    reasons,
    config: canWatchBase
      ? {
          rpcUrl: rpcUrl!,
          chainId: int('CHAIN_ID', env.CHAIN_ID),
          tokenAddress: str('CHAIN_TOKEN_ADDRESS', env.CHAIN_TOKEN_ADDRESS)!,
          tokenDecimals: int('CHAIN_TOKEN_DECIMALS', env.CHAIN_TOKEN_DECIMALS),
          depositXpub: depositXpub ?? null,
          payoutKey: payoutKey ?? null,
          /**
           * Never below one.
           *
           * This was read straight from the environment with no floor. At zero
           * the watcher treats the head block as settled and credits deposits
           * out of it — and a head block can be reorged away, which means
           * crediting a member for money that never arrived. A negative value
           * was worse still: it would scan past the head, for blocks that do
           * not exist yet. Fifteen is the default and the right number for
           * BSC; one is the lowest that is merely unwise rather than unsound.
           */
          confirmations: Math.max(1, Math.floor(int('CHAIN_CONFIRMATIONS', env.CHAIN_CONFIRMATIONS))),
          scanBatch: int('CHAIN_SCAN_BATCH', env.CHAIN_SCAN_BATCH),
          minDeposit: int('CHAIN_MIN_DEPOSIT', env.CHAIN_MIN_DEPOSIT),
        }
      : null,
  };

  if (!cached.enabled) {
    logger.info({ reasons }, 'on-chain settlement is off — deposits and payouts stay manual');
  } else {
    logger.info(
      { chainId: cached.config!.chainId, token: cached.config!.tokenAddress, canWatch: cached.canWatch, canPay: cached.canPay },
      'on-chain settlement is on',
    );
  }
  return cached;
}

/** Test seam. */
export const __resetChainState = () => { cached = null; };

export function requireChain(): ChainConfig {
  const state = chainState();
  if (!state.config) {
    throw new Error(`On-chain settlement is not configured: ${state.reasons.join('; ')}`);
  }
  return state.config;
}
