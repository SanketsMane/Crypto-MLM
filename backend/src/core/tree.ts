import type { AffiliateMode, UserStatus } from '@prisma/client';
import { prisma, type Tx } from './db.js';

/**
 * Genealogy helpers.
 *
 * `User.path` stores dot-separated ancestor ids nearest-LAST, excluding self:
 *   root.child.grandchild
 *
 * That makes a 30-level upline walk a single `IN` query instead of 30 round
 * trips, which matters when one investment triggers up to 33 payouts.
 */

export interface Ancestor {
  id: string;
  userCode: string;
  level: number; // 1 = direct sponsor
  status: UserStatus;
  affiliateMode: AffiliateMode;
  directCount: number;
  /**
   * Counted live from the sponsorship edge, NOT read from `User.activeDirectCount`.
   *
   * That column defaults to 0 and was never incremented anywhere outside the
   * simulation seeder, so every real member carried 0 forever. The commission
   * engine gates generation levels on this number, which meant levels 2-30 —
   * every band requiring 2, 6, 8, 15 or 18 active directs — never paid anyone,
   * while the dashboard computed the same figure correctly and told members
   * those levels were unlocked.
   */
  activeDirectCount: number;
}

export const buildPath = (parentPath: string, parentId: string): string =>
  parentPath ? `${parentPath}.${parentId}` : parentId;

export const ancestorIds = (path: string): string[] =>
  path ? path.split('.').filter(Boolean) : [];

/**
 * Ancestors ordered by proximity: level 1 is the direct sponsor.
 * `maxLevels` caps the walk (30 for the generation bonus).
 */
export async function getUpline(
  userId: string,
  maxLevels: number,
  db: Tx = prisma,
): Promise<Ancestor[]> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { path: true } });
  if (!user?.path) return [];

  const ids = ancestorIds(user.path);
  if (ids.length === 0) return [];

  // Nearest ancestor is last in the path; take the closest `maxLevels`.
  const nearest = ids.slice(-maxLevels).reverse(); // index 0 => level 1

  /**
   * Two queries, not thirty-one: the ancestors themselves, and one grouped
   * count giving every ancestor's live active-direct total. Both are indexed
   * (`@@index([sponsorId])`, `@@index([status])`), and doing the count here
   * rather than at each call site means no caller can forget it.
   */
  const [rows, activeDirects] = await Promise.all([
    db.user.findMany({
      where: { id: { in: nearest } },
      select: {
        id: true,
        userCode: true,
        status: true,
        affiliateMode: true,
        directCount: true,
      },
    }),
    db.user.groupBy({
      by: ['sponsorId'],
      where: { sponsorId: { in: nearest }, status: 'ACTIVE' },
      _count: { _all: true },
    }),
  ]);

  const activeBySponsor = new Map(
    activeDirects.flatMap((r) => (r.sponsorId ? [[r.sponsorId, r._count._all] as const] : [])),
  );

  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: Ancestor[] = [];
  nearest.forEach((id, i) => {
    const r = byId.get(id);
    if (r) out.push({ ...r, level: i + 1, activeDirectCount: activeBySponsor.get(id) ?? 0 });
  });
  return out;
}

/**
 * Live active-direct count for a single member.
 *
 * The one definition of "active direct" in the codebase: a member this user
 * sponsors, whose account is ACTIVE. Everything that displays or gates on the
 * figure goes through here or through `getUpline` above.
 */
export const activeDirectCount = (userId: string, db: Tx = prisma): Promise<number> =>
  db.user.count({ where: { sponsorId: userId, status: 'ACTIVE' } });

/** Every descendant of a user, optionally limited to a depth. */
export async function getDownline(userId: string, maxDepth: number | null = null, db: Tx = prisma) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { path: true, depth: true },
  });
  if (!user) return [];

  const prefix = buildPath(user.path, userId);
  return db.user.findMany({
    where: {
      OR: [{ path: prefix }, { path: { startsWith: `${prefix}.` } }],
      ...(maxDepth ? { depth: { lte: user.depth + maxDepth } } : {}),
    },
    select: {
      id: true, userCode: true, firstName: true, lastName: true, status: true,
      depth: true, path: true, totalInvested: true, createdAt: true,
      // The tree view needs the edge, not just the node. `path` already
      // encodes it, but returning it explicitly means the client does not have
      // to parse a delimited string to draw a parent-child link.
      sponsorId: true, directCount: true,
    },
    orderBy: { createdAt: 'asc' },
  });
}

/** Members at exactly N levels below the given user. */
export async function getLevel(userId: string, level: number, db: Tx = prisma) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { path: true, depth: true },
  });
  if (!user) return [];
  const prefix = buildPath(user.path, userId);

  return db.user.findMany({
    where: {
      depth: user.depth + level,
      OR: [{ path: prefix }, { path: { startsWith: `${prefix}.` } }],
    },
    select: {
      id: true, userCode: true, firstName: true, lastName: true,
      status: true, totalInvested: true, createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });
}
