/**
 * Operator switches for the payment rails.
 *
 * Deliberately a plain type with no imports. The gateway modules stay
 * synchronous and read their credentials from the environment; the switches
 * live in the database and are therefore async to read. Passing them in as a
 * value keeps those two worlds apart — `oxapay.gatewayState()` can still be
 * called at boot, or in a test, with nothing behind it.
 *
 * Every switch can only ever turn a rail OFF. Credentials come from the
 * environment, so a gateway with no key, or with its `*_ENABLED` variable off,
 * stays unavailable however these are set. An operator needs to be able to
 * stop a gateway in seconds without a deploy; nobody should be able to switch
 * one live from a console session without the keys having been deliberately
 * installed first.
 */
export interface GatewaySwitches {
  nowpaymentsDeposits: boolean;
  oxapayDeposits: boolean;
  oxapayPayouts: boolean;
}

/**
 * What applies when nobody has said otherwise.
 *
 * Used as the default argument throughout, so a caller that cannot await the
 * database — the boot-time payout check, a unit test — behaves exactly as it
 * did before these switches existed, and the environment alone decides.
 */
export const SWITCHES_ALL_ON: GatewaySwitches = {
  nowpaymentsDeposits: true,
  oxapayDeposits: true,
  oxapayPayouts: true,
};
