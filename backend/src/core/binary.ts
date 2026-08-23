import { prisma, type Tx } from './db.js';
import { money, toDb, type Money } from './money.js';

/**
 * The binary genealogy.
 *
 * Two trees exist under this plan and they are not the same tree:
 *
 *   sponsorship — who introduced whom. Never changes, drives the direct bonus.
 *   placement   — where a member sits for binary payout. Decided at signup,
 *                 and it is what makes spillover possible: once a sponsor's two
 *                 slots are full, the next recruit is placed further down, so
 *                 the volume lands in someone else's leg.
 *
 * Everything here is inert unless the platform runs the binary structure. The
 * columns exist on every install; they are only written when the plan says so.
 */

/** Nearest-last, excluding self — the same convention as the sponsor path. */
export const buildPlacementPath = (parentPath: string, parentId: string): string =>
  parentPath ? `${parentPath}.${parentId}` : parentId;

export const placementAncestorIds = (path: string): string[] =>
  path ? path.split('.').filter(Boolean) : [];

export interface Placement {
  parentId: string;
  position: 'LEFT' | 'RIGHT';
  path: string;
  depth: number;
}

/**
 * Find where a new member goes, given who sponsored them.
 *
 * Breadth-first from the sponsor, taking the first free slot — the classic
 * "leftmost open" rule. Breadth-first rather than depth-first on purpose: it
 * fills the tree evenly and keeps it shallow, which matters because every
 * payout walks this path.
 *
 * Returns null when the sponsor does not exist, which the caller treats as
 * "no placement" rather than an error — a root member has no placement.
 */
export async function findPlacement(sponsorId: string, db: Tx = prisma): Promise<Placement | null> {
  const sponsor = await db.user.findUnique({
    where: { id: sponsorId },
    select: { id: true, placementPath: true, placementDepth: true },
  });
  if (!sponsor) return null;

  // Level-by-level from the sponsor. `frontier` holds the candidates whose
  // slots we are about to inspect.
  let frontier: { id: string; placementPath: string; placementDepth: number }[] = [sponsor];

  // Bounded so a corrupt tree cannot spin forever. 64 levels of a full binary
  // tree is more members than any platform will hold.
  for (let guard = 0; guard < 64 && frontier.length; guard += 1) {
    const children = await db.user.findMany({
      where: { placementParentId: { in: frontier.map((f) => f.id) } },
      select: { id: true, placementParentId: true, legPosition: true, placementPath: true, placementDepth: true },
    });

    const taken = new Map<string, Set<string>>();
    for (const c of children) {
      if (!c.placementParentId || !c.legPosition) continue;
      if (!taken.has(c.placementParentId)) taken.set(c.placementParentId, new Set());
      taken.get(c.placementParentId)!.add(c.legPosition);
    }

    for (const node of frontier) {
      const used = taken.get(node.id) ?? new Set<string>();
      const free = (['LEFT', 'RIGHT'] as const).find((p) => !used.has(p));
      if (free) {
        return {
          parentId: node.id,
          position: free,
          path: buildPlacementPath(node.placementPath, node.id),
          depth: node.placementDepth + 1,
        };
      }
    }

    // Every slot on this level is taken — descend, keeping left-to-right order.
    frontier = children
      .sort((a, b) => (a.legPosition === b.legPosition ? 0 : a.legPosition === 'LEFT' ? -1 : 1))
      .map((c) => ({ id: c.id, placementPath: c.placementPath, placementDepth: c.placementDepth }));
  }

  return null;
}

/** Write a placement onto a member and open their leg ledger. */
export async function place(userId: string, placement: Placement, db: Tx = prisma) {
  await db.user.update({
    where: { id: userId },
    data: {
      placementParentId: placement.parentId,
      legPosition: placement.position,
      placementPath: placement.path,
      placementDepth: placement.depth,
    },
  });
  await db.binaryLeg.upsert({ where: { userId }, create: { userId }, update: {} });
}

/**
 * Push an investment's volume up the placement tree.
 *
 * Each ancestor receives it on the side the buyer sits on relative to THEM —
 * which is decided by whichever of the ancestor's children the buyer descends
 * from, not by the buyer's own leg.
 */
export async function addVolume(buyerId: string, amount: Money, db: Tx = prisma): Promise<void> {
  if (amount.lte(0)) return;

  const buyer = await db.user.findUnique({
    where: { id: buyerId },
    select: { placementPath: true },
  });
  const ancestors = placementAncestorIds(buyer?.placementPath ?? '');
  if (!ancestors.length) return;

  /* Walking from the buyer upward, the child we came through is the previous
     id in the path — and for the nearest ancestor, the buyer themselves. */
  const chain = [...ancestors, buyerId];

  for (let i = ancestors.length - 1; i >= 0; i -= 1) {
    const ancestorId = ancestors[i]!;
    const childId = chain[i + 1]!;
    const child = await db.user.findUnique({ where: { id: childId }, select: { legPosition: true } });
    if (!child?.legPosition) continue;

    const side = child.legPosition === 'LEFT' ? 'left' : 'right';
    await db.binaryLeg.upsert({
      where: { userId: ancestorId },
      create: {
        userId: ancestorId,
        [`${side}Volume`]: toDb(amount),
        [`${side}Total`]: toDb(amount),
        [`${side}Count`]: 1,
      } as never,
      update: {
        [`${side}Volume`]: { increment: toDb(amount) },
        [`${side}Total`]: { increment: toDb(amount) },
        [`${side}Count`]: { increment: 1 },
      } as never,
    });
  }
}

export interface MatchResult {
  userId: string;
  matched: Money;
  carriedLeft: Money;
  carriedRight: Money;
}

/**
 * Match a member's two legs and consume what pairs off.
 *
 * The weaker leg is what gets paid — that is the whole idea of a binary plan.
 * Whatever the stronger leg holds beyond the match is left where it is and
 * becomes carryover, so a member who builds one side hard is not paid twice for
 * it but does not lose it either.
 */
export async function matchLegs(userId: string, db: Tx = prisma): Promise<MatchResult | null> {
  const leg = await db.binaryLeg.findUnique({ where: { userId } });
  if (!leg) return null;

  const left = money(leg.leftVolume.toString());
  const right = money(leg.rightVolume.toString());
  const matched = left.lt(right) ? left : right;
  if (matched.lte(0)) return null;

  const carriedLeft = left.sub(matched);
  const carriedRight = right.sub(matched);

  await db.binaryLeg.update({
    where: { userId },
    data: {
      leftVolume: toDb(carriedLeft),
      rightVolume: toDb(carriedRight),
      matchedTotal: { increment: toDb(matched) },
    },
  });

  return { userId, matched, carriedLeft, carriedRight };
}

/** Everyone above a buyer in the placement tree, nearest first. */
export async function placementUpline(buyerId: string, db: Tx = prisma): Promise<string[]> {
  const buyer = await db.user.findUnique({ where: { id: buyerId }, select: { placementPath: true } });
  return placementAncestorIds(buyer?.placementPath ?? '').reverse();
}
