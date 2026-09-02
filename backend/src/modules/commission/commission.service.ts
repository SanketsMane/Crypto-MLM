import type { CommissionKind } from '@prisma/client';
import { prisma, type Tx } from '../../core/db.js';
import { getUpline } from '../../core/tree.js';
import { addVolume, matchLegs, placementUpline } from '../../core/binary.js';
import { config } from '../../core/runtime-config.js';
import { notifyMember } from '../../core/notify.js';
import { postEntry } from '../../core/ledger.js';
import { consumeAllowance } from '../../core/capping.js';
import { money, percentOf, toDb, type Money } from '../../core/money.js';
import { deterministicReference } from '../../core/reference.js';
import { logger } from '../../core/logger.js';

/**
 * Compensation engine.
 *
 *  DIRECT     — 3 levels on the INVESTMENT amount: 4% / 0.5% / 0.5%   (FortuneX p11)
 *  GENERATION — 30 levels on the downline's DAILY ROI                 (FortuneX p13)
 *
 * On the generation base: the deck says "Level 1 — 13%" without stating 13% of
 * what. It is applied to the downline's daily return, not their capital. Paying
 * 13% + 8% + 5%… of capital would exceed the entire 5% sponsor pool many times
 * over and is not solvent; the reference implementation studied during research
 * names the equivalent stream "Level ROI" and pays it on the daily return.
 * Confirm with the client before launch — see FLAG-GEN-BASE in the README.
 */

const DIRECT_MAX_LEVEL = 3;
const GENERATION_MAX_LEVEL = 30;

export interface PayoutResult {
  userId: string;
  level: number;
  kind: CommissionKind;
  /** What the payout was calculated on — capital for DIRECT, matched volume for BINARY. */
  base: Money;
  intended: Money;
  paid: Money;
  cappedOut: boolean;
}

interface RuleRow {
  level: number;
  percent: string;
  requiredDirects: number;
  requiredTeamVolume: string;
}

async function loadRules(kind: CommissionKind, db: Tx): Promise<Map<number, RuleRow>> {
  const rules = await db.commissionRule.findMany({
    where: { kind, isActive: true },
    orderBy: { level: 'asc' },
  });
  return new Map(
    rules.map((r) => [
      r.level,
      {
        level: r.level,
        percent: r.percent.toString(),
        requiredDirects: r.requiredDirects,
        requiredTeamVolume: r.requiredTeamVolume.toString(),
      },
    ]),
  );
}

/**
 * Does this upline member qualify to earn at this level?
 * Generation levels unlock on active directs AND accumulated team volume.
 */
async function qualifies(
  db: Tx,
  earner: { id: string; status: string; activeDirectCount: number },
  rule: RuleRow,
): Promise<boolean> {
  if (earner.status !== 'ACTIVE') return false;
  if (earner.activeDirectCount < rule.requiredDirects) return false;

  const required = money(rule.requiredTeamVolume);
  if (required.lte(0)) return true;

  const tv = await db.teamVolume.findUnique({
    where: { userId: earner.id },
    select: { totalTeamBusiness: true },
  });
  return money(tv?.totalTeamBusiness?.toString() ?? 0).gte(required);
}

/**
 * Credit one commission, clamped by the earner's remaining cap headroom.
 * Always writes a Commission row — even a zero payout — so a capped-out upline
 * is visible in reporting rather than silently missing.
 */
async function payOne(
  db: Tx,
  params: {
    earnerId: string;
    fromUserId: string;
    kind: CommissionKind;
    level: number;
    percent: string;
    baseAmount: Money;
    investmentId?: string;
    reference: string;
    description: string;
  },
): Promise<PayoutResult> {
  const intended = percentOf(params.baseAmount, params.percent);

  if (intended.lte(0)) {
    return { userId: params.earnerId, level: params.level, kind: params.kind, base: params.baseAmount, intended, paid: money(0), cappedOut: false };
  }

  // Reserve cap headroom first; whatever it grants is what we credit.
  const paid = await consumeAllowance(db, params.earnerId, intended);

  await db.commission.create({
    data: {
      userId: params.earnerId,
      fromUserId: params.fromUserId,
      investmentId: params.investmentId,
      kind: params.kind,
      level: params.level,
      percent: params.percent,
      baseAmount: toDb(params.baseAmount),
      amount: toDb(intended),
      paidAmount: toDb(paid),
      reference: params.reference,
      status: paid.gt(0) ? 'PROCESSED' : 'REJECTED',
    },
  });

  if (paid.gt(0)) {
    await postEntry(db, {
      userId: params.earnerId,
      walletType: 'MAIN',
      direction: 'CREDIT',
      category:
        params.kind === 'DIRECT' ? 'DIRECT_BONUS'
        : params.kind === 'BINARY' ? 'BINARY_BONUS'
        : 'GENERATION_BONUS',
      amount: paid,
      reference: params.reference,
      description: params.description,
      meta: {
        base: toDb(params.baseAmount),
        percent: params.percent,
        level: params.level,
        intended: toDb(intended),
      },
      sourceType: params.kind === 'DIRECT' ? 'direct_bonus' : 'generation_bonus',
      sourceId: params.investmentId,
    });

    await db.$executeRaw`
      UPDATE users SET "totalEarned" = "totalEarned" + ${toDb(paid)}::numeric
       WHERE id = ${params.earnerId}`;
  }

  return {
    userId: params.earnerId,
    level: params.level,
    kind: params.kind,
    base: params.baseAmount,
    intended,
    paid,
    cappedOut: paid.lt(intended),
  };
}

/**
 * Direct sponsor bonus — paid once, when a package is purchased.
 * Base is the investment amount.
 */
export async function payDirectBonus(
  db: Tx,
  params: { investmentId: string; buyerId: string; amount: Money },
): Promise<PayoutResult[]> {
  const rules = await loadRules('DIRECT', db);
  const upline = await getUpline(params.buyerId, DIRECT_MAX_LEVEL, db);
  const results: PayoutResult[] = [];

  for (const anc of upline) {
    const rule = rules.get(anc.level);
    if (!rule) continue;
    if (!(await qualifies(db, anc, rule))) continue;

    results.push(
      await payOne(db, {
        earnerId: anc.id,
        fromUserId: params.buyerId,
        kind: 'DIRECT',
        level: anc.level,
        percent: rule.percent,
        baseAmount: params.amount,
        investmentId: params.investmentId,
        reference: deterministicReference('DIR', params.investmentId, anc.level),
        description: `Direct sponsor bonus L${anc.level}`,
      }),
    );
  }
  return results;
}

/**
 * Generation bonus — paid daily, on each downline member's ROI accrual.
 * Walks up to 30 levels; each level gated by its own qualification rule.
 */
export async function payGenerationBonus(
  db: Tx,
  params: { accrualId: string; earnerFromId: string; roiAmount: Money; investmentId?: string },
): Promise<PayoutResult[]> {
  if (params.roiAmount.lte(0)) return [];

  /* The two plans are alternatives, not layers. Under binary the network is
     paid on matched leg volume, so the per-level generation rules stop
     applying — leaving them on would pay the same network twice. */
  if ((await config()).planStructure === 'BINARY') return [];

  const rules = await loadRules('GENERATION', db);
  const upline = await getUpline(params.earnerFromId, GENERATION_MAX_LEVEL, db);
  const results: PayoutResult[] = [];

  for (const anc of upline) {
    const rule = rules.get(anc.level);
    if (!rule) continue;
    if (!(await qualifies(db, anc, rule))) continue;

    results.push(
      await payOne(db, {
        earnerId: anc.id,
        fromUserId: params.earnerFromId,
        kind: 'GENERATION',
        level: anc.level,
        percent: rule.percent,
        baseAmount: params.roiAmount,
        investmentId: params.investmentId,
        reference: deterministicReference('GEN', params.accrualId, anc.level),
        description: `Generation bonus L${anc.level}`,
      }),
    );
  }

  logger.debug(
    { accrual: params.accrualId, levels: results.length, paid: results.filter((r) => r.paid.gt(0)).length },
    'generation bonus run',
  );
  return results;
}

export async function listForUser(userId: string, opts: { kind?: CommissionKind; take?: number; skip?: number } = {}) {
  return prisma.commission.findMany({
    where: { userId, ...(opts.kind ? { kind: opts.kind } : {}) },
    orderBy: { createdAt: 'desc' },
    take: opts.take ?? 50,
    skip: opts.skip ?? 0,
    include: { fromUser: { select: { userCode: true, firstName: true } } },
  });
}


/**
 * Binary bonus — paid when a package is purchased, to everyone above the buyer
 * in the PLACEMENT tree whose two legs now pair off.
 *
 * The sequence matters. Volume is pushed up first so that every ancestor's legs
 * are current, then each ancestor is matched in turn: the weaker leg is what
 * pays, and the stronger leg's surplus stays as carryover. Paying before
 * propagating would match against stale balances and quietly underpay.
 *
 * Returns an empty list unless the platform is actually running the binary
 * structure, so this is safe to call unconditionally from the purchase path.
 */
export async function payBinaryBonus(
  db: Tx,
  params: { investmentId: string; buyerId: string; amount: Money },
): Promise<PayoutResult[]> {
  const cfg = await config();
  if (cfg.planStructure !== 'BINARY') return [];
  if (params.amount.lte(0)) return [];

  await addVolume(params.buyerId, params.amount, db);

  const ancestors = await placementUpline(params.buyerId, db);
  const results: PayoutResult[] = [];

  for (const earnerId of ancestors) {
    const match = await matchLegs(earnerId, db);
    if (!match) continue;

    results.push(
      await payOne(db, {
        earnerId,
        fromUserId: params.buyerId,
        kind: 'BINARY',
        // Binary pays on a matched pair, not a level. Depth is recorded so the
        // ledger still shows where in the tree the pairing happened.
        level: 0,
        percent: String(cfg.binaryPercent),
        baseAmount: match.matched,
        investmentId: params.investmentId,
        reference: deterministicReference('BIN', params.investmentId, earnerId),
        description: `Binary bonus on $${match.matched.toString()} matched`,
      }),
    );

  }

  return results;
}

/**
 * Tell the uplines what they earned — AFTER the purchase has committed.
 *
 * These notifications used to fire from inside `payDirectBonus` and
 * `payBinaryBonus`, which run inside the purchase transaction. `notifyMember`
 * writes through the global client so it can never fail a payment, and that is
 * exactly why it must not be called from in there: it commits independently,
 * so a late rollback left sponsors told about commissions that no longer
 * existed. The caller now announces once the money is real.
 *
 * Only what was actually paid is announced — a commission clamped to zero by
 * the cap is not income, and "you earned $0" reads as a bug.
 */
export async function announceCommissions(buyerId: string, results: PayoutResult[]) {
  const paid = results.filter((r) => r.paid.gt(0));
  if (paid.length === 0) return;

  const buyer = await prisma.user.findUnique({
    where: { id: buyerId },
    select: { firstName: true, lastName: true, userCode: true },
  });
  const buyerName = buyer
    ? [buyer.firstName, buyer.lastName].filter(Boolean).join(' ') || buyer.userCode
    : 'a member';

  for (const r of paid) {
    if (r.kind === 'DIRECT') {
      notifyMember({
        userId: r.userId,
        type: 'commission.direct',
        dedupeKey: `direct:${buyerId}:${r.userId}:${r.level}:${r.paid.toString()}`,
        title: `Sponsor bonus — $${r.paid.toString()}`,
        body: `You earned $${r.paid.toString()} from ${buyerName}'s investment (level ${r.level}).`,
        meta: { level: r.level, amount: r.paid.toString(), from: buyerName },
      });
    } else if (r.kind === 'BINARY') {
      notifyMember({
        userId: r.userId,
        type: 'commission.binary',
        dedupeKey: `binary:${buyerId}:${r.userId}:${r.paid.toString()}`,
        title: `Binary bonus — $${r.paid.toString()}`,
        body: `Your legs matched $${r.base.toString()} and paid $${r.paid.toString()}.`,
        meta: { matched: r.base.toString(), amount: r.paid.toString() },
      });
    }
  }
}
