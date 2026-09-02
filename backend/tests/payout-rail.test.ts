import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { payoutRail, assertPayoutRail } from '../src/core/payout-rail.js';
import { __resetChainState } from '../src/core/chain/config.js';

/**
 * One rail, one payment.
 *
 * The approval path used to call BOTH the on-chain worker and the gateway,
 * each guarded only by its own configuration. A deployment with both
 * configured sent `netAmount` twice for every approved withdrawal, and both
 * rails reported success, so nothing in the console disagreed.
 *
 * The regression these tests hold is the ambiguous case: two rails able to
 * send and nothing naming which. That must refuse, not choose.
 */

const CHAIN_KEYS = ['CHAIN_ENABLED', 'CHAIN_RPC_URL', 'CHAIN_PAYOUT_KEY', 'CHAIN_DEPOSIT_XPUB'] as const;
const GATEWAY_KEYS = ['OXAPAY_ENABLED', 'OXAPAY_MERCHANT_KEY', 'OXAPAY_PAYOUT_KEY'] as const;
const ALL = [...CHAIN_KEYS, ...GATEWAY_KEYS, 'PAYOUT_RAIL'] as const;

const saved = new Map<string, string | undefined>();

/** Chain payouts need enabled + an RPC + a payout key (core/chain/config.ts). */
function enableChain() {
  process.env.CHAIN_ENABLED = 'true';
  process.env.CHAIN_RPC_URL = 'https://rpc.test';
  process.env.CHAIN_DEPOSIT_XPUB = 'xpub-test';
  process.env.CHAIN_PAYOUT_KEY = 'chain-payout-key';
  __resetChainState();
}

/** Gateway payouts need enabled + a payout key (core/gateway/oxapay.ts). */
function enableGateway() {
  process.env.OXAPAY_ENABLED = 'true';
  process.env.OXAPAY_MERCHANT_KEY = 'merchant-key';
  process.env.OXAPAY_PAYOUT_KEY = 'payout-key';
}

beforeEach(() => {
  for (const k of ALL) {
    saved.set(k, process.env[k]);
    delete process.env[k];
  }
  __resetChainState();
});

afterEach(() => {
  for (const [k, v] of saved) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  saved.clear();
  __resetChainState();
});

describe('payout rail resolution', () => {
  it('refuses when both rails can send and nothing says which', () => {
    enableChain();
    enableGateway();

    const decision = payoutRail();
    expect(decision.ambiguous).toBe(true);
    expect(decision.rail).toBe('manual');
    expect(decision.reason).toMatch(/twice/i);

    // The approval path calls this before claiming the withdrawal, so an
    // ambiguous configuration leaves the request PENDING rather than approved
    // and unpaid.
    expect(() => assertPayoutRail()).toThrowError(/PAYOUT_RAIL/);
  });

  it('an explicit rail resolves the ambiguity in both directions', () => {
    enableChain();
    enableGateway();

    process.env.PAYOUT_RAIL = 'chain';
    expect(payoutRail()).toMatchObject({ rail: 'chain', ambiguous: false });

    process.env.PAYOUT_RAIL = 'gateway';
    expect(payoutRail()).toMatchObject({ rail: 'gateway', ambiguous: false });

    process.env.PAYOUT_RAIL = 'manual';
    expect(payoutRail()).toMatchObject({ rail: 'manual', ambiguous: false });
  });

  it('infers the single configured rail, so existing deployments need no config', () => {
    enableChain();
    expect(payoutRail()).toMatchObject({ rail: 'chain', ambiguous: false });

    for (const k of CHAIN_KEYS) delete process.env[k];
    __resetChainState();
    enableGateway();
    expect(payoutRail()).toMatchObject({ rail: 'gateway', ambiguous: false });
  });

  it('falls back to manual when neither rail can send', () => {
    const decision = payoutRail();
    expect(decision).toMatchObject({ rail: 'manual', ambiguous: false });
    expect(() => assertPayoutRail()).not.toThrow();
  });

  it('a named rail that is not configured falls back to manual rather than failing the approval', () => {
    // Nothing can double-send here, so the approval proceeds and the payout is
    // left for an operator — but the reason travels with the decision.
    process.env.PAYOUT_RAIL = 'gateway';
    const decision = payoutRail();
    expect(decision).toMatchObject({ rail: 'manual', ambiguous: false });
    expect(decision.reason).toMatch(/not configured/i);
  });
});
