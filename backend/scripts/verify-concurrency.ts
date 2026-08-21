import 'dotenv/config';
import { prisma } from '../src/core/db.js';
import { post, ensureWallets } from '../src/core/ledger.js';
import { money } from '../src/core/money.js';

/**
 * The regression test for the defect that made the previous platform unusable:
 * 4 concurrent workers x 60 credits of 1.00 lost 171 of 240 credits (71%).
 * Here the same load must land exactly.
 */
const WORKERS = 8;
const PER_WORKER = 30;
const AMOUNT = 1;

const user = await prisma.user.create({
  data: { userCode: `CC${Date.now()}`.slice(0, 12), email: `cc${Date.now()}@fx.test`,
          passwordHash: 'x', firstName: 'Concurrency', status: 'ACTIVE' },
});
await ensureWallets(user.id);

const expected = WORKERS * PER_WORKER * AMOUNT;
console.log(`=== ${WORKERS} workers x ${PER_WORKER} credits of ${AMOUNT}.00 — expecting ${expected}.00 ===`);

const t0 = Date.now();
await Promise.all(
  Array.from({ length: WORKERS }, (_, w) =>
    (async () => {
      for (let i = 0; i < PER_WORKER; i++) {
        await post({
          userId: user.id, walletType: 'MAIN', direction: 'CREDIT', category: 'ADJUSTMENT',
          amount: money(AMOUNT), reference: `CC-${user.id}-${w}-${i}`,
          description: 'concurrency probe',
        });
      }
    })(),
  ),
);
const ms = Date.now() - t0;

const wallet = await prisma.walletAccount.findFirst({ where: { userId: user.id, type: 'MAIN' } });
const entries = await prisma.ledgerEntry.count({ where: { userId: user.id } });
const actual = Number(wallet!.balance);

console.log(`  ledger entries : ${entries}`);
console.log(`  wallet balance : ${actual}`);
console.log(`  expected       : ${expected}`);
console.log(`  lost           : ${expected - actual}`);
console.log(`  elapsed        : ${ms}ms`);
console.log(actual === expected ? '\n  PASS — no credits lost under concurrency' : '\n  FAIL — credits were lost');

console.log('\n=== replay protection: reusing an existing reference ===');
try {
  await post({ userId: user.id, walletType: 'MAIN', direction: 'CREDIT', category: 'ADJUSTMENT',
               amount: money(999), reference: `CC-${user.id}-0-0`, description: 'replay' });
  console.log('  FAIL — duplicate reference was accepted');
} catch {
  const after = await prisma.walletAccount.findFirst({ where: { userId: user.id, type: 'MAIN' } });
  console.log(`  rejected; balance unchanged at ${after!.balance}`);
}

console.log('\n=== overdraw protection: debit larger than balance ===');
try {
  await post({ userId: user.id, walletType: 'MAIN', direction: 'DEBIT', category: 'WITHDRAWAL',
               amount: money(expected + 1), reference: `CC-OD-${user.id}`, description: 'overdraw' });
  console.log('  FAIL — overdraw was allowed');
} catch (e) {
  console.log(`  rejected: ${(e as Error).message}`);
}

await prisma.user.delete({ where: { id: user.id } });
await prisma.$disconnect();
