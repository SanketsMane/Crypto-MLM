import 'dotenv/config';
import { prisma } from '../src/core/db.js';

/**
 * Reset the platform to a clean pre-launch state.
 *
 * KEPT — configuration, not data:
 *   the compensation plan (packages, commission rules, ranks, Flyers Club
 *   tiers, reward tiers), the RBAC catalogue (permissions, roles, grants),
 *   runtime settings, and EVERY admin account.
 *
 * REMOVED — everything a member ever created or was credited:
 *   members, wallets, the ledger, investments, accruals, commissions,
 *   deposits, withdrawals, KYC, tickets, notifications, sessions, lottery
 *   draws and tickets, reward cards, rank achievements and their instalments,
 *   adjustment requests, simulation runs, and the audit and activity trails.
 *
 * This supersedes `reset-clean.ts`, which predates several tables and whose
 * keep-list named a member account as an admin — running it would have deleted
 * two real operator logins and created a super-admin nobody asked for.
 *
 * Order matters where a foreign key has no cascade. Where one does, deleting
 * the user is enough, but the row is listed anyway so the count is visible and
 * a missing cascade shows up as a non-zero number rather than silence.
 */

const steps: [string, () => Promise<{ count: number }>][] = [
  // ── money and its history ──
  ['ledger entries',        () => prisma.ledgerEntry.deleteMany()],
  ['commissions',           () => prisma.commission.deleteMany()],
  ['ROI accruals',          () => prisma.roiAccrual.deleteMany()],
  ['reward instalments',    () => prisma.rankRewardInstalment.deleteMany()],
  ['rank achievements',     () => prisma.rankAchievement.deleteMany()],
  ['adjustment requests',   () => prisma.balanceAdjustmentRequest.deleteMany()],
  ['roaming/flyers awards', () => prisma.roamingClubAward.deleteMany()],
  ['reward cards',          () => prisma.rewardCard.deleteMany()],
  ['investments',           () => prisma.investment.deleteMany()],
  ['deposits',              () => prisma.deposit.deleteMany()],
  ['withdrawals',           () => prisma.withdrawal.deleteMany()],
  ['wallet accounts',       () => prisma.walletAccount.deleteMany()],

  // ── draws: tickets and prizes reference a draw, so they go first ──
  ['lottery tickets',       () => prisma.lotteryTicket.deleteMany()],
  ['lottery prizes',        () => prisma.lotteryPrize.deleteMany()],
  ['lottery draws',         () => prisma.lotteryDraw.deleteMany()],

  // ── identity, support and comms ──
  ['KYC documents',         () => prisma.kycDocument.deleteMany()],
  ['KYC submissions',       () => prisma.kycSubmission.deleteMany()],
  ['ticket messages',       () => prisma.ticketMessage.deleteMany()],
  ['support tickets',       () => prisma.supportTicket.deleteMany()],
  ['contact messages',      () => prisma.contactMessage.deleteMany()],
  ['notification recipients', () => prisma.notificationRecipient.deleteMany()],
  ['notifications',         () => prisma.notification.deleteMany()],
  ['notification prefs',    () => prisma.notificationPreference.deleteMany()],
  ['consent records',       () => prisma.consentRecord.deleteMany()],
  ['email logs',            () => prisma.emailLog.deleteMany()],

  // ── sessions and one-time credentials, for members AND operators ──
  ['sessions',              () => prisma.session.deleteMany()],
  ['OTP challenges',        () => prisma.otpChallenge.deleteMany()],
  ['idempotency keys',      () => prisma.idempotencyKey.deleteMany()],

  // ── network ──
  ['team volumes',          () => prisma.teamVolume.deleteMany()],
  ['binary legs',           () => prisma.binaryLeg.deleteMany()],
  ['members',               () => prisma.user.deleteMany()],

  // ── operational noise ──
  ['simulation runs',       () => prisma.simulationRun.deleteMany()],
  ['gateway events',        () => prisma.gatewayEvent.deleteMany()],
  ['error events',          () => prisma.errorEvent.deleteMany()],
  ['activity logs',         () => prisma.activityLog.deleteMany()],
  ['audit logs',            () => prisma.auditLog.deleteMany()],
];

console.log('Removing member and transactional data…\n');
let removed = 0;
for (const [label, run] of steps) {
  const { count } = await run();
  removed += count;
  if (count > 0) console.log(`  ${String(count).padStart(6)}  ${label}`);
}

const kept = {
  'admin accounts':   await prisma.adminUser.count(),
  'admin roles':      await prisma.adminRole.count(),
  permissions:        await prisma.permission.count(),
  'role grants':      await prisma.rolePermission.count(),
  'investment plans': await prisma.packagePlan.count(),
  'commission rules': await prisma.commissionRule.count(),
  ranks:              await prisma.rankDefinition.count(),
  'flyers tiers':     await prisma.roamingClubTier.count(),
  'reward tiers':     await prisma.rewardTier.count(),
  settings:           await prisma.setting.count(),
};

console.log(`\n  ${removed} rows removed in total.\n\nKept:`);
for (const [label, n] of Object.entries(kept)) {
  console.log(`  ${String(n).padStart(6)}  ${label}`);
}

const admins = await prisma.adminUser.findMany({
  select: { email: true, isActive: true },
  orderBy: { email: 'asc' },
});
console.log('\nAdmin logins (unchanged, passwords untouched):');
for (const a of admins) console.log(`  ${a.isActive ? '✓' : '✗'} ${a.email}`);

await prisma.$disconnect();
