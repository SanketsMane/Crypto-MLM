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
  it('refuses a range no package falls inside', async () => {
    const admin = await makeAdmin();
    const run = await simulation.start(admin.id, 'Impossible', {
      ...SMALL, minInvestment: 999_000, maxInvestment: 999_999,
    });
    const settled = await settle(run.id);
    expect(settled.status).toBe('FAILED');
    expect(settled.error).toMatch(/No active packages/);
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

    // Every month's capital must add up to the total.
    const summed = monthly.reduce((a, m) => a + Number(m.capitalIn), 0);
    // The founding cohort invests before month one, so the total is at least
    // the sum of the months.
    expect(Number(summary.capitalIn)).toBeGreaterThanOrEqual(summed - 0.01);
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
