import bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../../core/db.js';
import { money, toDb } from '../../../core/money.js';
import { badRequest, notFound } from '../../../core/errors.js';
import { logger } from '../../../core/logger.js';
import { runWithContext, simulationRunId } from '../../../middleware/request-context.js';
import { post } from '../../../core/ledger.js';
import { purchase } from '../../investment/investment.service.js';
import { request as requestWithdrawal } from '../../withdrawal/withdrawal.service.js';
import { transfer as walletTransfer } from '../../wallet/wallet.service.js';
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

/** Which tiers the modelled members are allowed to buy. */
export type PackageMode = 'RANGE' | 'SINGLE' | 'MIX';

/** Where the money for a repeat purchase comes from. */
export type ReinvestSource = 'NEW_MONEY' | 'BALANCE' | 'MIXED';

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

  // ── which packages are on offer ────────────────────────────────────────────

  /**
   * How the tiers available to members are chosen.
   *
   *   RANGE   every active package priced between min and max
   *   SINGLE  one named package — what a single tier costs, on its own
   *   MIX     an explicit shortlist, for comparing a few against each other
   *
   * SINGLE is the one worth reaching for when a tier is being priced. The
   * ladder spans three orders of magnitude, and a blended run tells you what
   * the *mix* costs, which is not the same question.
   */
  packageMode: PackageMode;
  /** The tiers for SINGLE and MIX. Ignored under RANGE. */
  packageIds: string[];
  /**
   * How strongly buying favours the cheap end of whatever is on offer.
   *
   * 1 spreads members evenly across the tiers; higher concentrates them at the
   * bottom, where a real member base sits. It matters more than it looks:
   * with tiers from $110 to $104,300, an even spread invents capital the
   * platform would never take in, and flatters every figure downstream.
   */
  packageSkew: number;

  // ── money behaviour ────────────────────────────────────────────────────────

  /**
   * Where a repeat purchase is paid from.
   *
   *   NEW_MONEY  fresh capital, counted as intake
   *   BALANCE    compounded out of earnings, moved main → fund as a member does
   *   MIXED      a coin flip between the two
   *
   * This is not a detail. Under NEW_MONEY every reinvestment arrives as new
   * capital, so the platform books income for money it never received — and
   * reinvestment is the one behaviour the plan encourages hardest.
   */
  reinvestSource: ReinvestSource;

  /** The share of an available balance a withdrawing member actually takes. */
  withdrawShareMin: number;
  withdrawShareMax: number;

  // ── attrition ──────────────────────────────────────────────────────────────

  /**
   * Share of members who go quiet each year.
   *
   * They stop buying again and stop introducing anyone. What they already hold
   * keeps earning to its ceiling and they still withdraw — people do not
   * abandon a balance — so this raises cost and lowers intake, which is the
   * conservative way round.
   */
  churnRate: number;

  /**
   * How concentrated recruiting is, from 0 (introductions spread evenly) to 1
   * (a handful of members bring in most of the base).
   *
   * This shapes the tree, and the tree is what the commission bill is paid on.
   * Concentration builds hubs — wide and shallow, a few members with very large
   * downlines — which pays the direct bonus hard and reaches fewer generations.
   * Spread it out and the tree grows in chains instead: deeper, so the
   * thirty-level generation walk finds more people to pay.
   */
  sponsorConcentration: number;

  /** Monthly intake multiplier under GROWTH. 1.25 is +25% a month. */
  growthRate: number;
  /** Monthly intake multiplier under DECLINE. 0.8 is -20% a month. */
  declineRate: number;
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

  packageMode: 'RANGE',
  packageIds: [],
  packageSkew: 2.5,

  // Mixed rather than new money. Treating every reinvestment as fresh capital
  // is the single most flattering assumption available here, and it is not the
  // one to make by default.
  reinvestSource: 'MIXED',
  withdrawShareMin: 0.4,
  withdrawShareMax: 1,

  churnRate: 0.2,
  sponsorConcentration: 0.7,
  growthRate: 1.25,
  declineRate: 0.8,
};

/** How joins scale month to month under each pattern. */
const PATTERN_MULTIPLIER: Record<JoinPattern, (month: number, p: SimulationParams) => number> = {
  // Flat — the same intake every month.
  STEADY: () => 1,
  // Compounding referrals, the shape an MLM is sold on.
  GROWTH: (m, p) => Math.pow(p.growthRate, m),
  // Fast early growth that flattens as the addressable market thins.
  VIRAL: (m) => 1 + 3 * (1 - Math.exp(-m / 2.5)),
  // Intake falling away, which is what happens once early members cap out.
  DECLINE: (m, p) => Math.pow(p.declineRate, m),
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

/** What one tier took in and cost, across the whole run. */
export interface PackageResult {
  packageId: string;
  name: string;
  /** Ticket price of the tier. */
  amount: string;
  /** Distinct members holding at least one. */
  members: number;
  /** Packages bought, including repeat purchases. */
  investments: number;
  /**
   * Total ticket value of this tier — not the same as the run's capital in.
   *
   * A package compounded out of earnings has a ticket price but brought no
   * money from outside, so this can exceed intake. It is the right measure for
   * "what did this tier commit us to"; it is the wrong one for cash.
   */
  invested: string;
  /**
   * Everything credited against these packages — daily returns and the
   * commissions their holders earned alike, because both consume the same
   * ceiling and both are what the tier costs.
   */
  paidOut: string;
  /** Still owed if every live package of this tier runs to its ceiling. */
  outstandingLiability: string;
  /** How many have already reached the ceiling. */
  capped: number;
  /** Ticket value, less paid out. */
  netPosition: string;
  /** Including what is still owed — the figure that decides whether a tier works. */
  netPositionWithLiability: string;
  /** Paid out for every unit of ticket value. */
  payoutRatio: number;
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
  /** Per tier, cheapest first. What a single-package run exists to show. */
  byPackage: PackageResult[];
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
  /** Gone quiet: buys nothing more and introduces nobody else. */
  dormant: boolean;
}

export async function start(adminId: string, name: string, params: SimulationParams, seed?: string) {
  assertSane(params);
  // Resolved up front so an impossible selection is refused on the spot. It
  // used to surface as a run that appeared, sat there, and died a moment later
  // — the operator had to go and read the error off a failed row.
  await resolvePackages(params);

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
    ['Churn rate', p.churnRate],
    ['Sponsor concentration', p.sponsorConcentration],
  ] as const) {
    if (v < 0 || v > 1) throw badRequest(`${label} must be between 0 and 1`);
  }
  if (Number.isNaN(Date.parse(p.startDate))) throw badRequest('Give a valid start date');

  if (p.packageMode === 'SINGLE' && p.packageIds.length !== 1) {
    throw badRequest('Pick exactly one package to run on its own');
  }
  if (p.packageMode === 'MIX' && p.packageIds.length < 1) {
    throw badRequest('Pick at least one package for the mix');
  }
  if (p.packageSkew < 0.5 || p.packageSkew > 8) {
    throw badRequest('Tier bias must be between 0.5 and 8');
  }
  if (p.withdrawShareMin <= 0 || p.withdrawShareMax > 1 || p.withdrawShareMin > p.withdrawShareMax) {
    throw badRequest('The withdrawal share must be a band inside 0 to 100%');
  }
  if (p.growthRate < 1 || p.growthRate > 3) throw badRequest('Growth must be between 1.0x and 3.0x a month');
  if (p.declineRate <= 0 || p.declineRate > 1) throw badRequest('Decline must be between 0.01x and 1.0x a month');

  /**
   * A guard against a run nobody meant to ask for.
   *
   * Projected from the pattern itself rather than a flat multiple. Under GROWTH
   * the intake compounds, so a flat guess is wrong by orders of magnitude in
   * exactly the case that needs catching — twelve months at 1.25x is fourteen
   * times the first month's intake, not four.
   */
  let projected = p.initialMembers;
  for (let m = 0; m < p.months; m += 1) {
    projected += p.joinsPerMonth * PATTERN_MULTIPLIER[p.joinPattern](m, p);
  }
  projected = Math.round(projected * (1 + p.intakeVariance));
  /**
   * Five thousand, not twenty.
   *
   * The old ceiling sat above an estimate that overstated intake fourfold, so
   * in practice it allowed about five thousand — and that is the right number
   * on the measured throughput: sixteen hundred members over ten months takes
   * half an hour of real engine time, and this scales with members × trading
   * days. Now the estimate is honest the limit has to be stated honestly too,
   * or it silently became a four-times-longer run.
   */
  if (projected > 5_000) {
    throw badRequest(
      `Those parameters would create roughly ${projected.toLocaleString()} members, ` +
      'which would run for many hours. Reduce the intake, the growth rate or the number ' +
      'of months — this drives the real engine, so it is not free.',
    );
  }
}

/** How many members a set of parameters is expected to produce. Used by the guard and the form. */
export function projectMembers(p: SimulationParams) {
  let mid = p.initialMembers;
  for (let m = 0; m < p.months; m += 1) mid += p.joinsPerMonth * PATTERN_MULTIPLIER[p.joinPattern](m, p);
  return {
    low: Math.round(p.initialMembers + (mid - p.initialMembers) * (1 - p.intakeVariance)),
    mid: Math.round(mid),
    high: Math.round(p.initialMembers + (mid - p.initialMembers) * (1 + p.intakeVariance)),
  };
}

/**
 * The tiers a run may buy from, cheapest first.
 *
 * Ordering is load-bearing: `weightedPick` biases toward the front of the list,
 * so a list that is not sorted by price would skew toward whatever the database
 * happened to return first.
 */
async function resolvePackages(p: SimulationParams) {
  const select = { id: true, name: true, amount: true } as const;

  if (p.packageMode === 'RANGE') {
    const found = await prisma.packagePlan.findMany({
      where: {
        isActive: true,
        amount: { gte: toDb(money(p.minInvestment)), lte: toDb(money(p.maxInvestment)) },
      },
      orderBy: { amount: 'asc' },
      select,
    });
    if (!found.length) throw badRequest('No active package falls within that investment range');
    return found;
  }

  const ids = p.packageMode === 'SINGLE' ? p.packageIds.slice(0, 1) : p.packageIds;
  const found = await prisma.packagePlan.findMany({
    where: { isActive: true, id: { in: ids } },
    orderBy: { amount: 'asc' },
    select,
  });
  if (found.length !== ids.length) {
    // Naming the gap, because the alternative is a run that quietly models
    // something other than what was asked for.
    throw badRequest(
      found.length
        ? 'One of the chosen packages is no longer active — reselect it and start again'
        : 'The chosen package is no longer active',
    );
  }
  return found;
}

/** The active tiers, for the picker on the form. */
export const packages = () =>
  prisma.packagePlan.findMany({
    where: { isActive: true },
    orderBy: { amount: 'asc' },
    select: { id: true, name: true, amount: true, dailyRoiPercent: true, capPercent: true },
  });

async function execute(runId: string) {
  const started = Date.now();

  // Everything below runs with the simulation flag set, so no modelled member
  // is emailed, notified, or written to an activity trail.
  await runWithContext({ requestId: `sim-${runId}`, simulating: true, simulationRunId: runId }, async () => {
    const run = await prisma.simulationRun.findUniqueOrThrow({ where: { id: runId } });
    const params = run.params as unknown as SimulationParams;
    const rng = new Rng(run.seed);
    const cfg = await config();

    const tiers = await resolvePackages(params);

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

    /**
     * The baseline is taken before the founding cohort buys anything, so their
     * capital lands in month one rather than in no month at all.
     *
     * It used to be taken after them. The summary totals from the database and
     * so counted the founding deposits; the month rows totalled deltas from a
     * snapshot that already included them. The table disagreed with the summary
     * by the whole founding cohort — with the default fifty, more than a third
     * of a short run's intake — and `breakEvenMonth`, which reads the monthly
     * running total, was being measured against a different baseline again.
     */
    let before = await snapshot(runId);

    for (let i = 0; i < params.initialMembers; i += 1) {
      sequence += 1;
      members.push(await createMember(runId, sequence, rng, members, params, start));
    }
    await invest(members, tiers, rng, params, 0, members.length);

    // ── month by month ───────────────────────────────────────────────────
    for (let month = 0; month < params.months; month += 1) {
      const monthStart = addMonths(start, month);
      const monthEnd = addMonths(start, month + 1);

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
      const target = Math.round(params.joinsPerMonth * PATTERN_MULTIPLIER[params.joinPattern](month, params));
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
          const pkg = rng.weightedPick(tiers, params.packageSkew);
          await fund(member.id, Number(pkg.amount));
          await purchase(member.id, pkg.id).catch(() => undefined);
        }

        if (isTradingDay(day, cfg.tradingDays)) {
          await runDailyRoi(new Date(day));
        }

        // Reinvestment and withdrawals happen on ordinary days too, not in a
        // batch at month end.
        for (const m of members) {
          // Going quiet. A dormant member stops buying again and stops being
          // picked as a sponsor; what they hold keeps earning, and they still
          // take money out.
          if (!m.dormant && rng.chance(params.churnRate / 365)) m.dormant = true;

          if (!m.dormant && rng.chance(params.reinvestRate / 365)) {
            const pkg = rng.weightedPick(tiers, params.packageSkew);
            const price = money(pkg.amount.toString());

            const compounding =
              params.reinvestSource === 'BALANCE' ? true
              : params.reinvestSource === 'MIXED' ? rng.chance(0.5)
              : false;

            if (compounding) {
              /**
               * Paid out of earnings, moved the way a member moves it.
               *
               * Through the real transfer so the guarded debit applies: a
               * member who cannot cover the tier simply does not buy it, which
               * is the behaviour that makes compounding self-limiting. Funding
               * the wallet first would have booked new capital and hidden that
               * entirely.
               */
              const main = await prisma.walletAccount.findFirst({
                where: { userId: m.id, type: 'MAIN' },
                select: { balance: true },
              });
              if (money(main?.balance.toString() ?? '0').gte(price)) {
                const moved = await walletTransfer(m.id, 'MAIN', 'FUND', price.toString())
                  .then(() => true)
                  .catch(() => false);
                if (moved) await purchase(m.id, pkg.id).catch(() => undefined);
              }
            } else {
              await fund(m.id, Number(pkg.amount));
              await purchase(m.id, pkg.id).catch(() => undefined);
            }
          }

          if (!rng.chance(params.withdrawRate / 365)) continue;
          const wallet = await prisma.walletAccount.findFirst({
            where: { userId: m.id, type: 'MAIN' },
            select: { balance: true },
          });
          const available = money(wallet?.balance.toString() ?? '0');
          if (available.lt(cfg.withdrawMin)) continue;

          // A member rarely takes the lot — most leave some in.
          const share = rng.float(params.withdrawShareMin, params.withdrawShareMax);
          const wanted = available.mul(share);
          const amount = wanted.gt(cfg.withdrawMax) ? money(cfg.withdrawMax) : wanted;
          if (amount.lt(cfg.withdrawMin)) continue;

          const w = await requestWithdrawal(m.id, amount.toString(), SIMULATED_ADDRESS)
            .catch(() => null);
          if (w) withdrawn = withdrawn.add(money(w.amount.toString()));
        }
      }

      const after = await snapshot(runId);
      const result = diff(
        month,
        monthStart,
        // The founding cohort arrives in month one. It is not a period of its
        // own, and counting it nowhere left the column disagreeing with the
        // member total beside it.
        month === 0 ? joined + params.initialMembers : joined,
        members.length,
        before,
        after,
        withdrawn,
        cumulativeNet,
      );
      cumulativeNet = money(result.cumulativeNet);
      before = after;
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
  // A member who has gone quiet does not introduce anyone else.
  const available = existing.filter((m) => !m.dormant);
  if (available.length) {
    /**
     * Concentration drives both halves: how often an established recruiter is
     * preferred over a newcomer, and how hard the draw leans toward the members
     * who joined earliest. Turned up, introductions pile onto a few hubs near
     * the root; turned down, they spread to recent joiners and the tree grows
     * in chains. Hubs pay the direct bonus, chains pay the generation bonus.
     */
    const c = params.sponsorConcentration;
    const preferRecruiters = 0.4 + 0.5 * c;
    const recencyBias = 1 + 1.2 * c;

    const recruiters = available.filter((m) => m.directs > 0);
    const pool = recruiters.length && rng.chance(preferRecruiters) ? recruiters : available;

    // Bias toward earlier members, who have had longer to recruit.
    const idx = Math.floor(Math.pow(rng.next(), recencyBias) * pool.length);
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

  return { id: user.id, path: user.path, depth: user.depth, directs: 0, dormant: false };
}

/** Funds and buys for a slice of the member list. */
async function invest(
  members: Member[],
  tiers: { id: string; amount: Prisma.Decimal }[],
  rng: Rng,
  params: SimulationParams,
  from: number,
  to: number,
) {
  for (let i = from; i < to; i += 1) {
    // Weighted toward the cheaper tiers, which is where a real member base sits.
    const pkg = rng.weightedPick(tiers, params.packageSkew);
    await fund(members[i]!.id, Number(pkg.amount));
    await purchase(members[i]!.id, pkg.id).catch(() => undefined);
  }
}

let depositSeq = 0;

/**
 * Brings outside money in.
 *
 * Deliberately not through the deposit queue — that would need an operator to
 * confirm every one, and the question here is the compensation plan, not the
 * confirmation workflow. But it does post a real DEPOSIT ledger entry, and
 * that part is not cosmetic: it is the only record of money arriving from
 * outside, and capital in is measured from it.
 *
 * It used to write the balance with raw SQL and leave no trace, so intake was
 * inferred by summing investments instead. That silently counted a package
 * bought out of an existing balance as fresh capital — the platform booked
 * income for money it had never received, and for compounded purchases it was
 * money the platform already owed.
 */
async function fund(userId: string, amount: number) {
  depositSeq += 1;
  await post({
    userId,
    walletType: 'FUND',
    direction: 'CREDIT',
    category: 'DEPOSIT',
    amount: money(amount),
    reference: `SIMDEP-${simulationRunId() ?? 'x'}-${depositSeq}`,
    description: 'Modelled deposit',
  });
}

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

  const [credits, withdrawals, liability, capped] = await Promise.all([
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
    // Money from outside, which is what "taken in" has to mean. Compounded
    // purchases move a balance the platform already owed; they are not intake.
    capitalIn: byCategory.DEPOSIT ?? '0',
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

/**
 * What each tier took in and cost.
 *
 * `Investment.totalEarned` is the right source and the only honest one: the
 * cap engine increments it for daily returns *and* for the commissions its
 * holder earns, because both draw down the same ceiling. Summing ledger
 * credits instead would attribute a sponsor's bonus to no package at all.
 */
async function packageBreakdown(runId: string): Promise<PackageResult[]> {
  const where = { user: { simulationRunId: runId } };

  const [all, live, capped, holders, plans] = await Promise.all([
    prisma.investment.groupBy({
      by: ['packageId'], where,
      _sum: { amount: true, totalEarned: true }, _count: { _all: true },
    }),
    prisma.investment.groupBy({
      by: ['packageId'], where: { ...where, status: 'ACTIVE' },
      _sum: { capLimit: true, totalEarned: true },
    }),
    prisma.investment.groupBy({
      by: ['packageId'], where: { ...where, status: 'CAPPED' }, _count: { _all: true },
    }),
    // Distinct holders — a member who buys the same tier twice is one member.
    prisma.$queryRaw<{ packageId: string; members: bigint }[]>`
      SELECT i."packageId", COUNT(DISTINCT i."userId") AS members
        FROM investments i
        JOIN users u ON u.id = i."userId"
       WHERE u."simulationRunId" = ${runId}
       GROUP BY i."packageId"`,
    prisma.packagePlan.findMany({ select: { id: true, name: true, amount: true } }),
  ]);

  const plan = new Map(plans.map((x) => [x.id, x]));
  const liveBy = new Map(live.map((x) => [x.packageId, x]));
  const cappedBy = new Map(capped.map((x) => [x.packageId, x._count._all]));
  const holdersBy = new Map(holders.map((x) => [x.packageId, Number(x.members)]));

  return all
    .map((row) => {
      const p = plan.get(row.packageId);
      const invested = money(row._sum.amount?.toString() ?? '0');
      const paidOut = money(row._sum.totalEarned?.toString() ?? '0');

      const l = liveBy.get(row.packageId);
      const outstanding = money(l?._sum.capLimit?.toString() ?? '0')
        .sub(money(l?._sum.totalEarned?.toString() ?? '0'));

      const net = invested.sub(paidOut);

      return {
        packageId: row.packageId,
        name: p?.name ?? 'Removed package',
        amount: p?.amount.toString() ?? '0',
        members: holdersBy.get(row.packageId) ?? 0,
        investments: row._count._all,
        invested: invested.toString(),
        paidOut: paidOut.toString(),
        outstandingLiability: outstanding.toString(),
        capped: cappedBy.get(row.packageId) ?? 0,
        netPosition: net.toString(),
        netPositionWithLiability: net.sub(outstanding).toString(),
        payoutRatio: invested.gt(0)
          ? Math.round(paidOut.div(invested).toNumber() * 100) / 100
          : 0,
      };
    })
    .sort((a, b) => Number(a.amount) - Number(b.amount));
}

async function summarise(
  runId: string,
  monthly: MonthResult[],
  runtimeMs: number,
): Promise<SimulationSummary> {
  const final = await snapshot(runId);
  const where = { user: { simulationRunId: runId } };

  const [balances, withdrawals, members, byPackage] = await Promise.all([
    prisma.walletAccount.aggregate({ where, _sum: { balance: true } }),
    prisma.withdrawal.aggregate({ where, _sum: { amount: true } }),
    prisma.user.count({ where: { simulationRunId: runId } }),
    packageBreakdown(runId),
  ]);

  const STREAMS = [
    ['Daily returns', 'DAILY_ROI'],
    ['Direct sponsor bonus', 'DIRECT_BONUS'],
    ['Generation bonus', 'GENERATION_BONUS'],
    ['Rank rewards', 'RANK_BONUS'],
    ['Flyers Club', 'ROAMING_CLUB'],
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
    byPackage,
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
