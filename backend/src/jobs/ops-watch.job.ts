import { prisma } from '../core/db.js';
import { logger } from '../core/logger.js';
import { notifyAdmins } from '../core/notify.js';
import { chainState } from '../core/chain/config.js';
import { treasuryStatus } from '../core/chain/payouts.js';
import { watcherStatus } from '../core/chain/watcher.js';
import { config } from '../core/runtime-config.js';

/**
 * Watches the things an operator would otherwise find out about from a member.
 *
 * Everything here is a *condition*, not an event: a withdrawal that has been
 * sitting too long, a hot wallet running dry, a block watcher that stopped
 * moving. Nothing raises these at the moment they happen, because at the moment
 * they happen they are all perfectly normal.
 *
 * Alerts are deduped per day rather than per run. This job ticks every fifteen
 * minutes, and an unfixable condition must not produce ninety-six identical
 * alerts before anyone reaches their desk.
 */

const today = () => new Date().toISOString().slice(0, 10);

/** Below this many hours of gas, payouts are close to stopping. */
const LOW_GAS_BNB = 0.05;
/** A watcher this far behind the chain head has stopped keeping up. */
const STALLED_BLOCKS = 1_000;
/** A gateway payout not settled this long after approval needs a human. */
const GATEWAY_SETTLE_HOURS = 6;

export interface OpsWatchResult {
  overdueWithdrawals: number;
  largeWithdrawals: number;
  stuckPayouts: number;
  /** Approved but handed to the gateway and never confirmed. */
  stalledGatewayPayouts: number;
  treasuryLow: boolean;
  watcherStalled: boolean;
}

export async function runOpsWatch(): Promise<OpsWatchResult> {
  const cfg = await config();
  const day = today();

  // ── withdrawals past their SLA ──
  const overdue = await prisma.withdrawal.findMany({
    where: { status: 'PENDING', slaDueAt: { lt: new Date() } },
    select: { id: true, amount: true, reference: true, slaDueAt: true },
    take: 100,
  });

  if (overdue.length) {
    const oldest = overdue.reduce((a, b) => (a.slaDueAt < b.slaDueAt ? a : b));
    const hoursLate = Math.floor((Date.now() - oldest.slaDueAt.getTime()) / 3_600_000);
    notifyAdmins({
      type: 'ops.withdrawal_overdue',
      dedupeKey: `overdue:${day}:${overdue.length}`,
      title: `${overdue.length} withdrawal${overdue.length === 1 ? '' : 's'} past the SLA`,
      body: `The oldest is ${hoursLate} hour${hoursLate === 1 ? '' : 's'} late. Members are waiting on money they have already been debited for.`,
      meta: { count: overdue.length, oldestHoursLate: hoursLate },
    });
  }

  // ── unusually large withdrawals ──
  // Half the configured maximum: big enough to be worth a second pair of eyes,
  // not so common that it becomes background noise.
  const largeThreshold = cfg.withdrawMax / 2;
  const large = await prisma.withdrawal.findMany({
    where: { status: 'PENDING', amount: { gte: largeThreshold } },
    select: { id: true, amount: true, user: { select: { userCode: true } } },
    take: 20,
  });

  for (const w of large) {
    notifyAdmins({
      type: 'ops.withdrawal_large',
      dedupeKey: `large-withdrawal:${w.id}`,
      title: `Large withdrawal — $${w.amount.toString()}`,
      body: `${w.user.userCode} has requested $${w.amount.toString()}, at or above half the $${cfg.withdrawMax} limit. Worth a second look before approving.`,
      meta: { withdrawalId: w.id, amount: w.amount.toString() },
    });
  }

  // ── on-chain health ──
  let stuckPayouts = 0;
  let treasuryLow = false;
  let watcherStalled = false;

  if (chainState().enabled) {
    const stuck = await prisma.chainPayout.findMany({
      where: { OR: [{ status: { in: ['FAILED', 'REVERTED'] } }, { attempts: { gte: 3 } }] },
      select: { id: true, amount: true, error: true },
      take: 50,
    });
    stuckPayouts = stuck.length;

    if (stuck.length) {
      notifyAdmins({
        type: 'system.payout_failed',
        dedupeKey: `stuck-payouts:${day}:${stuck.length}`,
        title: `${stuck.length} payout${stuck.length === 1 ? '' : 's'} need attention`,
        body: 'These were approved but could not be sent on chain. The members have been debited and are waiting.',
        meta: { count: stuck.length },
      });
    }

    try {
      const treasury = await treasuryStatus();
      if (treasury.configured) {
        const gas = Number(treasury.gasBalance);
        const balance = Number(treasury.tokenBalance);
        const queued = Number(treasury.queuedAmount);

        // Two separate ways to run dry, and running out of gas stops payouts
        // just as completely as running out of tokens.
        if (gas < LOW_GAS_BNB) {
          treasuryLow = true;
          notifyAdmins({
            type: 'system.treasury_low',
            dedupeKey: `low-gas:${day}`,
            title: 'Hot wallet is low on gas',
            body: `Only ${treasury.gasBalance} BNB left. Payouts stop when it runs out, whatever the USDT balance is.`,
            meta: { gasBalance: treasury.gasBalance },
          });
        }
        if (queued > 0 && balance < queued) {
          treasuryLow = true;
          notifyAdmins({
            type: 'system.treasury_low',
            dedupeKey: `low-treasury:${day}`,
            title: 'Hot wallet cannot cover the payout queue',
            body: `$${treasury.tokenBalance} available against $${treasury.queuedAmount} queued. Top it up before the queue runs.`,
            meta: { balance: treasury.tokenBalance, queued: treasury.queuedAmount },
          });
        }
      }
    } catch (err) {
      logger.warn({ err }, 'could not read treasury status for the ops watch');
    }

    try {
      const watcher = await watcherStatus();
      if (watcher.enabled && watcher.behind !== null && watcher.behind > STALLED_BLOCKS) {
        watcherStalled = true;
        notifyAdmins({
          type: 'system.watcher_stalled',
          dedupeKey: `watcher-stalled:${day}`,
          title: 'Deposit watcher has fallen behind',
          body: `It is ${watcher.behind} blocks behind the chain head. Members are sending funds that are not being credited.`,
          meta: { behind: watcher.behind, lastBlock: watcher.lastBlock },
        });
      }
    } catch (err) {
      logger.warn({ err }, 'could not read watcher status for the ops watch');
    }
  }

  /**
   * Gateway payouts that were handed over and never landed.
   *
   * This whole rail had no monitoring. `ops-watch` inspected `chainPayout`
   * rows only, and the overdue query filters on PENDING — so an approved
   * withdrawal sitting at the gateway in a non-terminal state was invisible to
   * every dashboard an operator has, indefinitely, while the member stayed
   * debited.
   *
   * Terminal states are excluded: `confirmed` succeeded, and the failure
   * states now refund on the callback. What is left is the genuinely stuck
   * ones — accepted, queued, sending — past the point where they should have
   * settled.
   */
  const settleBy = new Date(Date.now() - GATEWAY_SETTLE_HOURS * 3_600_000);
  const stalledGateway = await prisma.withdrawal.findMany({
    where: {
      status: 'PROCESSED',
      gatewayTrackId: { not: null },
      gatewayStatus: { notIn: ['confirmed', 'canceled', 'cancelled', 'rejected'] },
      processedAt: { lt: settleBy },
    },
    select: { id: true, amount: true, reference: true, gatewayStatus: true },
    take: 50,
  });

  if (stalledGateway.length) {
    const total = stalledGateway.reduce((a, w) => a + Number(w.amount), 0);
    notifyAdmins({
      type: 'system.payout_failed',
      dedupeKey: `stalled-gateway-payouts:${day}:${stalledGateway.length}`,
      title: `${stalledGateway.length} gateway payout${stalledGateway.length === 1 ? '' : 's'} have not settled`,
      body: `About $${total.toFixed(2)} was approved and handed to the gateway more than `
          + `${GATEWAY_SETTLE_HOURS} hours ago and has not confirmed. The members are debited and waiting.`,
      meta: { count: stalledGateway.length, oldestStatus: stalledGateway[0]?.gatewayStatus ?? null },
    });
  }

  // ── flyers club awards waiting to be fulfilled ──
  const awards = await prisma.roamingClubAward.count({ where: { fulfilledAt: null } });
  if (awards) {
    notifyAdmins({
      type: 'ops.roaming_award',
      dedupeKey: `roaming-awards:${day}:${awards}`,
      title: `${awards} Flyers Club award${awards === 1 ? '' : 's'} to arrange`,
      body: 'Members have qualified for travel rewards that have not been fulfilled yet.',
      meta: { count: awards },
    });
  }

  const result = {
    overdueWithdrawals: overdue.length,
    largeWithdrawals: large.length,
    stuckPayouts,
    stalledGatewayPayouts: stalledGateway.length,
    treasuryLow,
    watcherStalled,
  };
  logger.debug(result, 'ops watch complete');
  return result;
}
