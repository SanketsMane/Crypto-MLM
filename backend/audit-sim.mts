import { prisma } from './src/core/db.js';

const runs = await prisma.simulationRun.findMany({ orderBy: { createdAt: 'asc' } });
console.log(`simulation runs: ${runs.length}\n`);
for (const r of runs) {
  const members = await prisma.user.count({ where: { simulationRunId: r.id } });
  console.log(`  ${r.status.padEnd(9)} ${r.name.slice(0, 26).padEnd(28)} recorded=${String(r.memberCount).padStart(5)}  still in db=${String(members).padStart(5)}  ${r.createdAt.toISOString().slice(0, 16)}`);
}

const modelled = await prisma.user.count({ where: { simulationRunId: { not: null } } });
const real = await prisma.user.count({ where: { simulationRunId: null } });
const orphan = await prisma.user.count({
  where: { simulationRunId: { not: null }, simulationRun: { is: null } },
}).catch(() => 0);

console.log(`\n  modelled members : ${modelled}`);
console.log(`  REAL members     : ${real}   <- must not change`);
console.log(`  orphaned         : ${orphan}`);
console.log('\n  real accounts:');
for (const u of await prisma.user.findMany({ where: { simulationRunId: null }, select: { email: true, userCode: true } })) {
  console.log(`    ${u.userCode}  ${u.email}`);
}
process.exit(0);
