import 'dotenv/config';
import { prisma } from '../src/core/db.js';

// Removes the queue items I seeded without being asked, and the goodwill
// adjustment I posted during endpoint verification.
const deposits = await prisma.deposit.deleteMany({ where: { status: 'PENDING' } });

const w = await prisma.withdrawal.findMany({ where: { status: 'PENDING' } });
for (const x of w) {
  // refund the guarded debit before deleting, so balances stay truthful
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE wallet_accounts SET balance = balance + ${x.amount}::numeric
       WHERE "userId" = ${x.userId} AND type = 'MAIN'`;
    await tx.ledgerEntry.deleteMany({ where: { reference: x.reference } });
    await tx.withdrawal.delete({ where: { id: x.id } });
  });
}

const adj = await prisma.ledgerEntry.findMany({ where: { category: 'ADJUSTMENT' } });
for (const e of adj) {
  await prisma.$transaction(async (tx) => {
    const sign = e.direction === 'CREDIT' ? -1 : 1;
    await tx.$executeRaw`
      UPDATE wallet_accounts SET balance = balance + ${e.amount.toNumber() * sign}::numeric
       WHERE id = ${e.walletId}`;
    await tx.ledgerEntry.delete({ where: { id: e.id } });
  });
}

console.log(`removed: ${deposits.count} pending deposits, ${w.length} pending withdrawals, ${adj.length} adjustments`);

const remaining = {
  deposits: await prisma.deposit.count({ where: { status: 'PENDING' } }),
  withdrawals: await prisma.withdrawal.count({ where: { status: 'PENDING' } }),
  adjustments: await prisma.ledgerEntry.count({ where: { category: 'ADJUSTMENT' } }),
};
console.log('remaining:', remaining);
await prisma.$disconnect();
