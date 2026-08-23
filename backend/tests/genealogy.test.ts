import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import * as team from '../src/modules/team/team.service.js';
import { getUpline, getDownline, getLevel, buildPath, ancestorIds } from '../src/core/tree.js';
import { purchase } from '../src/modules/investment/investment.service.js';
import { money } from '../src/core/money.js';
import { prisma, resetData, seedPlan, makeUser, accessTokenFor } from './helpers.js';

/**
 * The genealogy.
 *
 * This is the load-bearing structure of the whole compensation plan: one
 * package purchase pays up to three direct levels and thirty generations, and
 * every one of those payments is decided by the materialised path. An
 * off-by-one here does not throw — it quietly pays the wrong people, or pays
 * the right people the wrong amount, and the ledger records it as correct.
 *
 * So these tests assert the shape of the tree directly rather than through the
 * commission figures, which can look plausible while being wrong.
 */

const app = createApp();

beforeAll(seedPlan);
beforeEach(resetData);

/** A straight chain, deepest last. */
async function chain(length: number) {
  const users = [await makeUser()];
  for (let i = 1; i < length; i += 1) {
    users.push(await makeUser({ sponsorId: users[i - 1]!.id }));
  }
  return users;
}

describe('the path', () => {
  it('records ancestors nearest-last and excludes the member', async () => {
    const [a, b, c] = await chain(3);

    expect(a!.path).toBe('');
    expect(b!.path).toBe(a!.id);
    expect(c!.path).toBe(`${a!.id}.${b!.id}`);

    // Nearest ancestor is the LAST segment. Reading it the other way round
    // would invert every level in the plan.
    expect(ancestorIds(c!.path).at(-1)).toBe(b!.id);
    expect(ancestorIds(c!.path).at(0)).toBe(a!.id);
  });

  it('tracks depth as distance from the root', async () => {
    const users = await chain(5);
    expect(users.map((u) => u.depth)).toEqual([0, 1, 2, 3, 4]);
  });

  it('builds a child path from its parent', () => {
    expect(buildPath('', 'root')).toBe('root');
    expect(buildPath('root', 'kid')).toBe('root.kid');
  });

  it('treats an empty path as having no ancestors', () => {
    expect(ancestorIds('')).toEqual([]);
  });
});

describe('walking up', () => {
  it('numbers the direct sponsor level 1 and counts outward', async () => {
    const [a, b, c, d] = await chain(4);
    const up = await getUpline(d!.id, 30);

    expect(up.map((u) => [u.level, u.id])).toEqual([
      [1, c!.id],
      [2, b!.id],
      [3, a!.id],
    ]);
  });

  it('stops at thirty generations, keeping the nearest thirty', async () => {
    /**
     * The one that matters most.
     *
     * The generation bonus walks thirty levels. On a chain longer than that,
     * taking the wrong end of the path would pay the thirty people furthest
     * from the buyer instead of the thirty nearest — every payment landing on
     * the wrong member, with nothing to show anything had gone wrong.
     */
    const users = await chain(35);
    const deepest = users.at(-1)!;

    const up = await getUpline(deepest.id, 30);
    expect(up).toHaveLength(30);

    // Level 1 is the immediate sponsor...
    expect(up[0]!.id).toBe(users.at(-2)!.id);
    // ...and level 30 is thirty steps up, not the root.
    expect(up[29]!.id).toBe(users.at(-31)!.id);
    expect(up.map((u) => u.level)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));

    // The first four are beyond the reach of the plan and must not be paid.
    const paid = new Set(up.map((u) => u.id));
    for (const unreachable of users.slice(0, 4)) {
      expect(paid.has(unreachable.id)).toBe(false);
    }
  });

  it('returns nothing for a member at the root', async () => {
    const [root] = await chain(1);
    expect(await getUpline(root!.id, 30)).toEqual([]);
  });

  it('skips an ancestor whose account has been deleted rather than shifting levels', async () => {
    const [a, b, c, d] = await chain(4);
    // Removing the middle ancestor must not promote its parent into its level.
    await prisma.user.delete({ where: { id: b!.id } });

    const up = await getUpline(d!.id, 30);

    /**
     * The surviving ancestors keep the levels they had. Level 2 is simply
     * absent — the alternative, closing the gap, would promote the
     * grandparent into the parent's slot and pay them the wrong band.
     */
    expect(up.map((u) => [u.level, u.id])).toEqual([
      [1, c!.id],
      [3, a!.id],
    ]);
  });
});

describe('walking down', () => {
  it('returns every descendant and excludes anyone outside the branch', async () => {
    const root = await makeUser();
    const left = await makeUser({ sponsorId: root.id });
    const right = await makeUser({ sponsorId: root.id });
    const deep = await makeUser({ sponsorId: left.id });
    const stranger = await makeUser();

    const down = await getDownline(root.id, null);
    const ids = new Set(down.map((d) => d.id));

    expect(ids).toEqual(new Set([left.id, right.id, deep.id]));
    expect(ids.has(stranger.id)).toBe(false);
    expect(ids.has(root.id)).toBe(false);
  });

  it('does not mistake a member whose id merely starts the same', async () => {
    /**
     * The path is matched with a prefix, so the separator is doing real work.
     * Without the dot, `startsWith(prefix)` would match any id beginning with
     * the root's id and pull unrelated members into the downline.
     */
    const root = await makeUser();
    const child = await makeUser({ sponsorId: root.id });

    const outsider = await makeUser();
    await prisma.user.update({
      where: { id: outsider.id },
      // A path that shares the root's id as a prefix but is a different member.
      data: { path: `${root.id}X`, depth: 1 },
    });

    const ids = (await getDownline(root.id, null)).map((d) => d.id);
    expect(ids).toContain(child.id);
    expect(ids).not.toContain(outsider.id);
  });

  it('limits by depth relative to the member, not the global root', async () => {
    const users = await chain(6);
    // Ask from halfway down: two levels below users[2] is users[4].
    const down = await getDownline(users[2]!.id, 2);
    expect(new Set(down.map((d) => d.id))).toEqual(new Set([users[3]!.id, users[4]!.id]));
  });

  it('reads a single level relative to the member', async () => {
    const users = await chain(5);
    const level2 = await getLevel(users[0]!.id, 2);
    expect(level2.map((u) => u.id)).toEqual([users[2]!.id]);

    // And from further down the same chain, level 2 is a different member.
    const fromMiddle = await getLevel(users[1]!.id, 2);
    expect(fromMiddle.map((u) => u.id)).toEqual([users[3]!.id]);
  });
});

describe('team volume', () => {
  /** Buys the cheapest tier, which is what moves volume. */
  async function invest(userId: string, amount: number) {
    const pkg = await prisma.packagePlan.findFirstOrThrow({ where: { amount: String(amount) } });
    await prisma.$executeRaw`
      UPDATE wallet_accounts SET balance = balance + ${amount}::numeric
       WHERE "userId" = ${userId} AND type = 'FUND'`;
    return purchase(userId, pkg.id);
  }

  it('counts a leg as the direct plus everything under them', async () => {
    const root = await makeUser();
    const legA = await makeUser({ sponsorId: root.id });
    const underA = await makeUser({ sponsorId: legA.id });
    const legB = await makeUser({ sponsorId: root.id });

    await invest(legA.id, 110);
    await invest(underA.id, 270);
    await invest(legB.id, 530);

    const legs = await team.legVolumes(root.id);

    // Sorted strongest first, and the strongest is B on its own.
    expect(legs).toHaveLength(2);
    expect(legs[0]!.directId).toBe(legB.id);
    expect(legs[0]!.volume.toString()).toBe('530');
    expect(legs[0]!.members).toBe(1);

    // A is worth its own 110 plus the 270 beneath it.
    expect(legs[1]!.directId).toBe(legA.id);
    expect(legs[1]!.volume.toString()).toBe('380');
    expect(legs[1]!.members).toBe(2);
  });

  it('splits the strongest leg from the rest, which is what the rank ladder counts', async () => {
    const root = await makeUser();
    const strong = await makeUser({ sponsorId: root.id });
    const weakA = await makeUser({ sponsorId: root.id });
    const weakB = await makeUser({ sponsorId: root.id });

    await invest(strong.id, 2650);
    await invest(weakA.id, 530);
    await invest(weakB.id, 270);

    const tv = await team.recalculate(root.id);

    expect(tv.totalTeamBusiness.toString()).toBe('3450');
    expect(tv.powerLegVolume.toString()).toBe('2650');
    // Everything that is not the power leg — the half the ladder requires.
    expect(tv.otherLegsVolume.toString()).toBe('800');
    expect(tv.teamSize).toBe(3);
  });

  it('reports zero for a member with no directs rather than failing', async () => {
    const lonely = await makeUser();
    const tv = await team.recalculate(lonely.id);
    expect(tv.totalTeamBusiness.toString()).toBe('0');
    expect(tv.powerLegVolume.toString()).toBe('0');
    expect(tv.otherLegsVolume.toString()).toBe('0');
    expect(tv.teamSize).toBe(0);
  });

  it('pushes a purchase all the way up the chain, and direct business only to the sponsor', async () => {
    const [a, b, c] = await chain(3);
    await prisma.$transaction((tx) => team.propagateInvestment(tx, c!.id, money(500)));

    const [tvA, tvB, tvC] = await Promise.all(
      [a!, b!, c!].map((u) => prisma.teamVolume.findUniqueOrThrow({ where: { userId: u.id } })),
    );

    // Both ancestors see the team total...
    expect(tvA.totalTeamBusiness.toString()).toBe('500');
    expect(tvB.totalTeamBusiness.toString()).toBe('500');
    // ...but only the immediate sponsor books it as direct business.
    expect(tvB.directBusiness.toString()).toBe('500');
    expect(tvA.directBusiness.toString()).toBe('0');
    // And the buyer's own volume is not their team's.
    expect(tvC.totalTeamBusiness.toString()).toBe('0');
  });

  it('does nothing for a root member, who has nobody above them', async () => {
    const root = await makeUser();
    await prisma.$transaction((tx) => team.propagateInvestment(tx, root.id, money(500)));
    const tv = await prisma.teamVolume.findUniqueOrThrow({ where: { userId: root.id } });
    expect(tv.totalTeamBusiness.toString()).toBe('0');
  });
});

describe('what the member sees', () => {
  it('numbers levels from the viewer, not from the global root', async () => {
    const users = await chain(4);
    // The third member is two levels down globally, but their own directs
    // must still read as level 1 to them.
    const tree = await team.genealogy(users[1]!.id, null);

    expect(tree.rootId).toBe(users[1]!.id);
    expect(tree.total).toBe(2);
    expect(tree.maxLevel).toBe(2);

    const byId = new Map(tree.nodes.map((n) => [n.id, n]));
    expect(byId.get(users[1]!.id)!.level).toBe(0);
    expect(byId.get(users[2]!.id)!.level).toBe(1);
    expect(byId.get(users[3]!.id)!.level).toBe(2);

    // The root is returned parentless so the client can anchor the tree.
    expect(byId.get(users[1]!.id)!.parentId).toBeNull();
    expect(byId.get(users[2]!.id)!.parentId).toBe(users[1]!.id);
  });

  it('shows nobody above the viewer', async () => {
    const users = await chain(3);
    const tree = await team.genealogy(users[2]!.id, null);
    expect(tree.nodes.map((n) => n.id)).toEqual([users[2]!.id]);
    expect(tree.total).toBe(0);
  });

  it('refuses a member who does not exist', async () => {
    await expect(team.genealogy('nope', null)).rejects.toThrow(/not found/i);
  });

  it('lists downline packages with the level they were bought at', async () => {
    const root = await makeUser();
    const direct = await makeUser({ sponsorId: root.id });
    const grand = await makeUser({ sponsorId: direct.id });

    const pkg = await prisma.packagePlan.findFirstOrThrow({ where: { amount: '110' } });
    for (const u of [direct, grand]) {
      await prisma.$executeRaw`
        UPDATE wallet_accounts SET balance = balance + 110::numeric
         WHERE "userId" = ${u.id} AND type = 'FUND'`;
      await purchase(u.id, pkg.id);
    }

    const all = await team.teamPackages(root.id);
    expect(all.total).toBe(2);
    expect(all.totalValue).toBe('220');
    expect(all.activeCount).toBe(2);
    expect(new Set(all.rows.map((r) => r.level))).toEqual(new Set([1, 2]));

    // Filtering by level narrows it to that generation alone.
    const first = await team.teamPackages(root.id, { level: 1 });
    expect(first.total).toBe(1);
    expect(first.rows[0]!.userCode).toBe(direct.userCode);
    expect(first.rows[0]!.sponsorCode).toBe(root.userCode);
  });

  it("never counts the member's own packages as their team's", async () => {
    const root = await makeUser();
    const pkg = await prisma.packagePlan.findFirstOrThrow({ where: { amount: '110' } });
    await prisma.$executeRaw`
      UPDATE wallet_accounts SET balance = balance + 110::numeric
       WHERE "userId" = ${root.id} AND type = 'FUND'`;
    await purchase(root.id, pkg.id);

    const mine = await team.teamPackages(root.id);
    expect(mine.total).toBe(0);
    expect(mine.totalValue).toBe('0');
  });
});

describe('over http', () => {
  it('requires a session', async () => {
    for (const path of ['/api/v1/team', '/api/v1/team/genealogy', '/api/v1/team/packages', '/api/v1/team/level/1']) {
      const res = await request(app).get(path);
      expect(res.status).toBe(401);
    }
  });

  it("never leaks another member's network", async () => {
    const [mine, under] = await chain(2);
    const stranger = await makeUser();
    const token = await accessTokenFor(stranger.id);

    const res = await request(app)
      .get('/api/v1/team/genealogy')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.nodes.map((n: { id: string }) => n.id);
    expect(ids).toEqual([stranger.id]);
    expect(ids).not.toContain(mine!.id);
    expect(ids).not.toContain(under!.id);
  });

  it('serves the summary for the signed-in member', async () => {
    const root = await makeUser();
    const direct = await makeUser({ sponsorId: root.id });
    void direct;

    const res = await request(app)
      .get('/api/v1/team')
      .set('Authorization', `Bearer ${await accessTokenFor(root.id)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.directCount).toBe(1);
    expect(res.body.data.legs).toHaveLength(1);
  });
});
