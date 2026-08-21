import 'dotenv/config';
import { runDailyRoi, isTradingDay } from '../src/jobs/daily-roi.job.js';
import { prisma } from '../src/core/db.js';

const mon = new Date(Date.UTC(2026, 7, 17)); // Monday
const sat = new Date(Date.UTC(2026, 7, 22)); // Saturday

console.log('=== trading-day gate (FortuneX: Mon-Fri only) ===');
console.log(`  Mon 17 Aug: ${isTradingDay(mon) ? 'TRADING' : 'skipped'}`);
console.log(`  Sat 22 Aug: ${isTradingDay(sat) ? 'TRADING' : 'skipped (weekend)'}`);

console.log('\n=== weekend run ===');
console.log(' ', await runDailyRoi(sat));

console.log('\n=== trading-day run ===');
console.log(' ', await runDailyRoi(mon));

console.log('\n=== replay the SAME day (idempotency) ===');
const again = await runDailyRoi(mon);
console.log(`  processed=${again.processed}  <- 0 means the replay was correctly a no-op`);

console.log('\n=== generation bonus rows by level ===');
const gen = await prisma.commission.groupBy({
  by: ['level'],
  where: { kind: 'GENERATION' },
  _sum: { paidAmount: true },
  _count: { _all: true },
  orderBy: { level: 'asc' },
});
for (const g of gen) {
  console.log(`  L${String(g.level).padStart(2)}  rows=${g._count._all}  paid=${g._sum.paidAmount}`);
}

console.log('\n=== ROI accruals ===');
const acc = await prisma.roiAccrual.findMany({
  select: { accrualDate: true, baseAmount: true, ratePercent: true, paidAmount: true },
  orderBy: { createdAt: 'desc' }, take: 5,
});
for (const a of acc) {
  console.log(`  ${a.accrualDate.toISOString().slice(0,10)}  base=${a.baseAmount}  rate=${a.ratePercent}%  paid=${a.paidAmount}`);
}
await prisma.$disconnect();
