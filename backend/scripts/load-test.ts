/**
 * Load test.
 *
 * The concurrency tests prove the ledger is *correct* under contention. They
 * say nothing about whether the nightly job finishes before members wake up,
 * which is a different question and the one that decides whether this platform
 * can carry ten thousand members.
 *
 * Four things get measured, because these are the four that scale badly:
 *
 *   1. ROI accrual throughput — a serial loop, one transaction per investment,
 *      each doing a thirty-level commission walk. This is the nightly job.
 *   2. Commission walk cost by depth — the walk is one query on the
 *      materialised path, so depth should cost nothing. That claim is worth
 *      testing rather than repeating.
 *   3. Ledger contention — concurrent debits on one wallet, checking that the
 *      guarded update still lets exactly the affordable number through.
 *   4. Read latency on the endpoints a member actually loads.
 *
 * Runs against the TEST database and cleans up after itself. Never point it at
 * a database with real members in it.
 *
 *   npx dotenv -e .env.test -- npx tsx scripts/load-test.ts --members 5000
 */
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { prisma } from '../src/core/db.js';
import { runDailyRoi } from '../src/jobs/daily-roi.job.js';
import { purchase } from '../src/modules/investment/investment.service.js';
import { getUpline } from '../src/core/tree.js';
import { transferBetweenWallets } from '../src/core/ledger.js';
import { money } from '../src/core/money.js';

const arg = (name: string, fallback: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : fallback;
};

const MEMBERS = arg('members', 5_000);
const DEPTH = arg('depth', 30);
const CONCURRENCY = arg('concurrency', 50);
const TAG = `load-${Date.now()}`;

const ms = (n: number) => `${n.toFixed(0)}ms`;
const secs = (n: number) => `${(n / 1000).toFixed(1)}s`;
const rate = (count: number, elapsed: number) => (count / (elapsed / 1000));

async function time<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const t = performance.now();
  const out = await fn();
  return [out, performance.now() - t];
}

/** p50/p95/p99 from a sample, which is what latency actually needs. */
function percentiles(samples: number[]) {
  const s = [...samples].sort((a, b) => a - b);
  const at = (p: number) => s[Math.min(s.length - 1, Math.floor(s.length * p))]!;
  return { p50: at(0.5), p95: at(0.95), p99: at(0.99), max: s.at(-1)! };
}

// ── seeding ──────────────────────────────────────────────────────────────────

interface Seeded { ids: string[]; deepest: string; packageId: string }

/**
 * A branching tree, built with bulk inserts.
 *
 * Deliberately not through the signup path: this is measuring the read and
 * payout hot paths, and spending twenty minutes creating members through HTTP
 * would measure the wrong thing.
 */
async function seed(): Promise<Seeded> {
  const pkg = await prisma.packagePlan.findFirstOrThrow({
    where: { isActive: true }, orderBy: { amount: 'asc' },
  });

  const users: { id: string; path: string; depth: number; sponsorId: string | null }[] = [];
  const BRANCH = 4;

  for (let i = 0; i < MEMBERS; i += 1) {
    const id = randomUUID();
    // A chain for the first DEPTH members, so the deep-walk measurement has
    // somewhere genuinely deep to stand; a branching tree for the rest.
    const parent = i === 0 ? null
      : i < DEPTH ? users[i - 1]!
      : users[Math.floor((i - DEPTH) / BRANCH)]!;

    users.push({
      id,
      sponsorId: parent?.id ?? null,
      path: parent ? (parent.path ? `${parent.path}.${parent.id}` : parent.id) : '',
      depth: parent ? parent.depth + 1 : 0,
    });
  }

  const CHUNK = 1_000;
  for (let i = 0; i < users.length; i += CHUNK) {
    const slice = users.slice(i, i + CHUNK);
    await prisma.user.createMany({
      data: slice.map((u, n) => ({
        id: u.id,
        userCode: `LT${String(i + n).padStart(7, '0')}`,
        email: `${TAG}-${i + n}@load.invalid`,
        passwordHash: 'x',
        firstName: `Load ${i + n}`,
        lastName: TAG,
        status: 'ACTIVE' as const,
        sponsorId: u.sponsorId,
        path: u.path,
        depth: u.depth,
      })),
    });
    await prisma.walletAccount.createMany({
      data: slice.flatMap((u) =>
        (['MAIN', 'FUND', 'DIGITAL'] as const).map((type) => ({ userId: u.id, type }))),
    });
    await prisma.teamVolume.createMany({ data: slice.map((u) => ({ userId: u.id })) });

    const amount = pkg.amount.toString();
    await prisma.investment.createMany({
      data: slice.map((u) => ({
        userId: u.id,
        packageId: pkg.id,
        amount,
        dailyRoiPercent: pkg.dailyRoiPercent.toString(),
        // A high ceiling, so the cap does not short-circuit the walk and make
        // the job look faster than it is.
        capLimit: money(amount).mul(250).toString(),
        status: 'ACTIVE' as const,
      })),
    });
    process.stdout.write(`\r  seeding… ${Math.min(i + CHUNK, users.length)}/${users.length}`);
  }
  process.stdout.write('\n');

  return { ids: users.map((u) => u.id), deepest: users[DEPTH - 1]!.id, packageId: pkg.id };
}

async function cleanup() {
  const ids = (await prisma.user.findMany({
    where: { lastName: TAG }, select: { id: true },
  })).map((u) => u.id);
  if (!ids.length) return 0;

  // Everything else cascades from the member.
  for (let i = 0; i < ids.length; i += 1_000) {
    await prisma.user.deleteMany({ where: { id: { in: ids.slice(i, i + 1_000) } } });
  }
  return ids.length;
}

// ── the measurements ─────────────────────────────────────────────────────────

async function main() {
  console.log(`\nFortuneX load test — ${MEMBERS.toLocaleString()} members, chain depth ${DEPTH}\n`);

  const [seeded, seedMs] = await time(seed);
  console.log(`  seeded in ${secs(seedMs)} (${rate(MEMBERS, seedMs).toFixed(0)} members/sec)\n`);

  // ── 1. the nightly job ─────────────────────────────────────────────────
  // A Monday, so it is a trading day whatever the configured schedule.
  const day = new Date('2026-08-17T00:00:00.000Z');
  const [roi, roiMs] = await time(() => runDailyRoi(day));

  const perInvestment = roiMs / Math.max(roi.processed, 1);
  console.log('  ── nightly ROI accrual ──────────────────────────────────');
  console.log(`  processed              ${roi.processed.toLocaleString()} investments`);
  console.log(`  paid                   $${Number(roi.paid).toLocaleString()}`);
  console.log(`  generation payouts     ${roi.generationPayouts.toLocaleString()}`);
  console.log(`  elapsed                ${secs(roiMs)}`);
  console.log(`  throughput             ${rate(roi.processed, roiMs).toFixed(0)} investments/sec`);
  console.log(`  per investment         ${perInvestment.toFixed(1)}ms`);
  console.log('\n  projected nightly run:');
  for (const n of [10_000, 50_000, 100_000]) {
    console.log(`    ${n.toLocaleString().padStart(8)} investments  →  ${secs(n * perInvestment)}`);
  }

  // ── 2. does depth cost anything? ───────────────────────────────────────
  const shallow: number[] = [];
  const deep: number[] = [];
  for (let i = 0; i < 30; i += 1) {
    const [, a] = await time(() => getUpline(seeded.ids[1]!, 30));
    const [, b] = await time(() => getUpline(seeded.deepest, 30));
    shallow.push(a); deep.push(b);
  }
  const up = await getUpline(seeded.deepest, 30);
  console.log('\n  ── commission walk ──────────────────────────────────────');
  console.log(`  ancestors found at depth ${DEPTH}   ${up.length}`);
  console.log(`  walk at depth 1        ${ms(percentiles(shallow).p50)} p50`);
  console.log(`  walk at depth ${String(DEPTH).padEnd(2)}       ${ms(percentiles(deep).p50)} p50`);
  console.log(`  (one query on the materialised path — depth should be flat)`);

  // ── 3. ledger contention ───────────────────────────────────────────────
  const victim = seeded.ids[0]!;
  await prisma.$executeRaw`
    UPDATE wallet_accounts SET balance = 100::numeric
     WHERE "userId" = ${victim} AND type = 'MAIN'`;

  // 100 concurrent attempts to move 10 from a balance of 100. Exactly ten
  // must succeed; anything more is money invented under contention.
  const attempts = await Promise.allSettled(
    Array.from({ length: 100 }, (_, i) =>
      transferBetweenWallets({
        userId: victim, from: 'MAIN', to: 'FUND',
        amount: money(10), reference: `LOAD-${TAG}-${i}`,
        description: 'contention probe',
      })),
  );
  const won = attempts.filter((a) => a.status === 'fulfilled').length;
  const left = await prisma.walletAccount.findFirstOrThrow({
    where: { userId: victim, type: 'MAIN' }, select: { balance: true },
  });
  console.log('\n  ── ledger under contention ──────────────────────────────');
  console.log(`  concurrent debits      100 x $10 against a $100 balance`);
  console.log(`  succeeded              ${won}  ${won === 10 ? '(exactly right)' : '(WRONG — expected 10)'}`);
  console.log(`  balance left           $${left.balance.toString()}  ${Number(left.balance) === 0 ? '(exactly right)' : '(WRONG — expected 0)'}`);

  // ── 4. read latency on the hot paths ───────────────────────────────────
  const reader = seeded.ids[Math.floor(MEMBERS / 2)]!;
  const samples: Record<string, number[]> = { upline: [], downline: [], passbook: [], balances: [] };
  const rounds = Math.max(20, CONCURRENCY);

  for (let i = 0; i < rounds; i += 1) {
    samples.upline!.push((await time(() => getUpline(reader, 30)))[1]);
    samples.downline!.push((await time(() =>
      prisma.user.count({ where: { path: { startsWith: reader } } })))[1]);
    samples.passbook!.push((await time(() =>
      prisma.ledgerEntry.findMany({ where: { userId: reader }, take: 50, orderBy: { createdAt: 'desc' } })))[1]);
    samples.balances!.push((await time(() =>
      prisma.walletAccount.findMany({ where: { userId: reader } })))[1]);
  }

  console.log('\n  ── read latency ─────────────────────────────────────────');
  console.log('  query                    p50      p95      p99      max');
  for (const [name, s] of Object.entries(samples)) {
    const p = percentiles(s);
    console.log(`  ${name.padEnd(22)} ${ms(p.p50).padStart(7)}  ${ms(p.p95).padStart(7)}  ${ms(p.p99).padStart(7)}  ${ms(p.max).padStart(7)}`);
  }

  // ── 5. concurrent purchases, which move money and walk the tree ────────
  const buyers = seeded.ids.slice(MEMBERS - CONCURRENCY);
  const price = Number((await prisma.packagePlan.findUniqueOrThrow({ where: { id: seeded.packageId } })).amount);
  await prisma.$executeRaw`
    UPDATE wallet_accounts SET balance = ${price}::numeric
     WHERE "userId" = ANY(${buyers}::text[]) AND type = 'FUND'`;

  const [results, buyMs] = await time(() =>
    Promise.allSettled(buyers.map((id) => purchase(id, seeded.packageId))));
  const ok = results.filter((r) => r.status === 'fulfilled').length;

  console.log('\n  ── concurrent purchases ─────────────────────────────────');
  console.log(`  ${CONCURRENCY} at once           ${ok} succeeded, ${CONCURRENCY - ok} failed`);
  console.log(`  elapsed                ${secs(buyMs)}  (${rate(ok, buyMs).toFixed(1)}/sec)`);

  const removed = await cleanup();
  console.log(`\n  cleaned up ${removed.toLocaleString()} members\n`);
}

main()
  .catch(async (err: unknown) => {
    console.error('\nload test failed:', err);
    await cleanup().catch(() => undefined);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
