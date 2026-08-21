import bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../../core/db.js';
import { money, toDb } from '../../../core/money.js';
import { badRequest, notFound } from '../../../core/errors.js';
import { logger } from '../../../core/logger.js';
import { runWithContext } from '../../../middleware/request-context.js';
import { purchase } from '../../investment/investment.service.js';
import { request as requestWithdrawal } from '../../withdrawal/withdrawal.service.js';
import { runDailyRoi, isTradingDay } from '../../../jobs/daily-roi.job.js';
import { config } from '../../../core/runtime-config.js';
import * as audit from '../audit/audit.service.js';
import { Rng } from './random.js';

/**
 * Dry run.
 *
 * Models a member base against the compensation plan and reports what it
 * actually costs, so the economics can be seen before real money is involved.
 *
 * The design decision that makes this worth trusting: it drives the REAL
 * engine. The same ROI job, the same three-level direct bonus, the same
 * thirty-level generation walk, the same earnings ceiling, the same withdrawal
 * fee and withholding. Nothing here reimplements the maths — a model that
 * reimplements the rules tells you about the model, not about the platform.
 * When the plan is retuned in Settings, this reflects the change for free.
 *
 * Three things it takes care to get right:
 *
 *   • **Erasure is exact.** Every member it creates carries the run id, and
 *     everything else cascades from the member. Erasing deletes by that id and
 *     then verifies nothing survived, rather than guessing which rows were fake.
 *   • **It stays out of the way.** Notifications, activity logs and email are
 *     suppressed for the duration — half a million modelled rows would bury the
 *     real ones, and none of these members is a person to tell.
 *   • **It is repeatable.** The seed makes two runs with the same parameters
 *     identical, which is the only way to compare one scenario against another.
 */

// ── parameters ───────────────────────────────────────────────────────────────

export type JoinPattern = 'STEADY' | 'GROWTH' | 'VIRAL' | 'DECLINE';

export interface SimulationParams {
  /** How many months to run. */
  months: number;
  /** Members already on the platform when the run starts. */
  initialMembers: number;
  /** New members in the first month, before variance. The pattern shapes what follows. */
  joinsPerMonth: number;
  joinPattern: JoinPattern;
  /**
   * How much a month's intake swings either side of the target.
   *
   * 0.3 means a month lands anywhere between 70% and 130% of plan. Real intake
   * is never the same number twice, and a run where every month is identical
   * hides how sensitive the economics are to a bad quarter.
   */
  intakeVariance: number;

  /** Bounds on what a member puts in. Tiers are picked within this. */
  minInvestment: number;
  maxInvestment: number;

  /** Share of members who buy again in a later month. */
  reinvestRate: number;
  /** Share who withdraw available balance each month. */
  withdrawRate: number;
  /** Share on the higher earnings ceiling. */
  activeAffiliateRate: number;

  /** Average directs a recruiting member brings in. Shapes the tree's depth. */
  avgDirectsPerRecruiter: number;
  /** Share of members who recruit at all. Most do not. */
  recruiterRate: number;

  /** Where the modelled months begin. */
  startDate: string;
}

/**
 * A ten-month run reaching roughly five hundred members.
 *
 * Steady rather than growth by default: compounding intake is what the plan is
 * sold on, but it makes the default run four times larger than the numbers on
 * screen suggest, and a first run should finish while someone is still watching.
 */
export const DEFAULT_PARAMS: SimulationParams = {
  months: 10,
  initialMembers: 50,
  joinsPerMonth: 45,
  joinPattern: 'STEADY',
  intakeVariance: 0.3,
  minInvestment: 110,
  maxInvestment: 5300,
  reinvestRate: 0.15,
  withdrawRate: 0.35,
  activeAffiliateRate: 0.25,
  avgDirectsPerRecruiter: 3,
  recruiterRate: 0.3,
  startDate: new Date().toISOString().slice(0, 10),
};

/** How joins scale month to month under each pattern. */
const PATTERN_MULTIPLIER: Record<JoinPattern, (month: number) => number> = {
  // Flat — the same intake every month.
  STEADY: () => 1,
  // Compounding referrals, the shape an MLM is sold on.
  GROWTH: (m) => Math.pow(1.25, m),
  // Fast early growth that flattens as the addressable market thins.
  VIRAL: (m) => 1 + 3 * (1 - Math.exp(-m / 2.5)),
  // Intake falling away, which is what happens once early members cap out.
  DECLINE: (m) => Math.pow(0.8, m),
};

// ── results ──────────────────────────────────────────────────────────────────

export interface MonthResult {
  month: number;
  label: string;
  joined: number;
  totalMembers: number;
  capitalIn: string;
  roiPaid: string;
  directBonusPaid: string;
  generationBonusPaid: string;
  rankRewardsPaid: string;
  otherPaid: string;
  totalPaidOut: string;
  withdrawn: string;
  feesCollected: string;
  taxWithheld: string;
  /** Capital in, minus everything paid out. Negative means the month lost money. */
  netPosition: string;
  /** Running total of the above. */
  cumulativeNet: string;
  cappedMembers: number;
  /** Still owed to active packages if every one runs to its ceiling. */
  outstandingLiability: string;
}

export interface SimulationSummary {
  members: number;
  capitalIn: string;
  totalPaidOut: string;
  byStream: { stream: string; amount: string }[];
  feesCollected: string;
  taxWithheld: string;
  withdrawn: string;
  /** What members still hold and could withdraw today. */
  memberBalances: string;
  /** What active packages could still earn.  */
  outstandingLiability: string;
  /** Capital in, minus paid out, plus fees. The platform's position. */
  netPosition: string;
  /** Including what is still owed. The number that matters. */
  netPositionWithLiability: string;
  /** Paid out for every unit taken in. */
  payoutRatio: number;
  cappedMembers: number;
  /** The month cumulative net first goes negative, if it does. */
  breakEvenMonth: number | null;
  runtimeSeconds: number;
}

// ── running ──────────────────────────────────────────────────────────────────

const PASSWORD_HASH = await bcrypt.hash('simulated-account-no-login', 4);

interface Member {
  id: string;
  path: string;
  depth: number;
  /** Kept in memory so the tree can be built without a query per member. */
  directs: number;
}

export async function start(adminId: string, name: string, params: SimulationParams, seed?: string) {
  assertSane(params);

  const run = await prisma.simulationRun.create({
    data: {
      name: name.trim() || 'Untitled run',
      params: params as unknown as Prisma.InputJsonValue,
      seed: seed?.trim() || Math.random().toString(36).slice(2, 12),
      status: 'RUNNING',
      startedAt: new Date(),
      createdBy: adminId,
    },
  });

  await audit.record({
    adminId, action: 'CREATE', entityType: 'simulation', entityId: run.id,
    summary: `Started dry run "${run.name}" — ${params.months} months, ${params.initialMembers} initial members, ${params.joinPattern.toLowerCase()} intake`,
    after: params as unknown as Prisma.InputJsonValue,
  });

  // Detached on purpose: this takes minutes, and the operator gets progress
  // from the run row rather than an HTTP request held open.
  void execute(run.id).catch((err: unknown) => {
    logger.error({ err, runId: run.id }, 'simulation failed');
  });

  return run;
}

function assertSane(p: SimulationParams) {
  if (p.months < 1 || p.months > 36) throw badRequest('Run between 1 and 36 months');
  if (p.initialMembers < 0 || p.initialMembers > 2000) throw badRequest('Start with at most 2,000 members');
  if (p.joinsPerMonth < 0 || p.joinsPerMonth > 2000) throw badRequest('At most 2,000 joins a month');
  if (p.minInvestment <= 0 || p.maxInvestment < p.minInvestment) {
    throw badRequest('The investment range is not valid');
  }
  for (const [label, v] of [
    ['Reinvestment rate', p.reinvestRate],
    ['Withdrawal rate', p.withdrawRate],
    ['Active affiliate rate', p.activeAffiliateRate],
    ['Recruiter rate', p.recruiterRate],
    ['Intake variance', p.intakeVariance],
  ] as const) {
    if (v < 0 || v > 1) throw badRequest(`${label} must be between 0 and 1`);
  }
  if (Number.isNaN(Date.parse(p.startDate))) throw badRequest('Give a valid start date');

  // A guard against a run nobody meant to ask for.
  const projected = p.initialMembers + p.joinsPerMonth * p.months * 4;
  if (projected > 20_000) {
    throw badRequest(
      `Those parameters would create roughly ${projected.toLocaleString()} members. ` +
      'Reduce the intake or the number of months — this drives the real engine, so it is not free.',
    );
  }
}

async function execute(runId: string) {
  const started = Date.now();

  // Everything below runs with the simulation flag set, so no modelled member
  // is emailed, notified, or written to an activity trail.
  await runWithContext({ requestId: `sim-${runId}`, simulating: true, simulationRunId: runId }, async () => {
    const run = await prisma.simulationRun.findUniqueOrThrow({ where: { id: runId } });
    const params = run.params as unknown as SimulationParams;
    const rng = new Rng(run.seed);
    const cfg = await config();

    const packages = await prisma.packagePlan.findMany({
      where: {
        isActive: true,
        amount: { gte: toDb(money(params.minInvestment)), lte: toDb(money(params.maxInvestment)) },
      },
      orderBy: { amount: 'asc' },
      select: { id: true, amount: true },
    });

    if (!packages.length) {
      throw new Error('No active packages fall within that investment range');
    }

    const members: Member[] = [];
    const monthly: MonthResult[] = [];
    let sequence = 0;
    let cumulativeNet = money(0);

    const progress = async (percent: number, label: string) => {
      await prisma.simulationRun.update({
        where: { id: runId },
        data: { progress: Math.min(99, Math.round(percent)), progressLabel: label },
      });
    };

    // ── the initial cohort, before month one ─────────────────────────────
    const start = new Date(`${params.startDate}T00:00:00.000Z`);
    await progress(1, `Creating ${params.initialMembers} founding members`);

    for (let i = 0; i < params.initialMembers; i += 1) {
      sequence += 1;
      members.push(await createMember(runId, sequence, rng, members, params, start));
    }
    await invest(members, packages, rng, params, 0, members.length);

    // ── month by month ───────────────────────────────────────────────────
    for (let month = 0; month < params.months; month += 1) {
      const monthStart = addMonths(start, month);
      const monthEnd = addMonths(start, month + 1);
      const before = await snapshot(runId);

      /**
       * Intake for the month, then spread across its days.
       *
       * Members used to be created on the first of the month and accrue the
       * whole of it. Real people join throughout — somebody joining on the 28th
       * earns two days, not twenty-two — and creating them all up front
       * overstated the first month of every cohort.
       *
       * So the loop below runs day by day: members join on their own day, and
       * the ROI run only ever sees the members who had actually arrived.
       */
      const target = Math.round(params.joinsPerMonth * PATTERN_MULTIPLIER[params.joinPattern](month));
      const swing = rng.float(1 - params.intakeVariance, 1 + params.intakeVariance);
      const joined = Math.max(0, Math.round(target * swing));

      const daysInMonth = Math.round((monthEnd.getTime() - monthStart.getTime()) / 86_400_000);
      // A join day each, so arrivals are scattered rather than batched.
      const joinDays = Array.from({ length: joined }, () => rng.int(1, daysInMonth));

      await progress(
        2 + (month / params.months) * 92,
        `Month ${month + 1} of ${params.months} — ${members.length} members`,
      );

      let withdrawn = money(0);

      for (let dayIndex = 1; dayIndex <= daysInMonth; dayIndex += 1) {
        const day = new Date(monthStart);
        day.setUTCDate(day.getUTCDate() + dayIndex - 1);

        // Today's arrivals, each buying as they join.
        const arrivingToday = joinDays.filter((d) => d === dayIndex).length;
        for (let i = 0; i < arrivingToday; i += 1) {
          sequence += 1;
          const member = await createMember(runId, sequence, rng, members, params, day);
          members.push(member);
          const pkg = rng.weightedPick(packages);
          await fund(member.id, Number(pkg.amount));
          await purchase(member.id, pkg.id).catch(() => undefined);
        }

        if (isTradingDay(day, cfg.tradingDays)) {
          await runDailyRoi(new Date(day));
        }

        // Reinvestment and withdrawals happen on ordinary days too, not in a
        // batch at month end.
        for (const m of members) {
          if (rng.chance(params.reinvestRate / 365)) {
            const pkg = rng.weightedPick(packages);
            await fund(m.id, Number(pkg.amount));
            await purchase(m.id, pkg.id).catch(() => undefined);
          }

          if (!rng.chance(params.withdrawRate / 365)) continue;
          const wallet = await prisma.walletAccount.findFirst({
            where: { userId: m.id, type: 'MAIN' },
            select: { balance: true },
          });
          const available = money(wallet?.balance.toString() ?? '0');
          if (available.lt(cfg.withdrawMin)) continue;

          // A member rarely takes the lot — most leave some in.
          const share = rng.float(0.4, 1);
          const wanted = available.mul(share);
          const amount = wanted.gt(cfg.withdrawMax) ? money(cfg.withdrawMax) : wanted;
          if (amount.lt(cfg.withdrawMin)) continue;

          const w = await requestWithdrawal(m.id, amount.toString(), SIMULATED_ADDRESS)
            .catch(() => null);
          if (w) withdrawn = withdrawn.add(money(w.amount.toString()));
        }
      }

      const after = await snapshot(runId);
      const result = diff(month, monthStart, joined, members.length, before, after, withdrawn, cumulativeNet);
      cumulativeNet = money(result.cumulativeNet);
      monthly.push(result);

      await prisma.simulationRun.update({
        where: { id: runId },
        data: { monthly: monthly as unknown as Prisma.InputJsonValue, memberCount: members.length },
      });
    }

    await progress(96, 'Totalling');
    const summary = await summarise(runId, monthly, Date.now() - started);

    await prisma.simulationRun.update({
      where: { id: runId },
      data: {
        status: 'COMPLETE',
        progress: 100,
        progressLabel: 'Done',
        summary: summary as unknown as Prisma.InputJsonValue,
        monthly: monthly as unknown as Prisma.InputJsonValue,
        memberCount: members.length,
        completedAt: new Date(),
      },
    });

    logger.info(
      { runId, members: members.length, seconds: Math.round((Date.now() - started) / 1000) },
      'simulation complete',
    );
  }).catch(async (err: unknown) => {
    await prisma.simulationRun.update({
      where: { id: runId },
      data: {
        status: 'FAILED',
        error: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
        completedAt: new Date(),
      },
    });
    throw err;
  });
}

/** Payouts go nowhere. A modelled withdrawal still exercises the fee and cap. */
const SIMULATED_ADDRESS = '0x5111111111111111111111111111111111111111';

async function createMember(
  runId: string,
  sequence: number,
  rng: Rng,
  existing: Member[],
  params: SimulationParams,
  joinedAt: Date,
): Promise<Member> {
  /**
   * Sponsors are chosen by preferential attachment — a member who already has
   * directs is likelier to gain more.
   *
   * Picking uniformly would produce a flat, wide tree that nobody's network
   * looks like, and would badly understate the generation bonus: that cost is
   * driven by depth, and depth only appears when recruiting concentrates.
   */
  let sponsor: Member | undefined;
  if (existing.length) {
    const recruiters = existing.filter((m) => m.directs > 0);
    const pool = recruiters.length && rng.chance(0.75) ? recruiters : existing;

    // Bias toward earlier members, who have had longer to recruit.
    const idx = Math.floor(Math.pow(rng.next(), 1.8) * pool.length);
    const candidate = pool[Math.min(idx, pool.length - 1)]!;

    const cap = Math.round(
      rng.normal(params.avgDirectsPerRecruiter, params.avgDirectsPerRecruiter / 2, 1, 40),
    );
    if (candidate.directs < cap || rng.chance(params.recruiterRate)) sponsor = candidate;
  }

  const user = await prisma.user.create({
    data: {
      // Namespaced by run: the sequence restarts at one each time, and two runs
      // coexisting in the database would otherwise collide on the first member.
      userCode: `SIM${runId.slice(-4).toUpperCase()}${String(sequence).padStart(5, '0')}`,
      email: `sim-${runId.slice(-6)}-${sequence}@simulation.invalid`,
      passwordHash: PASSWORD_HASH,
      firstName: `Member ${sequence}`,
      status: 'ACTIVE',
      affiliateMode: rng.chance(params.activeAffiliateRate) ? 'ACTIVE' : 'PASSIVE',
      sponsorId: sponsor?.id,
      path: sponsor ? (sponsor.path ? `${sponsor.path}.${sponsor.id}` : sponsor.id) : '',
      depth: sponsor ? sponsor.depth + 1 : 0,
      createdAt: joinedAt,
      simulationRunId: runId,
    },
    select: { id: true, path: true, depth: true },
  });

  await prisma.walletAccount.createMany({
    data: (['MAIN', 'FUND', 'DIGITAL'] as const).map((type) => ({ userId: user.id, type })),
  });
  await prisma.teamVolume.create({ data: { userId: user.id } });

  /**
   * Modelled members arrive verified.
   *
   * Withdrawals are gated on approved KYC, so without this every modelled
   * withdrawal failed silently — which meant the run collected no fees and
   * reported a cash position better than the platform would actually see. The
   * gate is worth testing on its own; it is not what this is measuring.
   */
  await prisma.kycSubmission.create({
    data: {
      userId: user.id,
      fullName: `Member ${sequence}`,
      documentNo: `SIM-${sequence}`,
      countryCode: 'IN',
      status: 'APPROVED',
      reviewedAt: joinedAt,
    },
  });

  if (sponsor) {
    sponsor.directs += 1;
    await prisma.$executeRaw`
      UPDATE users
         SET "directCount" = "directCount" + 1, "activeDirectCount" = "activeDirectCount" + 1
       WHERE id = ${sponsor.id}`;
  }

  return { id: user.id, path: user.path, depth: user.depth, directs: 0 };
}

/** Funds and buys for a slice of the member list. */
async function invest(
  members: Member[],
  packages: { id: string; amount: Prisma.Decimal }[],
  rng: Rng,
  _params: SimulationParams,
  from: number,
  to: number,
) {
  for (let i = from; i < to; i += 1) {
    // Weighted toward the cheaper tiers, which is where a real member base sits.
    const pkg = rng.weightedPick(packages);
    await fund(members[i]!.id, Number(pkg.amount));
    await purchase(members[i]!.id, pkg.id).catch(() => undefined);
  }
}

/**
 * Credits the fund wallet directly.
 *
 * Deliberately not through the deposit flow: a modelled deposit would need an
 * operator to confirm it, and the point here is the compensation plan's
 * economics, not the deposit queue. The capital is still counted as taken in.
 */
const fund = (userId: string, amount: number) =>
  prisma.$executeRaw`
    UPDATE wallet_accounts SET balance = balance + ${amount}::numeric
     WHERE "userId" = ${userId} AND type = 'FUND'`;

// ── measurement ──────────────────────────────────────────────────────────────

interface Snapshot {
  capitalIn: string;
  byCategory: Record<string, string>;
  fees: string;
  tax: string;
  liability: string;
  capped: number;
}

/** Everything is read from the ledger, so the figures are what actually moved. */
async function snapshot(runId: string): Promise<Snapshot> {
  const where = { user: { simulationRunId: runId } };

  const [invested, credits, withdrawals, liability, capped] = await Promise.all([
    prisma.investment.aggregate({ where, _sum: { amount: true } }),
    prisma.ledgerEntry.groupBy({
      by: ['category'],
      where: { ...where, direction: 'CREDIT' },
      _sum: { amount: true },
    }),
    prisma.withdrawal.aggregate({ where, _sum: { fee: true, tax: true } }),
    prisma.investment.aggregate({
      where: { ...where, status: 'ACTIVE' },
      _sum: { capLimit: true, totalEarned: true },
    }),
    prisma.investment.count({ where: { ...where, status: 'CAPPED' } }),
  ]);

  const byCategory: Record<string, string> = {};
  for (const c of credits) byCategory[c.category] = c._sum.amount?.toString() ?? '0';

  const ceiling = money(liability._sum.capLimit?.toString() ?? '0');
  const earned = money(liability._sum.totalEarned?.toString() ?? '0');

  return {
    capitalIn: invested._sum.amount?.toString() ?? '0',
    byCategory,
    fees: withdrawals._sum.fee?.toString() ?? '0',
    tax: withdrawals._sum.tax?.toString() ?? '0',
    liability: ceiling.sub(earned).toString(),
    capped,
  };
}

const cat = (s: Snapshot, key: string) => money(s.byCategory[key] ?? '0');

function diff(
  month: number,
  monthStart: Date,
  joined: number,
  totalMembers: number,
  before: Snapshot,
  after: Snapshot,
  withdrawn: ReturnType<typeof money>,
  runningNet: ReturnType<typeof money>,
): MonthResult {
  const delta = (key: string) => cat(after, key).sub(cat(before, key));

  const capitalIn = money(after.capitalIn).sub(money(before.capitalIn));
  const roi = delta('DAILY_ROI');
  const direct = delta('DIRECT_BONUS');
  const generation = delta('GENERATION_BONUS');
  const rank = delta('RANK_BONUS');
  const other = delta('ROAMING_CLUB').add(delta('REWARD_CARD')).add(delta('LOTTERY_PRIZE'));

  const paidOut = roi.add(direct).add(generation).add(rank).add(other);
  const fees = money(after.fees).sub(money(before.fees));
  const tax = money(after.tax).sub(money(before.tax));

  // Capital in, less what was paid to members, plus what the platform kept.
  const net = capitalIn.sub(paidOut).add(fees).add(tax);
  const cumulative = runningNet.add(net);

  return {
    month: month + 1,
    label: monthStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
    joined,
    totalMembers,
    capitalIn: capitalIn.toString(),
    roiPaid: roi.toString(),
    directBonusPaid: direct.toString(),
    generationBonusPaid: generation.toString(),
    rankRewardsPaid: rank.toString(),
    otherPaid: other.toString(),
    totalPaidOut: paidOut.toString(),
    withdrawn: withdrawn.toString(),
    feesCollected: fees.toString(),
    taxWithheld: tax.toString(),
    netPosition: net.toString(),
    cumulativeNet: cumulative.toString(),
    cappedMembers: after.capped,
    outstandingLiability: after.liability,
  };
}

async function summarise(
  runId: string,
  monthly: MonthResult[],
  runtimeMs: number,
): Promise<SimulationSummary> {
  const final = await snapshot(runId);
  const where = { user: { simulationRunId: runId } };

  const [balances, withdrawals, members] = await Promise.all([
    prisma.walletAccount.aggregate({ where, _sum: { balance: true } }),
    prisma.withdrawal.aggregate({ where, _sum: { amount: true } }),
    prisma.user.count({ where: { simulationRunId: runId } }),
  ]);

  const STREAMS = [
    ['Daily returns', 'DAILY_ROI'],
    ['Direct sponsor bonus', 'DIRECT_BONUS'],
    ['Generation bonus', 'GENERATION_BONUS'],
    ['Rank rewards', 'RANK_BONUS'],
    ['Roaming Club', 'ROAMING_CLUB'],
    ['Reward cards', 'REWARD_CARD'],
    ['Prize draws', 'LOTTERY_PRIZE'],
  ] as const;

  const byStream = STREAMS
    .map(([stream, key]) => ({ stream, amount: cat(final, key).toString() }))
    .filter((s) => money(s.amount).gt(0));

  const capitalIn = money(final.capitalIn);
  const paidOut = byStream.reduce((sum, s) => sum.add(money(s.amount)), money(0));
  const fees = money(final.fees);
  const tax = money(final.tax);

  const net = capitalIn.sub(paidOut).add(fees).add(tax);
  const liability = money(final.liability);

  const breakEven = monthly.find((m) => money(m.cumulativeNet).lt(0));

  return {
    members,
    capitalIn: capitalIn.toString(),
    totalPaidOut: paidOut.toString(),
    byStream,
    feesCollected: fees.toString(),
    taxWithheld: tax.toString(),
    withdrawn: withdrawals._sum.amount?.toString() ?? '0',
    memberBalances: balances._sum.balance?.toString() ?? '0',
    outstandingLiability: liability.toString(),
    netPosition: net.toString(),
    netPositionWithLiability: net.sub(liability).toString(),
    payoutRatio: capitalIn.gt(0)
      ? Math.round(paidOut.div(capitalIn).toNumber() * 100) / 100
      : 0,
    cappedMembers: final.capped,
    breakEvenMonth: breakEven?.month ?? null,
    runtimeSeconds: Math.round(runtimeMs / 1000),
  };
}

const addMonths = (d: Date, n: number) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate()));

// ── reading and erasing ──────────────────────────────────────────────────────

export const list = () =>
  prisma.simulationRun.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

export async function detail(id: string) {
  const run = await prisma.simulationRun.findUnique({ where: { id } });
  if (!run) throw notFound('Run not found');

  // Counted live rather than trusted from the row, so an erase that half
  // finished cannot report as if it had not run.
  const liveMembers = await prisma.user.count({ where: { simulationRunId: id } });
  return { ...run, liveMembers };
}

/**
 * Removes everything a run created.
 *
 * Members carry the run id and everything else cascades from the member, so
 * this is one delete rather than a list of tables to remember. The rows that do
 * not cascade — notification recipients keyed by actor id — are cleared first.
 *
 * The count is verified afterwards. An erase that silently leaves modelled
 * members behind would put fake accounts in every report from then on, and
 * nobody would know which they were.
 */
export async function erase(adminId: string, id: string) {
  const run = await prisma.simulationRun.findUnique({ where: { id } });
  if (!run) throw notFound('Run not found');
  if (run.status === 'RUNNING') {
    throw badRequest('This run is still going. Wait for it to finish before erasing.');
  }

  const ids = await prisma.user.findMany({
    where: { simulationRunId: id },
    select: { id: true },
  });
  const userIds = ids.map((u) => u.id);

  if (userIds.length) {
    // No foreign key ties these to a user, so they will not cascade.
    await prisma.notificationRecipient.deleteMany({
      where: { actorType: 'USER', actorId: { in: userIds } },
    });
    await prisma.notificationPreference.deleteMany({
      where: { actorType: 'USER', actorId: { in: userIds } },
    });
    await prisma.session.deleteMany({
      where: { actorType: 'USER', actorId: { in: userIds } },
    });
    await prisma.idempotencyKey.deleteMany({
      where: { actorType: 'USER', actorId: { in: userIds } },
    });
    await prisma.announcementDismissal.deleteMany({ where: { userId: { in: userIds } } });
  }

  await prisma.user.deleteMany({ where: { simulationRunId: id } });

  const remaining = await prisma.user.count({ where: { simulationRunId: id } });
  if (remaining > 0) {
    throw new Error(`Erase incomplete — ${remaining} modelled members remain. Nothing was marked erased.`);
  }

  const orphanLedger = await prisma.ledgerEntry.count({
    where: { user: { simulationRunId: id } },
  });
  if (orphanLedger > 0) {
    throw new Error(`Erase incomplete — ${orphanLedger} ledger entries remain.`);
  }

  await prisma.simulationRun.update({
    where: { id },
    data: { status: 'ERASED', erasedAt: new Date(), memberCount: 0 },
  });

  await audit.record({
    adminId, action: 'DELETE', entityType: 'simulation', entityId: id,
    summary: `Erased dry run "${run.name}" — ${userIds.length} modelled members and everything they created`,
  });

  logger.info({ runId: id, members: userIds.length }, 'simulation erased');
  return { erased: userIds.length };
}

/** How much modelled data is sitting in the database right now. */
export async function footprint() {
  const [members, runs] = await Promise.all([
    prisma.user.count({ where: { simulationRunId: { not: null } } }),
    prisma.simulationRun.count({ where: { status: { in: ['RUNNING', 'COMPLETE', 'FAILED'] } } }),
  ]);
  return { members, runs, clean: members === 0 };
}
