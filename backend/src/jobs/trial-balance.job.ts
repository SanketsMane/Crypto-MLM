import { prisma } from '../core/db.js';
import { logger } from '../core/logger.js';
import { notifyAdmins } from '../core/notify.js';

/**
 * Do the wallets still agree with the ledger?
 *
 * Every entry records the balance it produced, so drift is detectable by
 * construction — and nothing ever checked. The platform could post a credit
 * without a matching balance move, or move a balance without an entry, and no
 * job, report or dashboard would notice. The first sign would be a member
 * disputing a figure, by which point the cause is weeks of history away.
 *
 * This is the control that catches the class of bug the rest of the audit
 * found one instance of. It does not need to know what went wrong; it only
 * needs to notice that something did, on the day it happens.
 *
 * Two invariants, both derived straight from the ledger:
 *
 *   1. sum(credits) - sum(debits) === wallet.balance
 *   2. the newest entry's `balanceAfter` === wallet.balance
 *
 * (1) catches a balance moved without an entry, or an entry written without
 * the balance moving. (2) catches a balance edited behind the ledger's back —
 * the two agree on the total but disagree on where it ended up.
 *
 * Read-only by design. A reconciliation job that silently "corrects" balances
 * destroys the evidence of what it was correcting, so this reports and stops.
 */

export interface WalletDrift {
  walletId: string;
  userId: string;
  userCode: string;
  walletType: string;
  balance: string;
  /** What the ledger says the balance should be. */
  ledgerBalance: string;
  difference: string;
  /** The newest entry's balanceAfter, when it disagrees with the balance. */
  lastEntryBalance: string | null;
}

export interface TrialBalanceResult {
  walletsChecked: number;
  drifted: WalletDrift[];
  /** Absolute total of every difference found, as a string. */
  totalDrift: string;
}

interface DriftRow {
  walletId: string;
  userId: string;
  userCode: string;
  walletType: string;
  balance: string;
  ledgerBalance: string;
  difference: string;
  lastEntryBalance: string | null;
}

export async function runTrialBalance(): Promise<TrialBalanceResult> {
  /**
   * One pass in SQL rather than a wallet-at-a-time walk in Node.
   *
   * The ledger is indexed on `[userId, createdAt]` and the join is on
   * `walletId`, so this stays a single aggregate scan. Pulling every entry
   * into the process to sum it would not survive a real ledger.
   *
   * `COALESCE` on the sums matters: a wallet with no entries yet is not drift,
   * it is a new member, and NULL - 0 would report every one of them.
   */
  const drifted = await prisma.$queryRaw<DriftRow[]>`
    WITH totals AS (
      SELECT
        w.id                                    AS "walletId",
        w."userId"                              AS "userId",
        w.type::text                            AS "walletType",
        w.balance                               AS balance,
        COALESCE(SUM(
          CASE WHEN e.direction = 'CREDIT' THEN e.amount ELSE -e.amount END
        ), 0)                                   AS "ledgerBalance",
        (
          SELECT le."balanceAfter"
            FROM ledger_entries le
           WHERE le."walletId" = w.id
           ORDER BY le."createdAt" DESC, le.id DESC
           LIMIT 1
        )                                       AS "lastEntryBalance"
      FROM wallet_accounts w
      LEFT JOIN ledger_entries e ON e."walletId" = w.id
      GROUP BY w.id, w."userId", w.type, w.balance
    )
    SELECT
      t."walletId",
      t."userId",
      u."userCode"                              AS "userCode",
      t."walletType",
      t.balance::text                           AS balance,
      t."ledgerBalance"::text                   AS "ledgerBalance",
      (t.balance - t."ledgerBalance")::text     AS difference,
      t."lastEntryBalance"::text                AS "lastEntryBalance"
    FROM totals t
    JOIN users u ON u.id = t."userId"
    WHERE t.balance <> t."ledgerBalance"
       OR (t."lastEntryBalance" IS NOT NULL AND t."lastEntryBalance" <> t.balance)
    ORDER BY ABS(t.balance - t."ledgerBalance") DESC
    LIMIT 100`;

  const walletsChecked = await prisma.walletAccount.count();
  const totalDrift = drifted
    .reduce((a, d) => a + Math.abs(Number(d.difference)), 0)
    .toFixed(8);

  if (drifted.length === 0) {
    logger.debug({ walletsChecked }, 'trial balance clean');
    return { walletsChecked, drifted: [], totalDrift: '0.00000000' };
  }

  /**
   * Not deduped by day.
   *
   * Every other ops alert is, because the conditions they watch stay true
   * until someone acts. This one is different: a ledger that stops balancing
   * is the single worst thing that can happen to this platform, and an
   * operator seeing it once and moving on is the failure mode to design
   * against. It repeats on every run until it is clean.
   */
  logger.error(
    { walletsChecked, drifted: drifted.length, totalDrift, worst: drifted[0] as DriftRow | undefined },
    'TRIAL BALANCE FAILED — wallet balances disagree with the ledger',
  );

  const worst = drifted[0]!; // non-empty: the early return above covers zero
  notifyAdmins({
    type: 'system.trial_balance_failed',
    dedupeKey: `trial-balance:${new Date().toISOString().slice(0, 16)}`,
    title: `${drifted.length} wallet${drifted.length === 1 ? '' : 's'} disagree with the ledger`,
    body: `A total of $${totalDrift} is unaccounted for. The worst is ${worst.userCode}'s `
        + `${worst.walletType} wallet, holding $${worst.balance} against $${worst.ledgerBalance} `
        + 'of entries. Stop approving payouts and investigate before anything else.',
    meta: { drifted: drifted.length, totalDrift, worstWalletId: worst.walletId },
  });

  return { walletsChecked, drifted, totalDrift };
}
