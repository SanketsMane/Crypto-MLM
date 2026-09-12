import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { gatewayState } from '../src/core/gateway/oxapay.js';
import { state as nowState } from '../src/core/gateway/nowpayments.js';
import { payoutRail, assertPayoutRail } from '../src/core/payout-rail.js';
import { SWITCHES_ALL_ON, type GatewaySwitches } from '../src/core/gateway/switches.js';
import { __resetChainState } from '../src/core/chain/config.js';

/**
 * The operator switches, and the one property that must always hold:
 *
 *   a switch can take a rail OUT of service, and can never put one INTO it.
 *
 * Credentials live in the environment. If a console toggle could enable a
 * gateway that has no keys, an operator could point real member money at a
 * provider whose callbacks nothing can verify — the deposit would be paid and
 * could never be credited. So every test here that turns something ON against
 * an unconfigured environment expects it to stay off.
 */

const KEYS = [
  'OXAPAY_ENABLED', 'OXAPAY_MERCHANT_KEY', 'OXAPAY_PAYOUT_KEY',
  'NOWPAYMENTS_ENABLED', 'NOWPAYMENTS_API_KEY', 'NOWPAYMENTS_IPN_SECRET',
  'CHAIN_ENABLED', 'CHAIN_RPC_URL', 'CHAIN_PAYOUT_KEY', 'CHAIN_DEPOSIT_XPUB',
  'PAYOUT_RAIL',
] as const;

const saved = new Map<string, string | undefined>();

const sw = (over: Partial<GatewaySwitches> = {}): GatewaySwitches => ({ ...SWITCHES_ALL_ON, ...over });

function configureOxapay() {
  process.env.OXAPAY_ENABLED = 'true';
  process.env.OXAPAY_MERCHANT_KEY = 'merchant-key';
  process.env.OXAPAY_PAYOUT_KEY = 'payout-key';
}

function configureNowPayments() {
  process.env.NOWPAYMENTS_ENABLED = 'true';
  process.env.NOWPAYMENTS_API_KEY = 'api-key';
  process.env.NOWPAYMENTS_IPN_SECRET = 'ipn-secret';
}

beforeEach(() => {
  for (const k of KEYS) {
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

describe('a switch can only ever turn a rail off', () => {
  it('does not enable OxaPay deposits when no merchant key is installed', () => {
    // Nothing configured, every switch on: still off.
    expect(gatewayState(sw()).canCharge).toBe(false);
  });

  it('does not enable OxaPay payouts when no payout key is installed', () => {
    expect(gatewayState(sw({ oxapayPayouts: true })).canPay).toBe(false);
  });

  it('does not enable NOWPayments without an IPN secret, however the switch is set', () => {
    process.env.NOWPAYMENTS_ENABLED = 'true';
    process.env.NOWPAYMENTS_API_KEY = 'api-key';
    // No IPN secret: callbacks could not be verified, so charging stays off.
    expect(nowState(sw({ nowpaymentsDeposits: true })).canCharge).toBe(false);
  });

  it('does not override an environment that has the gateway switched off', () => {
    process.env.OXAPAY_ENABLED = 'false';
    process.env.OXAPAY_MERCHANT_KEY = 'merchant-key';
    expect(gatewayState(sw({ oxapayDeposits: true })).canCharge).toBe(false);
  });
});

describe('switching a configured rail off', () => {
  it('stops OxaPay deposits while leaving payouts alone', () => {
    configureOxapay();
    const s = gatewayState(sw({ oxapayDeposits: false }));
    expect(s.canCharge).toBe(false);
    expect(s.canPay).toBe(true);
  });

  it('stops OxaPay payouts while leaving deposits alone', () => {
    configureOxapay();
    const s = gatewayState(sw({ oxapayPayouts: false }));
    expect(s.canPay).toBe(false);
    expect(s.canCharge).toBe(true);
  });

  it('stops NOWPayments deposits', () => {
    configureNowPayments();
    expect(nowState(sw()).canCharge).toBe(true);
    expect(nowState(sw({ nowpaymentsDeposits: false })).canCharge).toBe(false);
  });

  it('names the operator decision rather than blaming a config variable', () => {
    configureOxapay();
    // An operator who switched this off has to recognise their own action in
    // the list — a line about OXAPAY_ENABLED would send them to the wrong place.
    expect(gatewayState(sw({ oxapayDeposits: false })).reasons)
      .toContain('OxaPay deposits are switched off in the console');
  });

  it('blames the missing credentials, not the switch, when a rail was never configured', () => {
    /* NOWPayments has nothing installed here. Whatever the switch says, the
       honest answer is "no credentials" — telling an operator it is switched
       off would send them to a toggle that cannot fix it. */
    const reasons = nowState(sw({ nowpaymentsDeposits: false })).reasons;
    expect(reasons).toContain('NOWPAYMENTS_API_KEY is not set — invoices cannot be raised');
    expect(reasons.join(' ')).not.toMatch(/switched off in the console/);
  });
});

describe('the payout rail honours the switch', () => {
  it('falls back to manual when gateway payouts are switched off', () => {
    configureOxapay();
    expect(payoutRail(sw()).rail).toBe('gateway');

    const off = payoutRail(sw({ oxapayPayouts: false }));
    expect(off.rail).toBe('manual');
    expect(off.ambiguous).toBe(false);
  });

  it('says the switch is why, not that the gateway is unconfigured', () => {
    configureOxapay();
    process.env.PAYOUT_RAIL = 'gateway';
    const off = payoutRail(sw({ oxapayPayouts: false }));
    expect(off.rail).toBe('manual');
    // These are different situations — an unfinished deployment, versus a
    // switch somebody threw on purpose and may have forgotten about.
    expect(off.reason).toMatch(/switched off in the console/);
    expect(off.reason).not.toMatch(/not configured/);
  });

  it('resolves an ambiguous two-rail deployment instead of creating one', () => {
    // Both rails able to send, nothing naming which: refuses.
    process.env.CHAIN_ENABLED = 'true';
    process.env.CHAIN_RPC_URL = 'https://rpc.test';
    process.env.CHAIN_DEPOSIT_XPUB = 'xpub-test';
    process.env.CHAIN_PAYOUT_KEY = 'chain-payout-key';
    __resetChainState();
    configureOxapay();

    expect(payoutRail(sw()).ambiguous).toBe(true);
    expect(() => assertPayoutRail(sw())).toThrowError(/pay the member twice/);

    /* Switching the gateway off removes the second sender, so the decision
       becomes unambiguous. A switch narrowing the field can only ever resolve
       an ambiguity — it has no way to introduce one. */
    const resolved = payoutRail(sw({ oxapayPayouts: false }));
    expect(resolved.ambiguous).toBe(false);
    expect(resolved.rail).toBe('chain');
    expect(() => assertPayoutRail(sw({ oxapayPayouts: false }))).not.toThrow();
  });
});

describe('the default leaves existing behaviour untouched', () => {
  it('behaves exactly as before when no switches are passed', () => {
    configureOxapay();
    configureNowPayments();
    // The boot check and every existing caller rely on this.
    expect(gatewayState()).toEqual(gatewayState(SWITCHES_ALL_ON));
    expect(nowState()).toEqual(nowState(SWITCHES_ALL_ON));
    expect(payoutRail()).toEqual(payoutRail(SWITCHES_ALL_ON));
  });
});
