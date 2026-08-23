import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as simulation from '../src/modules/admin/simulation/simulation.service.js';
import { Rng } from '../src/modules/admin/simulation/random.js';
import { prisma, resetData, seedPlan, makeUser } from './helpers.js';

async function makeAdmin() {
  const role = await prisma.adminRole.findFirstOrThrow({ where: { slug: 'super-admin' } });
  return prisma.adminUser.create({
    data: {
      email: `op-${Date.now()}-${Math.round(performance.now() * 1000)}@test.local`,
      passwordHash: 'x', name: 'Operator', roleId: role.id,
    },
  });
}

/** Small enough to finish quickly, large enough to exercise the tree. */
const SMALL: simulation.SimulationParams = {
  ...simulation.DEFAULT_PARAMS,
  // No swing, so the member count is exactly predictable. Variance has its own
  // test; asserting on a tagged count should not be at the mercy of the dice.
  intakeVariance: 0,
  months: 1,
  initialMembers: 4,
  joinsPerMonth: 3,
  joinPattern: 'STEADY',
  minInvestment: 110,
  maxInvestment: 530,
  startDate: '2026-01-01',
};

/** Polls until the detached run settles. */
async function settle(id: string, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const run = await prisma.simulationRun.findUniqueOrThrow({ where: { id } });
    if (run.status === 'COMPLETE' || run.status === 'FAILED') return run;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('simulation did not finish in time');
}

beforeAll(seedPlan);
beforeEach(resetData);

describe('repeatability', () => {
  it('the same seed gives the same sequence', () => {
    const a = new Rng('abc');
    const b = new Rng('abc');
    const c = new Rng('different');

    const draw = (r: Rng) => Array.from({ length: 8 }, () => r.next());
    expect(draw(a)).toEqual(draw(b));
    expect(draw(new Rng('abc'))).not.toEqual(draw(c));
  });

  it('weights picks toward the start of the list', () => {
    // Most members buy near the bottom of the ladder. A uniform pick would
    // model a population that does not exist, and flatter the projection.
    const rng = new Rng('weights');
    const tiers = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const picks = Array.from({ length: 2000 }, () => rng.weightedPick(tiers));
    const mean = picks.reduce((a, b) => a + b, 0) / picks.length;
    expect(mean).toBeLessThan(4);
  });

  it('keeps a normal draw inside its bounds', () => {
    const rng = new Rng('normal');
    for (let i = 0; i < 500; i += 1) {
      const v = rng.normal(3, 1.5, 1, 40);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(40);
    }
  });
});

describe('parameters', () => {
  it('refuses a range no package falls inside, before starting anything', async () => {
    const admin = await makeAdmin();
    await expect(
      simulation.start(admin.id, 'Impossible', {
        ...SMALL, minInvestment: 999_000, maxInvestment: 999_999,
      }),
    ).rejects.toThrow(/No active package falls/);

    // And nothing was left behind for the operator to go and read.
    expect(await prisma.simulationRun.count({ where: { name: 'Impossible' } })).toBe(0);
  });

  it('refuses a run that would create an absurd population', async () => {
    const admin = await makeAdmin();
    await expect(
      simulation.start(admin.id, 'Runaway', { ...SMALL, months: 36, joinsPerMonth: 500 }),
    ).rejects.toThrow(/would create roughly/);
  });

  it('refuses a rate outside 0 to 1', async () => {
    const admin = await makeAdmin();
    await expect(
      simulation.start(admin.id, 'Bad rate', { ...SMALL, withdrawRate: 5 }),
    ).rejects.toThrow(/between 0 and 1/);
  });
});

describe('choosing packages', () => {
  const tier = (name: string) =>
    prisma.packagePlan.findFirstOrThrow({ where: { name }, select: { id: true, amount: true } });

  it('runs a single tier and nothing else', async () => {
    const admin = await makeAdmin();
    const only = await tier('Test Plan 3');

    const run = await simulation.start(admin.id, 'One tier', {
      ...SMALL, packageMode: 'SINGLE', packageIds: [only.id],
    });
    const settled = await settle(run.id);
    expect(settled.status).toBe('COMPLETE');

    const bought = await prisma.investment.groupBy({
      by: ['packageId'],
      where: { user: { simulationRunId: run.id } },
    });
    expect(bought.map((b) => b.packageId)).toEqual([only.id]);

    // And the breakdown reports that one tier, costed on its own.
    const summary = settled.summary as unknown as simulation.SimulationSummary;
    expect(summary.byPackage).toHaveLength(1);
    expect(summary.byPackage[0]!.name).toBe('Test Plan 3');
    expect(Number(summary.byPackage[0]!.invested)).toBe(Number(summary.capitalIn));
  });

  it('keeps a mix to exactly the tiers chosen', async () => {
    const admin = await makeAdmin();
    const [a, b] = [await tier('Test Plan 1'), await tier('Test Plan 4')];

    /**
     * Even bias and a fixed seed, deliberately.
     *
     * The default skew pushes almost every member onto the cheapest tier, so on
     * a small run the second tier may go unbought — which made asserting that
     * both appear a coin toss rather than a test. The seed makes the draw
     * reproducible; the even bias makes both tiers likely in a handful of
     * members. The guarantee being checked is the one that must never break:
     * nothing outside the chosen set is ever bought.
     */
    const run = await simulation.start(admin.id, 'Two tiers', {
      ...SMALL, packageMode: 'MIX', packageIds: [a.id, b.id],
      packageSkew: 1, initialMembers: 10, joinsPerMonth: 10,
    }, 'mix-seed');
    const settled = await settle(run.id);
    expect(settled.status).toBe('COMPLETE');

    const bought = new Set((await prisma.investment.groupBy({
      by: ['packageId'],
      where: { user: { simulationRunId: run.id } },
    })).map((x) => x.packageId));

    expect(bought.size).toBeGreaterThan(0);
    for (const id of bought) expect([a.id, b.id]).toContain(id);
    // With this seed both tiers are drawn, so a mix genuinely mixes.
    expect(bought).toEqual(new Set([a.id, b.id]));
  });

  it('insists on exactly one package when running a single tier', async () => {
    const admin = await makeAdmin();
    const [a, b] = [await tier('Test Plan 1'), await tier('Test Plan 2')];
    await expect(
      simulation.start(admin.id, 'Ambiguous', {
        ...SMALL, packageMode: 'SINGLE', packageIds: [a.id, b.id],
      }),
    ).rejects.toThrow(/exactly one package/);
  });

  it('refuses a package that is no longer on sale', async () => {
    const admin = await makeAdmin();
    const retired = await tier('Test Plan 5');
    await prisma.packagePlan.update({ where: { id: retired.id }, data: { isActive: false } });

    await expect(
      simulation.start(admin.id, 'Retired', {
        ...SMALL, packageMode: 'SINGLE', packageIds: [retired.id],
      }),
    ).rejects.toThrow(/no longer active/);
  });

  it('accounts for every tier it sold — the breakdown adds up to the total', async () => {
    const admin = await makeAdmin();
    const run = await simulation.start(admin.id, 'Breakdown', SMALL);
    const settled = await settle(run.id);

    const summary = settled.summary as unknown as simulation.SimulationSummary;
    expect(summary.byPackage.length).toBeGreaterThan(0);

    const sum = (pick: (x: simulation.PackageResult) => string) =>
      summary.byPackage.reduce((a, x) => a + Number(pick(x)), 0);

    // Everything paid to members draws down some package's ceiling, so the
    // per-tier costs must account for the whole payout and not merely most of it.
    expect(sum((x) => x.paidOut)).toBeCloseTo(Number(summary.totalPaidOut), 2);
    // Ticket value is never less than the cash that came in — the gap, when
    // there is one, is what members compounded out of their own balances.
    expect(sum((x) => x.invested)).toBeGreaterThanOrEqual(Number(summary.capitalIn) - 0.01);
    expect(sum((x) => x.outstandingLiability)).toBeCloseTo(Number(summary.outstandingLiability), 2);

    // Cheapest first, so the table reads as a ladder.
    const prices = summary.byPackage.map((x) => Number(x.amount));
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
  });
});

describe('behaviour settings', () => {
  it('counts new money as intake and compounded earnings as nothing of the kind', async () => {
    const admin = await makeAdmin();
    const base = { ...SMALL, months: 2, reinvestRate: 1, withdrawRate: 0 };

    // Same seed, so the only difference between these two runs is where a
    // repeat purchase is paid from.
    const fresh = await settle((await simulation.start(
      admin.id, 'New money', { ...base, reinvestSource: 'NEW_MONEY' }, 'src')).id);
    const compounded = await settle((await simulation.start(
      admin.id, 'Compounded', { ...base, reinvestSource: 'BALANCE' }, 'src')).id);

    const s1 = fresh.summary as unknown as simulation.SimulationSummary;
    const s2 = compounded.summary as unknown as simulation.SimulationSummary;

    const ticket = (s: simulation.SimulationSummary) =>
      s.byPackage.reduce((a, x) => a + Number(x.invested), 0);

    // Both bought packages beyond the opening ones...
    expect(ticket(s1)).toBeGreaterThan(0);

    /**
     * ...but only fresh money is intake. Under NEW_MONEY every repeat purchase
     * arrives as capital, so ticket value and capital in move together; under
     * BALANCE the purchase is paid from a balance the platform already owed,
     * so capital in must not have risen with it.
     */
    expect(Number(s1.capitalIn)).toBeCloseTo(ticket(s1), 2);
    expect(Number(s2.capitalIn)).toBeLessThanOrEqual(ticket(s2) + 0.01);
    expect(Number(s2.capitalIn)).toBeLessThan(Number(s1.capitalIn));
  });

  it('builds hubs when recruiting concentrates, and chains when it does not', async () => {
    const admin = await makeAdmin();
    const shape = { ...SMALL, months: 1, initialMembers: 3, joinsPerMonth: 30 };

    const spread = await settle((await simulation.start(
      admin.id, 'Spread', { ...shape, sponsorConcentration: 0 }, 'tree')).id);
    const hubs = await settle((await simulation.start(
      admin.id, 'Hubs', { ...shape, sponsorConcentration: 1 }, 'tree')).id);

    const shapeOf = async (id: string) => {
      const agg = await prisma.user.aggregate({
        where: { simulationRunId: id },
        _max: { depth: true, directCount: true },
      });
      return { depth: agg._max.depth ?? 0, biggestDownline: agg._max.directCount ?? 0 };
    };

    const a = await shapeOf(spread.id);
    const b = await shapeOf(hubs.id);

    // Concentrated: introductions pile onto a few members near the root.
    expect(b.biggestDownline).toBeGreaterThan(a.biggestDownline);
    // Spread out: the tree grows in chains, so the generation walk goes further.
    expect(a.depth).toBeGreaterThan(b.depth);
  });
});

describe('a run', () => {
  it('creates members tagged with the run, and nothing untagged', async () => {
    const admin = await makeAdmin();
    const real = await makeUser();

    const run = await simulation.start(admin.id, 'Tagged', SMALL);
    await settle(run.id);

    const modelled = await prisma.user.count({ where: { simulationRunId: run.id } });
    expect(modelled).toBe(SMALL.initialMembers + SMALL.joinsPerMonth);

    // The real member must be untouched and still untagged.
    const stillReal = await prisma.user.findUniqueOrThrow({ where: { id: real.id } });
    expect(stillReal.simulationRunId).toBeNull();
  });

  it('drives the real engine — accruals and commissions actually exist', async () => {
    const admin = await makeAdmin();
    const run = await simulation.start(admin.id, 'Engine', SMALL);
    await settle(run.id);

    const [accruals, ledger] = await Promise.all([
      prisma.roiAccrual.count({ where: { user: { simulationRunId: run.id } } }),
      prisma.ledgerEntry.count({ where: { user: { simulationRunId: run.id } } }),
    ]);
    expect(accruals).toBeGreaterThan(0);
    expect(ledger).toBeGreaterThan(0);
  });

  it('reports a month series and a summary that reconcile', async () => {
    const admin = await makeAdmin();
    const run = await simulation.start(admin.id, 'Reconcile', SMALL);
    const settled = await settle(run.id);

    const summary = settled.summary as unknown as simulation.SimulationSummary;
    const monthly = settled.monthly as unknown as simulation.MonthResult[];

    expect(monthly).toHaveLength(SMALL.months);
    expect(Number(summary.capitalIn)).toBeGreaterThan(0);

    /**
     * Exactly, not approximately.
     *
     * This assertion used to allow the summary to exceed the months, which is
     * how the founding cohort came to be counted in the summary and in no month
     * at all — the table understated intake by the whole opening cohort and
     * nothing caught it. The two panels are read side by side; if they can
     * disagree, the tool is worse than useless, because it is confidently wrong.
     */
    const sum = (pick: (m: simulation.MonthResult) => string) =>
      monthly.reduce((a, m) => a + Number(pick(m)), 0);

    expect(sum((m) => m.capitalIn)).toBeCloseTo(Number(summary.capitalIn), 2);
    expect(sum((m) => m.totalPaidOut)).toBeCloseTo(Number(summary.totalPaidOut), 2);
    expect(sum((m) => m.feesCollected)).toBeCloseTo(Number(summary.feesCollected), 2);
    expect(sum((m) => m.taxWithheld)).toBeCloseTo(Number(summary.taxWithheld), 2);

    // The running total is the same number the summary reports, so break-even
    // is read off the same baseline as the headline position.
    const last = monthly[monthly.length - 1]!;
    expect(Number(last.cumulativeNet)).toBeCloseTo(Number(summary.netPosition), 2);

    // And every member is accounted for in the intake column.
    expect(sum((m) => String(m.joined))).toBe(summary.members);
  });

  it('sends no notifications, emails or activity for modelled members', async () => {
    const admin = await makeAdmin();
    const run = await simulation.start(admin.id, 'Quiet', SMALL);
    await settle(run.id);

    const ids = (await prisma.user.findMany({
      where: { simulationRunId: run.id }, select: { id: true },
    })).map((u) => u.id);

    const [notified, activity, emails] = await Promise.all([
      prisma.notificationRecipient.count({ where: { actorType: 'USER', actorId: { in: ids } } }),
      prisma.activityLog.count({ where: { userId: { in: ids } } }),
      prisma.emailLog.count(),
    ]);

    expect(notified).toBe(0);
    expect(activity).toBe(0);
    expect(emails).toBe(0);
  });

  it('does not raise operator alerts either', async () => {
    const admin = await makeAdmin();
    const run = await simulation.start(admin.id, 'Quiet ops', SMALL);
    await settle(run.id);

    const alerts = await prisma.notificationRecipient.count({ where: { actorType: 'ADMIN' } });
    expect(alerts).toBe(0);
  });
});

describe('erasing', () => {
  it('removes every trace, and says how many', async () => {
    const admin = await makeAdmin();
    const run = await simulation.start(admin.id, 'Erasable', SMALL);
    await settle(run.id);

    const before = await prisma.ledgerEntry.count({ where: { user: { simulationRunId: run.id } } });
    expect(before).toBeGreaterThan(0);

    const result = await simulation.erase(admin.id, run.id);
    expect(result.erased).toBe(SMALL.initialMembers + SMALL.joinsPerMonth);

    for (const [label, count] of [
      ['users', prisma.user.count({ where: { simulationRunId: run.id } })],
      ['ledger', prisma.ledgerEntry.count({ where: { user: { simulationRunId: run.id } } })],
      ['investments', prisma.investment.count({ where: { user: { simulationRunId: run.id } } })],
      ['commissions', prisma.commission.count({ where: { user: { simulationRunId: run.id } } })],
      ['accruals', prisma.roiAccrual.count({ where: { user: { simulationRunId: run.id } } })],
    ] as const) {
      expect(await count, `${label} should be gone`).toBe(0);
    }
  });

  it('leaves real members and their money completely alone', async () => {
    const admin = await makeAdmin();
    const real = await makeUser({ funded: 1100 });
    const plan = await prisma.packagePlan.findFirstOrThrow({ where: { amount: '1100' } });
    const { purchase } = await import('../src/modules/investment/investment.service.js');
    await purchase(real.id, plan.id);

    const ledgerBefore = await prisma.ledgerEntry.count({ where: { userId: real.id } });
    expect(ledgerBefore).toBeGreaterThan(0);

    const run = await simulation.start(admin.id, 'Coexist', SMALL);
    await settle(run.id);
    await simulation.erase(admin.id, run.id);

    expect(await prisma.user.count({ where: { id: real.id } })).toBe(1);
    expect(await prisma.ledgerEntry.count({ where: { userId: real.id } })).toBe(ledgerBefore);
    expect(await prisma.investment.count({ where: { userId: real.id } })).toBe(1);
  });

  it('keeps the run and its results for reference', async () => {
    const admin = await makeAdmin();
    const run = await simulation.start(admin.id, 'Kept', SMALL);
    await settle(run.id);
    await simulation.erase(admin.id, run.id);

    const after = await prisma.simulationRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(after.status).toBe('ERASED');
    expect(after.summary).not.toBeNull();
    expect(after.erasedAt).not.toBeNull();
  });

  it('refuses to erase a run that is still going', async () => {
    const admin = await makeAdmin();

    /**
     * The row is put into RUNNING directly rather than racing a live one.
     *
     * Catching a real run mid-flight depends on it being slower than the next
     * line, which is a coin toss — and a test that sometimes passes tests
     * nothing. What matters is that the guard reads the status.
     */
    const run = await prisma.simulationRun.create({
      data: {
        name: 'In flight',
        params: SMALL as unknown as object,
        seed: 'inflight',
        status: 'RUNNING',
        startedAt: new Date(),
        createdBy: admin.id,
      },
    });

    await expect(simulation.erase(admin.id, run.id)).rejects.toThrow(/still going/);

    // And it becomes erasable the moment it is not running.
    await prisma.simulationRun.update({ where: { id: run.id }, data: { status: 'COMPLETE' } });
    await expect(simulation.erase(admin.id, run.id)).resolves.toMatchObject({ erased: 0 });
  });

  it('is safe to call twice', async () => {
    const admin = await makeAdmin();
    const run = await simulation.start(admin.id, 'Twice', SMALL);
    await settle(run.id);

    await simulation.erase(admin.id, run.id);
    const second = await simulation.erase(admin.id, run.id);
    expect(second.erased).toBe(0);
  });

  it('reports the footprint so nobody forgets modelled data is present', async () => {
    const admin = await makeAdmin();
    expect((await simulation.footprint()).clean).toBe(true);

    const run = await simulation.start(admin.id, 'Footprint', SMALL);
    await settle(run.id);

    const dirty = await simulation.footprint();
    expect(dirty.clean).toBe(false);
    expect(dirty.members).toBeGreaterThan(0);

    await simulation.erase(admin.id, run.id);
    expect((await simulation.footprint()).clean).toBe(true);
  });
});
