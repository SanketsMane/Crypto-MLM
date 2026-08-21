import crypto from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { purchase } from '../src/modules/investment/investment.service.js';
import * as lottery from '../src/modules/lottery/lottery.service.js';
import { prisma, resetData, seedPlan, makeUser, balanceOf } from './helpers.js';

const plan = (amount: string) => prisma.packagePlan.findFirstOrThrow({ where: { amount } });

async function makeAdmin() {
  const role = await prisma.adminRole.findFirstOrThrow({ where: { slug: 'super-admin' } });
  return prisma.adminUser.create({
    data: {
      email: `op-${Date.now()}-${Math.round(performance.now() * 1000)}@test.local`,
      passwordHash: 'x', name: 'Operator', roleId: role.id,
    },
  });
}

const draft = (adminId: string, over: Partial<Parameters<typeof lottery.upsertDraw>[1]> = {}) =>
  lottery.upsertDraw(adminId, {
    name: 'Gateway of Winners',
    ticketThreshold: '500',
    maxTicketsPerMember: 5,
    prizes: [
      { position: 1, label: '1st prize', amount: '100' },
      { position: 2, label: '2nd prize', amount: '50' },
    ],
    ...over,
  });

beforeAll(seedPlan);
beforeEach(resetData);

describe('tickets', () => {
  it('are earned by investing, never bought', async () => {
    const admin = await makeAdmin();
    const d = await draft(admin.id);
    await lottery.openDraw(admin.id, d.id);

    const u = await makeUser({ funded: 1200 });
    await purchase(u.id, (await plan('1100')).id);

    // 1,100 invested against a 500 threshold = 2 tickets
    expect(await prisma.lotteryTicket.count({ where: { userId: u.id } })).toBe(2);
  });

  it('are capped per member so one investor cannot own the draw', async () => {
    const admin = await makeAdmin();
    const d = await draft(admin.id, { maxTicketsPerMember: 2 });
    await lottery.openDraw(admin.id, d.id);

    // 2,650 against a 500 threshold earns 5, but the cap is 2.
    const u = await makeUser({ funded: 3000 });
    await purchase(u.id, (await plan('2650')).id);

    expect(await prisma.lotteryTicket.count({ where: { userId: u.id } })).toBe(2);
  });

  it('do not accumulate twice for the same investment', async () => {
    const admin = await makeAdmin();
    const d = await draft(admin.id);
    await lottery.openDraw(admin.id, d.id);

    const u = await makeUser({ funded: 1200 });
    await purchase(u.id, (await plan('1100')).id);
    await lottery.issueTickets(prisma, u.id);
    await lottery.issueTickets(prisma, u.id);

    expect(await prisma.lotteryTicket.count({ where: { userId: u.id } })).toBe(2);
  });

  it('are backfilled when a draw opens, so existing investors are not excluded', async () => {
    const u = await makeUser({ funded: 1200 });
    await purchase(u.id, (await plan('1100')).id);

    const admin = await makeAdmin();
    const d = await draft(admin.id);
    await lottery.openDraw(admin.id, d.id);

    expect(await prisma.lotteryTicket.count({ where: { drawId: d.id, userId: u.id } })).toBe(2);
  });

  it('are not issued for a draft draw', async () => {
    const admin = await makeAdmin();
    await draft(admin.id);

    const u = await makeUser({ funded: 1200 });
    await purchase(u.id, (await plan('1100')).id);

    expect(await prisma.lotteryTicket.count()).toBe(0);
  });
});

describe('fairness', () => {
  it('publishes the seed hash before any ticket exists', async () => {
    const admin = await makeAdmin();
    const d = await draft(admin.id);
    const opened = await lottery.openDraw(admin.id, d.id);

    expect(opened.seedHash).toMatch(/^[0-9a-f]{64}$/);
    expect(await prisma.lotteryTicket.count({ where: { drawId: d.id } })).toBe(0);
  });

  it('the revealed seed matches the hash published in advance', async () => {
    const admin = await makeAdmin();
    const d = await draft(admin.id);
    const opened = await lottery.openDraw(admin.id, d.id);

    const u = await makeUser({ funded: 1200 });
    await purchase(u.id, (await plan('1100')).id);
    const result = await lottery.runDraw(admin.id, d.id);

    const recomputed = crypto.createHash('sha256').update(result.seed!).digest('hex');
    expect(recomputed).toBe(opened.seedHash);
  });

  it('the winner order is reproducible from the seed alone', async () => {
    const tickets = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const seed = 'a-fixed-seed-for-this-test';

    // Anyone holding the seed and the ticket list can recompute the result.
    expect(lottery.shuffle(tickets, seed)).toEqual(lottery.shuffle(tickets, seed));
    expect(lottery.shuffle(tickets, 'a-different-seed')).not.toEqual(lottery.shuffle(tickets, seed));
  });

  it('actually shuffles rather than returning the input order', () => {
    const tickets = Array.from({ length: 50 }, (_, i) => `t${i}`);
    const shuffled = lottery.shuffle(tickets, 'seed');

    expect(shuffled).toHaveLength(50);
    expect(new Set(shuffled).size).toBe(50);          // nothing lost or duplicated
    expect(shuffled).not.toEqual(tickets);            // and it moved
  });
});

describe('running a draw', () => {
  const withEntrants = async (count: number) => {
    const admin = await makeAdmin();
    const d = await draft(admin.id);
    await lottery.openDraw(admin.id, d.id);

    const users = [];
    for (let i = 0; i < count; i += 1) {
      const u = await makeUser({ funded: 1200 });
      await purchase(u.id, (await plan('1100')).id);
      users.push(u);
    }
    return { admin, draw: d, users };
  };

  it('assigns every prize to a distinct ticket', async () => {
    const { admin, draw } = await withEntrants(4);
    await lottery.runDraw(admin.id, draw.id);

    const prizes = await prisma.lotteryPrize.findMany({ where: { drawId: draw.id } });
    const winners = prizes.map((p) => p.winnerTicketId);
    expect(winners.every(Boolean)).toBe(true);
    expect(new Set(winners).size).toBe(prizes.length);
  });

  it('cannot be run twice', async () => {
    const { admin, draw } = await withEntrants(3);
    await lottery.runDraw(admin.id, draw.id);
    await expect(lottery.runDraw(admin.id, draw.id)).rejects.toThrow(/already been run/);
  });

  it('refuses a draw nobody entered', async () => {
    const admin = await makeAdmin();
    const d = await draft(admin.id);
    await lottery.openDraw(admin.id, d.id);

    await expect(lottery.runDraw(admin.id, d.id)).rejects.toThrow(/Nobody entered/);
  });

  it('survives having more prizes than tickets', async () => {
    const admin = await makeAdmin();
    const d = await lottery.upsertDraw(admin.id, {
      name: 'Small draw',
      ticketThreshold: '1000',
      prizes: Array.from({ length: 5 }, (_, i) => ({
        position: i + 1, label: `Prize ${i + 1}`, amount: '10',
      })),
    });
    await lottery.openDraw(admin.id, d.id);

    const u = await makeUser({ funded: 1200 });
    await purchase(u.id, (await plan('1100')).id);   // exactly 1 ticket

    const result = await lottery.runDraw(admin.id, d.id);
    expect(result.winners).toBe(1);
  });

  it('freezes prizes once entries open', async () => {
    const admin = await makeAdmin();
    const d = await draft(admin.id);
    await lottery.openDraw(admin.id, d.id);

    await expect(
      lottery.upsertDraw(admin.id, {
        id: d.id, name: 'Gateway of Winners', ticketThreshold: '1',
        prizes: [{ position: 1, label: 'Bigger prize', amount: '99999' }],
      }),
    ).rejects.toThrow(/already open/);
  });
});

describe('claiming a prize', () => {
  const runWithWinner = async () => {
    const admin = await makeAdmin();
    const d = await draft(admin.id);
    await lottery.openDraw(admin.id, d.id);

    const u = await makeUser({ funded: 1200 });
    await purchase(u.id, (await plan('1100')).id);
    await lottery.runDraw(admin.id, d.id);

    const prize = await prisma.lotteryPrize.findFirstOrThrow({
      where: { drawId: d.id, winnerTicketId: { not: null } },
      include: { winnerTicket: true },
    });
    return { userId: prize.winnerTicket!.userId, prizeId: prize.id, amount: Number(prize.amount) };
  };

  it('pays into the main wallet', async () => {
    const { userId, prizeId, amount } = await runWithWinner();
    const before = await balanceOf(userId);

    await lottery.claimPrize(userId, prizeId);

    expect(await balanceOf(userId) - before).toBeCloseTo(amount, 6);
  });

  it('can only be claimed once', async () => {
    const { userId, prizeId } = await runWithWinner();
    await lottery.claimPrize(userId, prizeId);
    await expect(lottery.claimPrize(userId, prizeId)).rejects.toThrow(/already claimed/);
  });

  it('two taps pay once', async () => {
    const { userId, prizeId, amount } = await runWithWinner();
    const before = await balanceOf(userId);

    const results = await Promise.allSettled([
      lottery.claimPrize(userId, prizeId),
      lottery.claimPrize(userId, prizeId),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await balanceOf(userId) - before).toBeCloseTo(amount, 6);
  });

  it('cannot be claimed by someone who did not win it', async () => {
    const { prizeId } = await runWithWinner();
    const other = await makeUser();

    await expect(lottery.claimPrize(other.id, prizeId)).rejects.toThrow(/not found/);
  });

  it('sits outside the earnings ceiling, like a rank reward', async () => {
    const { userId, prizeId, amount } = await runWithWinner();

    // Push the member to their cap.
    const inv = await prisma.investment.findFirstOrThrow({ where: { userId } });
    await prisma.investment.update({ where: { id: inv.id }, data: { totalEarned: inv.capLimit } });
    const before = await balanceOf(userId);

    await lottery.claimPrize(userId, prizeId);

    // A promotional prize is not investment yield, so the cap does not clamp it.
    expect(await balanceOf(userId) - before).toBeCloseTo(amount, 6);
  });
});
