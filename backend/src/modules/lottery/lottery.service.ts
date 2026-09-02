import crypto from 'node:crypto';
import type { Tx } from '../../core/db.js';
import { prisma } from '../../core/db.js';
import { postEntry } from '../../core/ledger.js';
import { money, toDb } from '../../core/money.js';
import { makeReference } from '../../core/reference.js';
import { badRequest, notFound } from '../../core/errors.js';
import { notifyAdmins, notifyMember } from '../../core/notify.js';
import * as activity from '../../core/activity.js';
import { logger } from '../../core/logger.js';

/**
 * The prize draw.
 *
 * Two properties matter more than anything else here, and both are structural
 * rather than procedural.
 *
 * **Tickets are earned, never bought.** They are issued when a member's
 * cumulative investment crosses a threshold. A draw members pay into separately
 * is a lottery in the regulated sense, in most places requiring a licence; a
 * prize draw that rewards existing customers generally is not. That distinction
 * is worth keeping on the right side of, so there is deliberately no endpoint
 * anywhere that sells a ticket.
 *
 * **The result is verifiable.** A random seed is generated when the draw opens
 * and its SHA-256 is published immediately. Winners are derived from that seed
 * deterministically, and the seed itself is revealed after the draw. Anyone can
 * then recompute the result and confirm it matches the hash that was published
 * before entries closed — which is what makes "we did not pick the winners
 * after seeing who entered" a checkable claim rather than a promise.
 */

const TICKET_PREFIX = 'LT';

// ── ticket issuance ───────────────────────────────────────────────────────

/**
 * Issues any tickets a member has newly earned in every open draw.
 *
 * Runs inside the purchase transaction, so a ticket cannot survive a rolled
 * back investment. Safe to call repeatedly — the count is derived from their
 * volume, and only the shortfall is issued.
 */
export async function issueTickets(db: Tx, userId: string): Promise<number> {
  const [user, draws] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { totalInvested: true } }),
    db.lotteryDraw.findMany({
      where: { status: 'OPEN' },
      select: { id: true, ticketThreshold: true, maxTicketsPerMember: true },
    }),
  ]);
  if (!user || !draws.length) return 0;

  const invested = money(user.totalInvested.toString());
  let issued = 0;

  for (const draw of draws) {
    const threshold = money(draw.ticketThreshold.toString());
    if (threshold.lte(0)) continue;

    // How many they have earned in total, capped so one large investor cannot
    // own the draw.
    const earned = Math.min(
      Math.floor(invested.div(threshold).toNumber()),
      draw.maxTicketsPerMember,
    );
    if (earned <= 0) continue;

    const held = await db.lotteryTicket.count({ where: { drawId: draw.id, userId } });
    for (let i = held; i < earned; i += 1) {
      try {
        await db.lotteryTicket.create({
          data: {
            drawId: draw.id,
            userId,
            number: ticketNumber(),
            issuedAtVolume: toDb(invested),
          },
        });
        issued += 1;
      } catch {
        // Number collision or a concurrent issue. Try again on the next pass
        // rather than failing a purchase over a ticket.
      }
    }
  }

  if (issued) logger.info({ userId, issued }, 'lottery tickets issued');
  return issued;
}

/** Six digits, readable aloud, unique per draw by constraint. */
const ticketNumber = () =>
  `${TICKET_PREFIX}-${String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')}`;

export function announceTickets(userId: string, count: number) {
  if (!count) return;
  notifyMember({
    userId,
    type: 'rank.achieved',
    dedupeKey: `lottery-tickets:${userId}:${Date.now()}`,
    title: count === 1 ? 'You earned a draw ticket' : `You earned ${count} draw tickets`,
    body: 'Your investment qualified you for the next prize draw. Tickets are earned, never bought.',
    link: '/draws',
    meta: { count },
  });
}

// ── operator lifecycle ────────────────────────────────────────────────────

export interface DrawInput {
  id?: string;
  name: string;
  notes?: string;
  ticketThreshold: string;
  maxTicketsPerMember?: number;
  closesAt?: string | null;
  prizes: { position: number; label: string; amount: string }[];
}

export async function upsertDraw(adminId: string, input: DrawInput) {
  const name = input.name.trim();
  if (name.length < 3) throw badRequest('Give the draw a name members will recognise');

  const threshold = money(input.ticketThreshold);
  if (threshold.lte(0)) throw badRequest('The ticket threshold must be positive');

  if (!input.prizes.length) throw badRequest('A draw needs at least one prize');
  const positions = new Set(input.prizes.map((p) => p.position));
  if (positions.size !== input.prizes.length) throw badRequest('Prize positions must be unique');
  if (input.prizes.some((p) => money(p.amount).lte(0))) {
    throw badRequest('Every prize must be worth something');
  }

  if (input.id) {
    const existing = await prisma.lotteryDraw.findUnique({ where: { id: input.id } });
    if (!existing) throw notFound('Draw not found');
    // Changing the prizes or the threshold after tickets exist would move the
    // goalposts on people already entered.
    if (existing.status !== 'DRAFT') {
      throw badRequest('This draw is already open. Prizes and thresholds are fixed once entries begin.');
    }
  }

  return prisma.$transaction(async (tx) => {
    const data = {
      name,
      notes: input.notes?.trim() || null,
      ticketThreshold: toDb(threshold),
      maxTicketsPerMember: input.maxTicketsPerMember ?? 50,
      closesAt: input.closesAt ? new Date(input.closesAt) : null,
    };

    const draw = input.id
      ? await tx.lotteryDraw.update({ where: { id: input.id }, data })
      : await tx.lotteryDraw.create({ data: { ...data, createdBy: adminId } });

    await tx.lotteryPrize.deleteMany({ where: { drawId: draw.id } });
    await tx.lotteryPrize.createMany({
      data: input.prizes.map((p) => ({
        drawId: draw.id,
        position: p.position,
        label: p.label.trim(),
        amount: toDb(money(p.amount)),
      })),
    });

    return draw;
  });
}

/**
 * Opens entries.
 *
 * The seed is generated and its hash published here, before a single ticket
 * exists. That ordering is the whole guarantee.
 */
export async function openDraw(adminId: string, id: string) {
  const draw = await prisma.lotteryDraw.findUnique({
    where: { id },
    include: { prizes: true },
  });
  if (!draw) throw notFound('Draw not found');
  if (draw.status !== 'DRAFT') throw badRequest('Only a draft draw can be opened');
  if (!draw.prizes.length) throw badRequest('Add prizes before opening the draw');

  const seed = crypto.randomBytes(32).toString('hex');
  const seedHash = crypto.createHash('sha256').update(seed).digest('hex');

  const opened = await prisma.lotteryDraw.update({
    where: { id },
    data: { status: 'OPEN', opensAt: new Date(), seed, seedHash },
  });

  // Every active member gets tickets for whatever they have already invested,
  // so opening a draw does not only reward people who invest afterwards.
  const members = await prisma.user.findMany({
    where: { status: 'ACTIVE', totalInvested: { gt: 0 } },
    select: { id: true },
  });
  for (const m of members) {
    await issueTickets(prisma, m.id).catch(() => 0);
  }

  logger.info({ drawId: id, seedHash, backfilled: members.length }, 'lottery draw opened');
  return opened;
}

export async function closeDraw(adminId: string, id: string) {
  const draw = await prisma.lotteryDraw.findUnique({ where: { id } });
  if (!draw) throw notFound('Draw not found');
  if (draw.status !== 'OPEN') throw badRequest('Only an open draw can be closed');
  return prisma.lotteryDraw.update({ where: { id }, data: { status: 'CLOSED' } });
}

/**
 * Runs the draw.
 *
 * Winners come from the seed, not from `Math.random()`: the order is a
 * deterministic function of (seed, ticket list), so the published hash is
 * enough for anyone to check the result afterwards.
 *
 * One ticket can win once. A member holding several can win several prizes —
 * which is the honest consequence of tickets being earned, and stated on the
 * member-facing page rather than quietly prevented.
 */
export async function runDraw(adminId: string, id: string) {
  const draw = await prisma.lotteryDraw.findUnique({
    where: { id },
    include: { prizes: { orderBy: { position: 'asc' } }, tickets: { orderBy: { issuedAt: 'asc' } } },
  });
  if (!draw) throw notFound('Draw not found');
  if (draw.status === 'DRAWN') throw badRequest('This draw has already been run');
  if (draw.status !== 'CLOSED' && draw.status !== 'OPEN') {
    throw badRequest('Only an open or closed draw can be run');
  }
  if (!draw.seed) throw badRequest('This draw has no seed — reopen it');
  if (!draw.tickets.length) throw badRequest('Nobody entered this draw');

  const order = shuffle(draw.tickets.map((t) => t.id), draw.seed);
  const winners: { position: number; ticketId: string; userId: string; amount: string; label: string }[] = [];

  await prisma.$transaction(async (tx) => {
    for (const [index, prize] of draw.prizes.entries()) {
      const ticketId = order[index];
      // More prizes than tickets. Rare, but it must not crash mid-draw.
      if (!ticketId) break;

      const ticket = draw.tickets.find((t) => t.id === ticketId)!;
      await tx.lotteryPrize.update({
        where: { id: prize.id },
        data: { winnerTicketId: ticketId },
      });
      winners.push({
        position: prize.position,
        ticketId,
        userId: ticket.userId,
        amount: prize.amount.toString(),
        label: prize.label,
      });
    }

    await tx.lotteryDraw.update({
      where: { id },
      data: { status: 'DRAWN', drawnAt: new Date() },
    });
  });

  for (const w of winners) {
    const ticket = draw.tickets.find((t) => t.id === w.ticketId)!;
    notifyMember({
      userId: w.userId,
      type: 'rank.achieved',
      dedupeKey: `lottery-win:${w.ticketId}`,
      title: `You won ${w.label}`,
      body: `Ticket ${ticket.number} took ${w.label} in ${draw.name} — $${w.amount}. Claim it from the draws page.`,
      link: '/draws',
      meta: { drawId: id, prize: w.label, amount: w.amount, ticket: ticket.number },
    });
  }

  logger.info({ drawId: id, winners: winners.length }, 'lottery draw run');
  return { draw: draw.name, winners: winners.length, seed: draw.seed, seedHash: draw.seedHash };
}

/**
 * Deterministic shuffle from a seed.
 *
 * Fisher–Yates driven by a SHA-256 counter stream rather than `Math.random()`,
 * so the same (seed, list) always yields the same order — which is what makes
 * the published hash verifiable by anyone.
 */
export function shuffle<T>(items: T[], seed: string): T[] {
  const out = [...items];
  let counter = 0;

  const next = () => {
    const digest = crypto.createHash('sha256').update(`${seed}:${counter++}`).digest();
    return digest.readUInt32BE(0) / 0x1_00_00_00_00;
  };

  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Pays a prize into the winner's main wallet. */
export async function claimPrize(userId: string, prizeId: string) {
  const prize = await prisma.lotteryPrize.findFirst({
    where: { id: prizeId, winnerTicket: { userId } },
    include: { draw: { select: { name: true, status: true } }, winnerTicket: true },
  });
  if (!prize) throw notFound('Prize not found');
  if (prize.draw.status !== 'DRAWN') throw badRequest('That draw has not been run yet');
  if (prize.claimedAt) throw badRequest('You have already claimed this prize');

  const reference = makeReference('LOT', userId);

  return prisma.$transaction(async (tx) => {
    // The guarded update is what stops two taps paying twice.
    const { count } = await tx.lotteryPrize.updateMany({
      where: { id: prizeId, claimedAt: null },
      data: { claimedAt: new Date(), reference },
    });
    if (count === 0) throw badRequest('You have already claimed this prize');

    const amount = money(prize.amount.toString());

    // A prize is a promotional payment, not investment yield — it sits outside
    // the earnings ceiling, the same treatment rank rewards get.
    await postEntry(tx, {
      userId,
      walletType: 'MAIN',
      direction: 'CREDIT',
      category: 'LOTTERY_PRIZE',
      amount,
      reference,
      description: `${prize.draw.name} — ${prize.label}`,
      meta: { drawPrize: prize.label, ticket: prize.winnerTicket?.number ?? null },
      sourceType: 'lottery_prize',
      sourceId: prize.id,
    });
    await tx.$executeRaw`
      UPDATE users SET "totalEarned" = "totalEarned" + ${toDb(amount)}::numeric
       WHERE id = ${userId}`;

    activity.record({
      userId, event: 'PROFILE_UPDATED',
      summary: `Claimed ${prize.label} from ${prize.draw.name} — $${amount.toString()}`,
      meta: { prize: prize.label, amount: amount.toString() },
    });

    return { prize: prize.label, amount: amount.toString(), draw: prize.draw.name };
  });
}

// ── reading ───────────────────────────────────────────────────────────────

/** What a member sees: the live draw, their tickets, and past results. */
export async function memberView(userId: string) {
  const [live, myTickets, past] = await Promise.all([
    prisma.lotteryDraw.findFirst({
      where: { status: { in: ['OPEN', 'CLOSED'] } },
      orderBy: { opensAt: 'desc' },
      include: {
        prizes: { orderBy: { position: 'asc' } },
        _count: { select: { tickets: true } },
      },
    }),
    prisma.lotteryTicket.findMany({
      where: { userId, draw: { status: { in: ['OPEN', 'CLOSED'] } } },
      select: { id: true, number: true, issuedAt: true },
      orderBy: { issuedAt: 'asc' },
    }),
    prisma.lotteryDraw.findMany({
      where: { status: 'DRAWN' },
      orderBy: { drawnAt: 'desc' },
      take: 5,
      include: {
        prizes: {
          orderBy: { position: 'asc' },
          include: {
            winnerTicket: {
              select: {
                number: true, userId: true,
                user: { select: { userCode: true, firstName: true } },
              },
            },
          },
        },
      },
    }),
  ]);

  return {
    live: live && {
      id: live.id,
      name: live.name,
      notes: live.notes,
      status: live.status,
      closesAt: live.closesAt,
      ticketThreshold: live.ticketThreshold.toString(),
      maxTicketsPerMember: live.maxTicketsPerMember,
      totalTickets: live._count.tickets,
      // Published before any ticket existed. Verifiable after the draw.
      seedHash: live.seedHash,
      prizes: live.prizes.map((p) => ({
        position: p.position, label: p.label, amount: p.amount.toString(),
      })),
    },
    myTickets,
    results: past.map((d) => ({
      id: d.id,
      name: d.name,
      drawnAt: d.drawnAt,
      seed: d.seed,
      seedHash: d.seedHash,
      prizes: d.prizes.map((p) => ({
        position: p.position,
        label: p.label,
        amount: p.amount.toString(),
        ticket: p.winnerTicket?.number ?? null,
        // First name and member code only — a winner list is public, a full
        // name and email is not.
        winner: p.winnerTicket
          ? `${p.winnerTicket.user.firstName} (${p.winnerTicket.user.userCode})`
          : null,
        isMine: p.winnerTicket?.userId === userId,
        prizeId: p.id,
        claimed: p.claimedAt !== null,
      })),
    })),
  };
}

/**
 * The console's view of every draw.
 *
 * Two things this deliberately does **not** do:
 *
 *   • **It does not hand back the seed before the draw has run.** The seed is
 *     the secret half of the commitment — `seedHash` is published when entries
 *     open, and anyone holding the seed itself can run the same deterministic
 *     `shuffle` and know the winning tickets while entries are still open. The
 *     member-facing payload has always been careful about this (only `seedHash`
 *     on the live draw); this one returned the whole row, so every operator with
 *     `plan.view` — which includes read-only roles like Support Agent — could
 *     read it off the screen. It is withheld until `DRAWN`, when revealing it is
 *     the entire point.
 *
 *   • **It does not make the caller guess who won.** `winnerTicketId` alone is
 *     unresolvable in the console, so an operator could not check that a draw
 *     paid the people it says it paid.
 */
export async function listDraws() {
  const draws = await prisma.lotteryDraw.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      prizes: {
        orderBy: { position: 'asc' },
        include: {
          winnerTicket: {
            select: { number: true, user: { select: { userCode: true, firstName: true } } },
          },
        },
      },
      _count: { select: { tickets: true } },
    },
  });

  // Distinct entrants per draw in one pass, rather than a count query per row.
  const grouped = draws.length
    ? await prisma.lotteryTicket.groupBy({
      by: ['drawId', 'userId'],
      where: { drawId: { in: draws.map((d) => d.id) } },
    })
    : [];
  const entrants = new Map<string, number>();
  for (const g of grouped) entrants.set(g.drawId, (entrants.get(g.drawId) ?? 0) + 1);

  return draws.map((d) => ({
    id: d.id,
    name: d.name,
    notes: d.notes,
    status: d.status,
    ticketThreshold: d.ticketThreshold.toString(),
    maxTicketsPerMember: d.maxTicketsPerMember,
    opensAt: d.opensAt,
    closesAt: d.closesAt,
    drawnAt: d.drawnAt,
    seedHash: d.seedHash,
    seed: d.status === 'DRAWN' ? d.seed : null,
    entrants: entrants.get(d.id) ?? 0,
    _count: d._count,
    prizes: d.prizes.map((p) => ({
      id: p.id,
      position: p.position,
      label: p.label,
      amount: p.amount.toString(),
      winnerTicketId: p.winnerTicketId,
      claimedAt: p.claimedAt,
      winnerTicket: p.winnerTicket?.number ?? null,
      winner: p.winnerTicket
        ? `${p.winnerTicket.user.firstName} (${p.winnerTicket.user.userCode})`
        : null,
    })),
  }));
}
