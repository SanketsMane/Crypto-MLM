import type { Tx } from '../../core/db.js';
import { prisma } from '../../core/db.js';
import { postEntry } from '../../core/ledger.js';
import { money, percentOf, toDb } from '../../core/money.js';
import { makeReference } from '../../core/reference.js';
import { badRequest, notFound } from '../../core/errors.js';
import { consumeAllowance } from '../../core/capping.js';
import { notifyMember } from '../../core/notify.js';
import * as activity from '../../core/activity.js';
import { logger } from '../../core/logger.js';

/**
 * Scratch cards.
 *
 * A milestone programme running alongside ranks: cumulative investment unlocks
 * a card, the member scratches it, and the bonus lands in their main wallet.
 *
 * Three decisions worth stating, because each prevents a specific failure:
 *
 *   • **The amount is fixed at unlock, not at claim.** A member should get what
 *     the card said when they earned it. Reading the tier at claim time would
 *     mean an operator retuning the economics silently rewrites cards people
 *     are already holding.
 *   • **Claiming goes through the cap engine.** This is platform earnings like
 *     any other, so it is clamped by the same 250%/300% ceiling. A bonus track
 *     that bypasses the cap is a hole in the cap.
 *   • **One card per member per tier, enforced by a unique index.** Evaluation
 *     runs after every purchase and is deliberately safe to run repeatedly.
 */

export interface CardView {
  id: string;
  tier: string;
  amount: string;
  bonusPercent: string;
  status: 'LOCKED' | 'UNCLAIMED' | 'CLAIMED';
  threshold: string;
  unlockedAt: Date | null;
  claimedAt: Date | null;
}

/**
 * Unlocks any cards the member has newly qualified for.
 *
 * Called after a purchase, inside the same transaction, so a card cannot exist
 * for an investment that rolled back.
 */
export async function evaluate(db: Tx, userId: string): Promise<string[]> {
  const [user, tiers, existing] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { totalInvested: true } }),
    db.rewardTier.findMany({ where: { isActive: true }, orderBy: { threshold: 'asc' } }),
    db.rewardCard.findMany({ where: { userId }, select: { tierId: true } }),
  ]);
  if (!user || !tiers.length) return [];

  const held = new Set(existing.map((c) => c.tierId));
  const invested = money(user.totalInvested.toString());
  const unlocked: string[] = [];

  for (const tier of tiers) {
    if (held.has(tier.id)) continue;
    if (invested.lt(money(tier.threshold.toString()))) continue;

    // Percentage of what they have actually put in, capped — so the card scales
    // with the member without running away on a large book.
    const raw = percentOf(invested, tier.bonusPercent.toString());
    const ceiling = money(tier.maxBonus.toString());
    const amount = raw.gt(ceiling) ? ceiling : raw;

    try {
      await db.rewardCard.create({
        data: {
          userId,
          tierId: tier.id,
          amount: toDb(amount),
          unlockedAtVolume: toDb(invested),
        },
      });
      unlocked.push(tier.name);
    } catch {
      // The unique index caught a concurrent evaluation. Expected, not an error.
    }
  }

  if (unlocked.length) {
    logger.info({ userId, tiers: unlocked }, 'reward cards unlocked');
  }
  return unlocked;
}

/** Fired after the purchase transaction commits, so the member is told once. */
export function announce(userId: string, tiers: string[]) {
  for (const tier of tiers) {
    notifyMember({
      userId,
      type: 'rank.achieved',
      dedupeKey: `reward-card:${userId}:${tier}`,
      title: 'You have a scratch card waiting',
      body: `Reaching ${tier} unlocked a bonus card. Scratch it to add the bonus to your main wallet.`,
      link: '/reward-cards',
      meta: { tier },
    });
  }
}

/** Every tier, with the member's position against each. */
export async function listFor(userId: string) {
  const [user, tiers, cards] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { totalInvested: true } }),
    prisma.rewardTier.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.rewardCard.findMany({ where: { userId } }),
  ]);

  const byTier = new Map(cards.map((c) => [c.tierId, c]));
  const invested = money(user?.totalInvested.toString() ?? '0');

  const view: CardView[] = tiers.map((tier) => {
    const card = byTier.get(tier.id);
    if (card) {
      return {
        id: card.id,
        tier: tier.name,
        amount: card.amount.toString(),
        bonusPercent: tier.bonusPercent.toString(),
        status: card.status,
        threshold: tier.threshold.toString(),
        unlockedAt: card.unlockedAt,
        claimedAt: card.claimedAt,
      };
    }
    // Locked tiers are shown too — a milestone nobody can see is not a
    // milestone, it is a surprise.
    return {
      id: tier.id,
      tier: tier.name,
      amount: '0',
      bonusPercent: tier.bonusPercent.toString(),
      status: 'LOCKED' as const,
      threshold: tier.threshold.toString(),
      unlockedAt: null,
      claimedAt: null,
    };
  });

  const totalEarned = cards
    .filter((c) => c.status === 'CLAIMED')
    .reduce((sum, c) => sum.add(money(c.amount.toString())), money(0));

  return {
    cards: view,
    totalEarned: totalEarned.toString(),
    unclaimed: cards.filter((c) => c.status === 'UNCLAIMED').length,
    // Progress toward the next locked tier is derivable from this and
    // `threshold`, so the client does not need a second call.
    invested: invested.toString(),
  };
}

/**
 * Scratches a card.
 *
 * The guarded UPDATE is what makes this safe: two taps on the same card race
 * for one row, and only one can move it out of UNCLAIMED.
 */
export async function claim(userId: string, cardId: string) {
  const card = await prisma.rewardCard.findFirst({
    where: { id: cardId, userId },
    include: { tier: { select: { name: true } } },
  });
  if (!card) throw notFound('Card not found');
  if (card.status === 'CLAIMED') throw badRequest('You have already scratched this card');

  const reference = makeReference('RWD', userId);

  return prisma.$transaction(async (tx) => {
    // Claim the card first. Losing this race means someone already scratched it.
    const { count } = await tx.rewardCard.updateMany({
      where: { id: cardId, userId, status: 'UNCLAIMED' },
      data: { status: 'CLAIMED', claimedAt: new Date(), reference },
    });
    if (count === 0) throw badRequest('You have already scratched this card');

    const face = money(card.amount.toString());

    // Platform earnings like any other — clamped by the same ceiling. A bonus
    // track that bypasses the cap is a hole in the cap.
    const payable = await consumeAllowance(tx, userId, face);

    if (payable.gt(0)) {
      await postEntry(tx, {
        userId,
        walletType: 'MAIN',
        direction: 'CREDIT',
        category: 'REWARD_CARD',
        amount: payable,
        reference,
        description: `Scratch card — ${card.tier.name}`,
        meta: { tier: card.tier.name, faceValue: face.toString() },
        sourceType: 'reward_card',
        sourceId: card.id,
      });
      await tx.$executeRaw`
        UPDATE users SET "totalEarned" = "totalEarned" + ${toDb(payable)}::numeric
         WHERE id = ${userId}`;
    }

    activity.record({
      userId, event: 'PROFILE_UPDATED',
      summary: payable.gt(0)
        ? `Scratched the ${card.tier.name} card for $${payable.toString()}`
        : `Scratched the ${card.tier.name} card — nothing paid, your earnings ceiling is reached`,
      meta: { tier: card.tier.name, faceValue: face.toString(), paid: payable.toString() },
    });

    return {
      tier: card.tier.name,
      faceValue: face.toString(),
      paid: payable.toString(),
      // Said plainly rather than silently paying less than the card showed.
      cappedOut: payable.lt(face),
    };
  });
}
