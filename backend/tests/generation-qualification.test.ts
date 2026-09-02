import { describe, expect, it, beforeAll, beforeEach } from 'vitest';
import { prisma, resetData, seedPlan, makeUser } from './helpers.js';
import { getUpline, activeDirectCount } from '../src/core/tree.js';
import { payGenerationBonus } from '../src/modules/commission/commission.service.js';
import { purchase } from '../src/modules/investment/investment.service.js';
import { money } from '../src/core/money.js';

/**
 * Generation levels unlock on the directs a member actually has.
 *
 * The engine used to gate on `User.activeDirectCount`, a denormalised column
 * that defaults to 0 and was incremented nowhere in the production code path.
 * Every real member carried 0 forever, so every band requiring directs —
 * levels 2 upward — paid nobody, while the dashboard counted the same figure
 * live and told members those levels were unlocked.
 *
 * The regression these tests hold is that ONE definition of "active direct"
 * governs both what the member is shown and what the member is paid.
 */

const GEN_L1 = 13;   // 0 directs, $0 volume    (seedPlan)
const GEN_L2 = 8;    // 2 directs, $1,000 volume
const GEN_L3 = 5;    // 6 directs, $6,000 volume

beforeAll(seedPlan);
beforeEach(resetData);

const plan = (amount: string) => prisma.packagePlan.findFirstOrThrow({ where: { amount } });

/** Gives `userId` `n` ACTIVE sponsored members, the way registration would. */
async function giveDirects(userId: string, n: number) {
  for (let i = 0; i < n; i++) await makeUser({ sponsorId: userId });
}

/**
 * An earner with cap headroom.
 *
 * Qualification is only half of getting paid — `payOne` clamps to the member's
 * remaining ceiling, and a member who has never invested has a ceiling of zero.
 * Funding and buying gives them capacity, so these tests measure the
 * qualification gate rather than the cap.
 */
async function earner(opts: { sponsorId?: string } = {}) {
  const u = await makeUser({ ...opts, funded: 2_000 });
  await purchase(u.id, (await plan('1100')).id);
  return u;
}

/** Sets accumulated team volume, which the higher bands also gate on. */
const setVolume = (userId: string, amount: number) =>
  prisma.teamVolume.update({ where: { userId }, data: { totalTeamBusiness: String(amount) } });

describe('generation bonus qualification', () => {
  it('pays a level once the member holds enough active directs', async () => {
    // sponsor ← earner ← downline. The upline walk from `downline` reaches
    // `earner` at level 1 and `sponsor` at level 2.
    const sponsor = await earner();
    const mid = await earner({ sponsorId: sponsor.id });
    const downline = await makeUser({ sponsorId: mid.id });

    // `sponsor` needs 2 active directs and $1,000 volume for level 2.
    await giveDirects(sponsor.id, 1); // `mid` already counts, so this makes 2
    await setVolume(sponsor.id, 1_000);

    const results = await payGenerationBonus(prisma, {
      accrualId: `acc-${Date.now()}`,
      earnerFromId: downline.id,
      roiAmount: money(100),
    });

    const level2 = results.find((r) => r.userId === sponsor.id && r.level === 2);
    expect(level2, 'sponsor should have been evaluated at level 2').toBeDefined();
    expect(level2!.paid.toString()).toBe(String(GEN_L2)); // 8% of 100

    // Level 1 always qualifies — it requires no directs.
    const level1 = results.find((r) => r.userId === mid.id && r.level === 1);
    expect(level1!.paid.toString()).toBe(String(GEN_L1));
  });

  it('withholds a level while the member is one direct short', async () => {
    const sponsor = await earner();
    const mid = await earner({ sponsorId: sponsor.id });
    const downline = await makeUser({ sponsorId: mid.id });

    // `mid` is sponsor's only direct: 1, and level 2 needs 2.
    await setVolume(sponsor.id, 1_000);

    const results = await payGenerationBonus(prisma, {
      accrualId: `acc-${Date.now()}`,
      earnerFromId: downline.id,
      roiAmount: money(100),
    });

    expect(results.find((r) => r.userId === sponsor.id && r.level === 2)).toBeUndefined();
  });

  it('a SUSPENDED direct stops counting, and the level closes again', async () => {
    const sponsor = await earner();
    const mid = await earner({ sponsorId: sponsor.id });
    const downline = await makeUser({ sponsorId: mid.id });
    const second = await makeUser({ sponsorId: sponsor.id });
    await setVolume(sponsor.id, 1_000);

    expect(await activeDirectCount(sponsor.id)).toBe(2);

    await prisma.user.update({ where: { id: second.id }, data: { status: 'SUSPENDED' } });
    expect(await activeDirectCount(sponsor.id)).toBe(1);

    const results = await payGenerationBonus(prisma, {
      accrualId: `acc-${Date.now()}`,
      earnerFromId: downline.id,
      roiAmount: money(100),
    });
    expect(results.find((r) => r.userId === sponsor.id && r.level === 2)).toBeUndefined();
  });

  it('reaches the deeper bands — the levels that never paid before', async () => {
    // Level 3 needs 6 active directs and $6,000 volume.
    const top = await earner();
    const mid = await earner({ sponsorId: top.id });
    const lower = await earner({ sponsorId: mid.id });
    const downline = await makeUser({ sponsorId: lower.id });

    await giveDirects(top.id, 5); // + `mid` = 6
    await setVolume(top.id, 6_000);

    const results = await payGenerationBonus(prisma, {
      accrualId: `acc-${Date.now()}`,
      earnerFromId: downline.id,
      roiAmount: money(200),
    });

    const level3 = results.find((r) => r.userId === top.id && r.level === 3);
    expect(level3, 'level 3 should now be reachable').toBeDefined();
    expect(level3!.paid.toString()).toBe(String((200 * GEN_L3) / 100)); // 5% of 200
  });

  it('the engine and the member-facing count never disagree', async () => {
    /**
     * The bug that made this necessary: the dashboard counted active directs
     * live and the engine read a stale column, so a member could be shown a
     * level as unlocked and earn nothing from it. Both now resolve through
     * core/tree.ts, and this asserts they agree.
     */
    const sponsor = await makeUser();
    const mid = await makeUser({ sponsorId: sponsor.id });
    await giveDirects(sponsor.id, 3);
    await prisma.user.update({
      where: { id: (await makeUser({ sponsorId: sponsor.id })).id },
      data: { status: 'BLOCKED' },
    });

    const shown = await activeDirectCount(sponsor.id);
    const [fromUpline] = (await getUpline(mid.id, 30, prisma)).filter((a) => a.id === sponsor.id);

    expect(fromUpline.activeDirectCount).toBe(shown);
    expect(shown).toBe(4); // mid + 3 active; the BLOCKED one does not count

    // And the stale column is still 0 — proving nothing reads it any more.
    const row = await prisma.user.findUniqueOrThrow({
      where: { id: sponsor.id }, select: { activeDirectCount: true },
    });
    expect(row.activeDirectCount).toBe(0);
  });
});
