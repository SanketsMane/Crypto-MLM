import { describe, expect, it, beforeEach } from 'vitest';
import { prisma } from '../src/core/db.js';
import { consumeAllowance, getCapState } from '../src/core/capping.js';
import { money } from '../src/core/money.js';
import { resetData, seedPlan, makeUser } from './helpers.js';

/**
 * The ceiling is the one number the whole platform is promised on: a member
 * earns up to 250% (or 300%) of what they invested, and not a cent more.
 *
 * Every income stream funnels through `consumeAllowance`, so if it can be made
 * to over-consume — by concurrency, by rounding, by an oversized request — the
 * platform pays out money it never took in.
 */

const anyPackage = () => prisma.packagePlan.findFirstOrThrow();

async function invested(amount: number, capPercent = 250) {
  const u = await makeUser();
  const pkg = await anyPackage();
  const cap = (amount * capPercent) / 100;
  await prisma.investment.create({
    data: {
      user: { connect: { id: u.id } }, package: { connect: { id: pkg.id } },
      amount: String(amount), capLimit: String(cap), totalEarned: '0',
      status: 'ACTIVE', dailyRoiPercent: '0.5',
    },
  });
  return { user: u, cap };
}

const earnedOn = async (userId: string) => {
  const rows = await prisma.investment.findMany({ where: { userId }, select: { totalEarned: true } });
  return rows.reduce((a, r) => a + Number(r.totalEarned), 0);
};

beforeEach(async () => { await resetData(); await seedPlan(); });

describe('the ceiling', () => {
  it('clamps a single payout that exceeds what is left', async () => {
    const { user, cap } = await invested(100); // cap 250
    const paid = await consumeAllowance(prisma, user.id, money(1000));
    expect(Number(paid)).toBeCloseTo(cap, 6);
    expect(await earnedOn(user.id)).toBeCloseTo(cap, 6);
  });

  it('pays nothing once the ceiling is reached', async () => {
    const { user } = await invested(100);
    await consumeAllowance(prisma, user.id, money(250));
    const second = await consumeAllowance(prisma, user.id, money(50));
    expect(Number(second)).toBe(0);
  });

  it('marks the investment CAPPED at the ceiling', async () => {
    const { user } = await invested(100);
    await consumeAllowance(prisma, user.id, money(250));
    const inv = await prisma.investment.findFirstOrThrow({ where: { userId: user.id } });
    expect(inv.status).toBe('CAPPED');
    expect(inv.cappedAt).not.toBeNull();
  });

  it('never over-consumes when payouts race each other', async () => {
    const { user, cap } = await invested(100); // 250 of headroom

    // ten concurrent payouts of 50 want 500 in total against a 250 ceiling
    const results = await Promise.all(
      Array.from({ length: 10 }, () => consumeAllowance(prisma, user.id, money(50))),
    );

    const totalPaid = results.reduce((a, r) => a + Number(r), 0);
    expect(totalPaid).toBeCloseTo(cap, 6);          // never more than the cap
    expect(await earnedOn(user.id)).toBeCloseTo(cap, 6);
    expect((await getCapState(user.id)).isCapped).toBe(true);
  });

  it('spreads across investments oldest first', async () => {
    const u = await makeUser();
    const pkg = await anyPackage();
    const mk = (amount: number, started: Date) => prisma.investment.create({
      data: {
        user: { connect: { id: u.id } }, package: { connect: { id: pkg.id } },
        amount: String(amount), capLimit: String(amount * 2.5), totalEarned: '0',
        status: 'ACTIVE', dailyRoiPercent: '0.5', startedAt: started,
      },
    });
    const older = await mk(100, new Date('2026-01-01'));
    const newer = await mk(100, new Date('2026-06-01'));

    await consumeAllowance(prisma, u.id, money(300)); // 250 fits in the older, 50 spills

    const a = await prisma.investment.findUniqueOrThrow({ where: { id: older.id } });
    const b = await prisma.investment.findUniqueOrThrow({ where: { id: newer.id } });
    expect(Number(a.totalEarned)).toBeCloseTo(250, 6);
    expect(Number(b.totalEarned)).toBeCloseTo(50, 6);
    expect(a.status).toBe('CAPPED');
    expect(b.status).toBe('ACTIVE');
  });

  it('ignores a zero or negative request', async () => {
    const { user } = await invested(100);
    expect(Number(await consumeAllowance(prisma, user.id, money(0)))).toBe(0);
    expect(Number(await consumeAllowance(prisma, user.id, money(-10)))).toBe(0);
    expect(await earnedOn(user.id)).toBe(0);
  });
});
