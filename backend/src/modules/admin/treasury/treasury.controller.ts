import type { Request, Response } from 'express';
import { prisma } from '../../../core/db.js';
import { money } from '../../../core/money.js';
import * as oxapay from '../../../core/gateway/oxapay.js';
import * as nowpayments from '../../../core/gateway/nowpayments.js';
import { enabledGateways, pinnedGateway, gatewayReasons } from '../../../core/gateway/gateway.service.js';
import { payoutRail } from '../../../core/payout-rail.js';

/**
 * What the platform owes, against what it actually holds.
 *
 * The existing wallet view reports our own books — balances credited, deposits
 * in, withdrawals out. That answers "what do the ledgers say" and not "is the
 * money there", and those are different questions: a solvent-looking ledger
 * sitting on an empty gateway account is exactly the situation an operator
 * needs to find out about before a member does.
 *
 * So this puts liability and assets side by side, and never invents either. A
 * provider that cannot be read is reported as unreadable rather than as zero —
 * a zero would be indistinguishable from an empty account, and would make a
 * shortfall look like a balanced book.
 */

interface ProviderBalance {
  id: string;
  label: string;
  /** Non-zero holdings only; a wall of zeroes hides the one figure that matters. */
  balances: { coin: string; amount: number }[];
  readable: boolean;
  reason?: string;
  canCharge: boolean;
  canPay: boolean;
}

const nonZero = (balances: Record<string, number>) =>
  Object.entries(balances)
    .filter(([, amount]) => Number(amount) > 0)
    .map(([coin, amount]) => ({ coin, amount: Number(amount) }))
    .sort((a, b) => b.amount - a.amount);

async function readProvider(
  id: string,
  label: string,
  read: () => Promise<Record<string, number>>,
  canCharge: boolean,
  canPay: boolean,
): Promise<ProviderBalance> {
  try {
    return { id, label, balances: nonZero(await read()), readable: true, canCharge, canPay };
  } catch (err) {
    return {
      id, label, balances: [], readable: false,
      reason: err instanceof Error ? err.message : String(err),
      canCharge, canPay,
    };
  }
}

export const overview = async (_req: Request, res: Response) => {
  const enabled = enabledGateways();
  const isEnabled = (id: string) => enabled.some((g) => g.id === id);
  const oxaState = oxapay.gatewayState();
  const nowState = nowpayments.state();

  const [providers, wallets, deposits, withdrawals, pendingWithdrawals, investments, byProvider] =
    await Promise.all([
      Promise.all([
        readProvider('nowpayments', 'NOWPayments', nowpayments.accountBalance, nowState.canCharge, false),
        readProvider('oxapay', 'OxaPay', oxapay.accountBalance, oxaState.canCharge, oxaState.canPay),
      ]),
      prisma.walletAccount.groupBy({ by: ['type'], _sum: { balance: true, locked: true } }),
      prisma.deposit.aggregate({ where: { status: 'PROCESSED' }, _sum: { amount: true }, _count: true }),
      prisma.withdrawal.aggregate({ where: { status: 'PROCESSED' }, _sum: { amount: true, fee: true, netAmount: true }, _count: true }),
      prisma.withdrawal.aggregate({ where: { status: 'PENDING' }, _sum: { netAmount: true }, _count: true }),
      prisma.investment.aggregate({ where: { status: { in: ['ACTIVE', 'CAPPED'] } }, _sum: { amount: true, capLimit: true, totalEarned: true } }),
      // Which checkout members are actually choosing.
      prisma.deposit.groupBy({
        by: ['gatewayProvider'],
        where: { gatewayProvider: { not: null } },
        _count: true,
        _sum: { amount: true },
      }),
    ]);

  /**
   * Liability is what members could ask for right now.
   *
   * Credited balances plus withdrawals already approved but not yet sent — the
   * latter have left the member's balance and not yet left the platform, so
   * counting only wallet balances would understate what is owed.
   */
  const held = wallets.reduce((a, w) => a.add(money(w._sum.balance?.toString() ?? 0)), money(0));
  const pendingOut = money(pendingWithdrawals._sum.netAmount?.toString() ?? 0);

  res.json({
    success: true,
    data: {
      providers,
      gateways: {
        enabled: enabled.map((g) => g.id),
        pinned: pinnedGateway(),
        reasons: enabled.length === 0 ? gatewayReasons() : [],
        payoutRail: payoutRail(),
      },
      liability: {
        memberBalances: held.toString(),
        approvedNotSent: pendingOut.toString(),
        pendingWithdrawalCount: pendingWithdrawals._count,
        total: held.add(pendingOut).toString(),
      },
      flows: {
        depositsIn: (deposits._sum.amount ?? 0).toString(),
        depositCount: deposits._count,
        withdrawalsOut: (withdrawals._sum.amount ?? 0).toString(),
        withdrawalsNetSent: (withdrawals._sum.netAmount ?? 0).toString(),
        withdrawalCount: withdrawals._count,
        feesCollected: (withdrawals._sum.fee ?? 0).toString(),
      },
      obligations: {
        capitalInvested: (investments._sum.amount ?? 0).toString(),
        earningsCeiling: (investments._sum.capLimit ?? 0).toString(),
        earningsPaid: (investments._sum.totalEarned ?? 0).toString(),
      },
      byProvider: byProvider.map((r) => ({
        provider: r.gatewayProvider,
        deposits: r._count,
        amount: (r._sum.amount ?? 0).toString(),
      })),
      wallets: wallets.map((w) => ({
        type: w.type,
        balance: (w._sum.balance ?? 0).toString(),
        locked: (w._sum.locked ?? 0).toString(),
      })),
    },
  });
};
