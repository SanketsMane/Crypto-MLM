import { describe, expect, it, beforeEach } from 'vitest';
import { prisma } from '../src/core/db.js';
import { findPlacement, place, addVolume, matchLegs, placementUpline } from '../src/core/binary.js';
import { money } from '../src/core/money.js';

/**
 * The binary engine, exercised on the placement tree directly.
 *
 * These are the rules the money depends on: where a third recruit lands, which
 * leg an ancestor receives volume on, and that only the weaker leg pays while
 * the stronger one carries forward.
 */

let n = 0;
async function member(sponsorId?: string) {
  n += 1;
  const u = await prisma.user.create({
    data: {
      userCode: `BIN${String(n).padStart(6, '0')}`,
      email: `bin-${n}@bintest.dev`,
      passwordHash: 'x',
      firstName: `B${n}`,
      status: 'ACTIVE',
      ...(sponsorId ? { sponsorId } : {}),
    },
  });
  await prisma.binaryLeg.create({ data: { userId: u.id } });
  if (sponsorId) {
    const slot = await findPlacement(sponsorId);
    if (slot) await place(u.id, slot);
  }
  return u;
}

const legOf = (userId: string) => prisma.binaryLeg.findUniqueOrThrow({ where: { userId } });

beforeEach(async () => {
  await prisma.user.deleteMany({ where: { email: { endsWith: '@bintest.dev' } } });
});

describe('placement', () => {
  it('fills the sponsor’s left slot first, then the right', async () => {
    const root = await member();
    const a = await member(root.id);
    const b = await member(root.id);

    const [ra, rb] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: a.id }, select: { legPosition: true, placementParentId: true } }),
      prisma.user.findUniqueOrThrow({ where: { id: b.id }, select: { legPosition: true, placementParentId: true } }),
    ]);
    expect(ra.legPosition).toBe('LEFT');
    expect(rb.legPosition).toBe('RIGHT');
    expect(ra.placementParentId).toBe(root.id);
    expect(rb.placementParentId).toBe(root.id);
  });

  it('spills the third recruit into the downline', async () => {
    const root = await member();
    const left = await member(root.id);
    await member(root.id);
    // Both of root's slots are taken, so this one must go deeper.
    const third = await member(root.id);

    const r = await prisma.user.findUniqueOrThrow({
      where: { id: third.id },
      select: { placementParentId: true, legPosition: true, placementDepth: true },
    });
    expect(r.placementParentId).toBe(left.id);
    expect(r.legPosition).toBe('LEFT');
    expect(r.placementDepth).toBe(2);
  });

  it('records an upline that walks back to the root', async () => {
    const root = await member();
    const left = await member(root.id);
    await member(root.id);
    const deep = await member(root.id);

    // nearest first
    expect(await placementUpline(deep.id)).toEqual([left.id, root.id]);
  });
});

describe('volume', () => {
  it('credits each ancestor on the side the buyer descends from', async () => {
    const root = await member();
    const left = await member(root.id);
    await member(root.id);
    const deep = await member(root.id); // sits under `left`

    await addVolume(deep.id, money(1000));

    const rootLeg = await legOf(root.id);
    const leftLeg = await legOf(left.id);

    // root sees it on its LEFT, because `deep` descends through `left`
    expect(rootLeg.leftVolume.toString()).toBe('1000');
    expect(rootLeg.rightVolume.toString()).toBe('0');
    // and `left` sees it on its own left, where `deep` actually sits
    expect(leftLeg.leftVolume.toString()).toBe('1000');
  });
});

describe('matching', () => {
  it('pays nothing while only one leg has volume', async () => {
    const root = await member();
    const l = await member(root.id);
    await member(root.id);

    await addVolume(l.id, money(500));
    expect(await matchLegs(root.id)).toBeNull();

    const leg = await legOf(root.id);
    expect(leg.leftVolume.toString()).toBe('500');
    expect(leg.matchedTotal.toString()).toBe('0');
  });

  it('matches the weaker leg and carries the surplus', async () => {
    const root = await member();
    const l = await member(root.id);
    const r = await member(root.id);

    await addVolume(l.id, money(1000));
    await addVolume(r.id, money(400));

    const match = await matchLegs(root.id);
    expect(match?.matched.toString()).toBe('400');      // the weaker leg
    expect(match?.carriedLeft.toString()).toBe('600');  // surplus stays put
    expect(match?.carriedRight.toString()).toBe('0');

    const leg = await legOf(root.id);
    expect(leg.leftVolume.toString()).toBe('600');
    expect(leg.rightVolume.toString()).toBe('0');
    expect(leg.matchedTotal.toString()).toBe('400');
    // lifetime totals never decrease
    expect(leg.leftTotal.toString()).toBe('1000');
    expect(leg.rightTotal.toString()).toBe('400');
  });

  it('matches carried volume against a later arrival', async () => {
    const root = await member();
    const l = await member(root.id);
    const r = await member(root.id);

    await addVolume(l.id, money(1000));
    await addVolume(r.id, money(400));
    await matchLegs(root.id);           // 400 matched, 600 carried left

    await addVolume(r.id, money(250));  // new volume on the weak side
    const second = await matchLegs(root.id);

    expect(second?.matched.toString()).toBe('250');
    const leg = await legOf(root.id);
    expect(leg.leftVolume.toString()).toBe('350');   // 600 - 250
    expect(leg.matchedTotal.toString()).toBe('650'); // 400 + 250
  });

  it('never matches twice on the same volume', async () => {
    const root = await member();
    const l = await member(root.id);
    const r = await member(root.id);

    await addVolume(l.id, money(300));
    await addVolume(r.id, money(300));

    expect((await matchLegs(root.id))?.matched.toString()).toBe('300');
    expect(await matchLegs(root.id)).toBeNull();
    expect((await legOf(root.id)).matchedTotal.toString()).toBe('300');
  });
});
