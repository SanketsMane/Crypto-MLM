import { prisma, type Tx } from './db.js';
import { money, clampToRemaining, toDb, type Money } from './money.js';
import { Decimal } from 'decimal.js';

/**
 * The earnings ceiling (FortuneX p8/p10/p18).
 *
 * Every income stream — daily ROI, direct bonus, generation bonus, rank reward —
 * must pass through `creditCapped`. Nothing credits a wallet directly, otherwise
 * the cap silently leaks.
 *
 * PASSIVE affiliates cap at 250% of invested capital, ACTIVE at 300%.
 * The Roaming Club is explicitly excluded from the ceiling.
 */

export interface CapState {
  capLimit: Money;
  totalEarned: Money;
  remaining: Money;
  isCapped: boolean;
}

/** Aggregate cap position across every active investment the user holds. */
export async function getCapState(userId: string, db: Tx = prisma): Promise<CapState> {
  const rows = await db.investment.findMany({
    where: { userId, status: { in: ['ACTIVE', 'CAPPED'] } },
    select: { capLimit: true, totalEarned: true },
  });

  const capLimit = rows.reduce((a, r) => a.add(money(r.capLimit.toString())), money(0));
  const totalEarned = rows.reduce((a, r) => a.add(money(r.totalEarned.toString())), money(0));
  const remaining = capLimit.sub(totalEarned);

  return {
    capLimit,
    totalEarned,
    remaining: remaining.gt(0) ? remaining : money(0),
    isCapped: remaining.lte(0),
  };
}

/**
 * Clamp an intended payout to what the cap still allows.
 * Returns the payable amount, which may be zero.
 */
export async function allowance(userId: string, intended: Money, db: Tx = prisma): Promise<Money> {
  const state = await getCapState(userId, db);
  return clampToRemaining(intended, state.remaining);
}

/**
 * Consume cap headroom against the user's investments, oldest first, and mark
 * any investment that reaches its ceiling as CAPPED.
 *
 * Uses guarded atomic UPDATEs so two concurrent payouts cannot both consume the
 * same headroom.
 */
export async function consumeAllowance(db: Tx, userId: string, amount: Money): Promise<Money> {
  if (amount.lte(0)) return money(0);

  const investments = await db.investment.findMany({
    where: { userId, status: 'ACTIVE' },
    orderBy: { startedAt: 'asc' },
    select: { id: true, capLimit: true, totalEarned: true },
  });

  let left = new Decimal(amount);
  let consumed = money(0);

  for (const inv of investments) {
    if (left.lte(0)) break;
    const headroom = money(inv.capLimit.toString()).sub(money(inv.totalEarned.toString()));
    if (headroom.lte(0)) continue;

    const take = left.gt(headroom) ? headroom : left;

    // Guarded: only applies if the headroom is still there.
    const updated = await db.$executeRaw`
      UPDATE investments
         SET "totalEarned" = "totalEarned" + ${toDb(take)}::numeric,
             "updatedAt" = now()
       WHERE id = ${inv.id}
         AND "capLimit" - "totalEarned" >= ${toDb(take)}::numeric`;

    if (updated === 1) {
      consumed = consumed.add(take);
      left = left.sub(take);

      await db.$executeRaw`
        UPDATE investments
           SET status = 'CAPPED', "cappedAt" = now()
         WHERE id = ${inv.id}
           AND status = 'ACTIVE'
           AND "totalEarned" >= "capLimit"`;
    }
  }

  return consumed;
}
