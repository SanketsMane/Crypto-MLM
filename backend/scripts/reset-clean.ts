import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/core/db.js';

/**
 * Wipes all customer and transactional data, leaving the platform clean.
 *
 * KEPT: the compensation plan (packages, commission rules, ranks, Flyers Club),
 *       the RBAC catalogue (permissions, roles) and runtime settings — that is
 *       configuration, not data.
 * REMOVED: every customer, wallet, ledger entry, investment, commission,
 *          deposit, withdrawal, ticket and audit row.
 */
const KEEP = ['contactsanket1@gmail.com', 'contactsanket2@gmail.com'];

// FK-safe order
const wipe = [
  ['ledger entries',   () => prisma.ledgerEntry.deleteMany()],
  ['commissions',      () => prisma.commission.deleteMany()],
  ['ROI accruals',     () => prisma.roiAccrual.deleteMany()],
  ['rank achievements',() => prisma.rankAchievement.deleteMany()],
  ['roaming awards',   () => prisma.roamingClubAward.deleteMany()],
  ['investments',      () => prisma.investment.deleteMany()],
  ['deposits',         () => prisma.deposit.deleteMany()],
  ['withdrawals',      () => prisma.withdrawal.deleteMany()],
  ['ticket messages',  () => prisma.ticketMessage.deleteMany()],
  ['support tickets',  () => prisma.supportTicket.deleteMany()],
  ['team volumes',     () => prisma.teamVolume.deleteMany()],
  ['wallet accounts',  () => prisma.walletAccount.deleteMany()],
  ['customers',        () => prisma.user.deleteMany()],
  ['audit logs',       () => prisma.auditLog.deleteMany()],
] as const;

for (const [label, fn] of wipe) {
  const { count } = await fn();
  console.log(`  removed ${String(count).padStart(3)} ${label}`);
}

// admins: keep only the two named accounts
const removed = await prisma.adminUser.deleteMany({ where: { email: { notIn: KEEP } } });
console.log(`  removed ${String(removed.count).padStart(3)} other admin accounts`);

const superRole = await prisma.adminRole.findUniqueOrThrow({ where: { slug: 'super-admin' } });
for (const email of KEEP) {
  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) {
    await prisma.adminUser.update({ where: { email }, data: { roleId: superRole.id, isActive: true } });
    console.log(`  kept    ${email}`);
  } else {
    await prisma.adminUser.create({
      data: {
        email,
        name: email.split('@')[0]!.replace('contact', '').replace(/^\w/, (c) => c.toUpperCase()),
        passwordHash: await bcrypt.hash('Sanket@3030', 12),
        roleId: superRole.id,
      },
    });
    console.log(`  created ${email}  (password: Sanket@3030)`);
  }
}

console.log('\n  remaining:');
for (const [k, v] of Object.entries({
  users: await prisma.user.count(),
  wallets: await prisma.walletAccount.count(),
  ledger: await prisma.ledgerEntry.count(),
  investments: await prisma.investment.count(),
  deposits: await prisma.deposit.count(),
  withdrawals: await prisma.withdrawal.count(),
  audit: await prisma.auditLog.count(),
  admins: await prisma.adminUser.count(),
})) console.log(`    ${k.padEnd(12)} ${v}`);

console.log('\n  configuration preserved:');
for (const [k, v] of Object.entries({
  packages: await prisma.packagePlan.count(),
  commissionRules: await prisma.commissionRule.count(),
  ranks: await prisma.rankDefinition.count(),
  roamingTiers: await prisma.roamingClubTier.count(),
  permissions: await prisma.permission.count(),
  roles: await prisma.adminRole.count(),
})) console.log(`    ${k.padEnd(16)} ${v}`);

await prisma.$disconnect();
