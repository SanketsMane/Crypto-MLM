import { chainState } from './chain/config.js';
import { gatewayState } from './gateway/oxapay.js';
import { AppError } from './errors.js';

/**
 * Which rail actually sends an approved withdrawal.
 *
 * There are two ways to pay a member — sign a BEP-20 transfer from our own hot
 * wallet, or hand the payout to OxaPay — and until this module existed the
 * approval path called BOTH, unconditionally. Each guarded only itself:
 * `payouts.enqueue` skipped when the chain was unconfigured, `sendPayout`
 * skipped when the gateway was. Neither asked whether the other had already
 * paid. A deployment with both configured therefore sent `netAmount` twice for
 * every approved withdrawal, and both rails independently reported success, so
 * nothing in the console disagreed.
 *
 * The rail is now a single decision made in one place, before any money moves.
 *
 * `PAYOUT_RAIL` names it outright. Left unset, it is inferred — which keeps
 * every existing single-rail deployment working untouched:
 *
 *   only the chain configured    → chain
 *   only the gateway configured  → gateway
 *   neither                      → manual (an operator pays by hand)
 *   BOTH, and nothing named one  → ambiguous: refuse, and say why
 *
 * Refusing is the point. The alternative is picking one for the operator, and
 * a wrong guess here spends real money we cannot recall.
 */

export type PayoutRail = 'chain' | 'gateway' | 'manual';

export interface RailDecision {
  rail: PayoutRail;
  /** True when the configuration cannot be resolved safely. Nothing may be sent. */
  ambiguous: boolean;
  /** Operator-facing explanation, suitable for a log line or an error body. */
  reason: string;
}

const named = (): PayoutRail | null => {
  const raw = process.env.PAYOUT_RAIL?.trim().toLowerCase();
  return raw === 'chain' || raw === 'gateway' || raw === 'manual' ? raw : null;
};

export function payoutRail(): RailDecision {
  const chain = chainState().canPay;
  const gateway = gatewayState().canPay;
  const choice = named();

  if (choice === 'manual') {
    return { rail: 'manual', ambiguous: false, reason: 'PAYOUT_RAIL=manual — approved withdrawals are paid by hand' };
  }

  /**
   * An explicitly named rail that is not configured is a misconfiguration, but
   * not a dangerous one: nothing can double-send, so approvals continue and the
   * payout falls back to manual. The reason travels with the decision so the
   * operator finds out from the console rather than from a member.
   */
  if (choice === 'chain') {
    return chain
      ? { rail: 'chain', ambiguous: false, reason: 'PAYOUT_RAIL=chain' }
      : { rail: 'manual', ambiguous: false, reason: 'PAYOUT_RAIL=chain, but on-chain payouts are not configured — pay this one manually' };
  }

  if (choice === 'gateway') {
    return gateway
      ? { rail: 'gateway', ambiguous: false, reason: 'PAYOUT_RAIL=gateway' }
      : { rail: 'manual', ambiguous: false, reason: 'PAYOUT_RAIL=gateway, but the gateway is not configured — pay this one manually' };
  }

  // Nothing named. Infer, and refuse rather than guess when both could send.
  if (chain && gateway) {
    return {
      rail: 'manual',
      ambiguous: true,
      reason:
        'Both on-chain payouts and the OxaPay gateway are configured to send money, and PAYOUT_RAIL does not say which should. '
        + 'Approving now would pay the member twice. Set PAYOUT_RAIL to chain, gateway or manual, or unconfigure one rail.',
    };
  }
  if (chain) return { rail: 'chain', ambiguous: false, reason: 'on-chain payouts are the only configured rail' };
  if (gateway) return { rail: 'gateway', ambiguous: false, reason: 'the OxaPay gateway is the only configured rail' };

  return { rail: 'manual', ambiguous: false, reason: 'no automatic payout rail is configured — pay approved withdrawals by hand' };
}

/**
 * Throws when the rail cannot be resolved. Called before a withdrawal is
 * claimed, so an ambiguous configuration leaves the request PENDING and
 * re-approvable rather than stranding it approved-but-unpaid.
 */
export function assertPayoutRail(): RailDecision {
  const decision = payoutRail();
  if (decision.ambiguous) {
    throw new AppError(decision.reason, 503, 'PAYOUT_RAIL_AMBIGUOUS');
  }
  return decision;
}
