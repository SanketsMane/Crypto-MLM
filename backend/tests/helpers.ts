import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

/** The password every test user is created with. */
export const PASSWORD = 'Passw0rd!23';
import { issue } from '../src/core/sessions.js';
import { PERMISSIONS, DEFAULT_ROLES } from '../src/modules/admin/rbac/permissions.js';
import { flushNotifications } from '../src/core/notify.js';
import { flushActivity } from '../src/core/activity.js';
import { invalidateConfig } from '../src/core/runtime-config.js';

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

/**
 * Wipes transactional data between tests, leaving plan configuration intact.
 *
 * Drains background writes first. Notifications and activity are written
 * fire-and-forget, so without this a TRUNCATE can race a write that is still in
 * flight — which shows up as an unrelated test hanging on a table lock.
 */
export async function resetData() {
  await Promise.all([flushNotifications(), flushActivity()]);

  // Settings are global and cached. A test that changes the withholding rate or
  // closes withdrawals must not leave that in place for the next file — which
  // runs against the same database, since money tests cannot run in parallel.
  await prisma.setting.deleteMany({});
  invalidateConfig();

  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      ledger_entries, commissions, roi_accruals, rank_achievements, roaming_club_awards,
      investments, deposits, withdrawals, ticket_messages, support_tickets, idempotency_keys, sessions,
      activity_logs, otp_challenges, email_logs, two_factor_recovery_codes, kyc_documents, kyc_submissions,
      chain_payouts, onchain_transfers, deposit_addresses, chain_cursors,
      notification_recipients, notifications, notification_preferences, admin_users,
      announcement_dismissals, announcements, ticket_attachments, reward_cards, consent_records,
      lottery_prizes, lottery_tickets, lottery_draws, reward_tiers, simulation_runs,
      team_volumes, wallet_accounts, audit_logs, users
    RESTART IDENTITY CASCADE`);
}

/** Seeds the compensation plan exactly as production does. */
export async function seedPlan() {
  const packages = [110, 270, 530, 1100, 2650];
  for (const [i, amount] of packages.entries()) {
    const name = `Test Plan ${i + 1}`;
    const existing = await prisma.packagePlan.findFirst({ where: { name } });
    const data = { name, amount: String(amount), dailyRoiPercent: '0.5', capPercent: '250', sortOrder: i + 1, isActive: true };
    if (existing) await prisma.packagePlan.update({ where: { id: existing.id }, data });
    else await prisma.packagePlan.create({ data });
  }

  for (const r of [{ level: 1, percent: 4 }, { level: 2, percent: 0.5 }, { level: 3, percent: 0.5 }]) {
    await prisma.commissionRule.upsert({
      where: { kind_level: { kind: 'DIRECT', level: r.level } },
      create: { kind: 'DIRECT', level: r.level, percent: String(r.percent) },
      update: { percent: String(r.percent), isActive: true },
    });
  }

  const bands = [
    { from: 1, to: 1, percent: 13, directs: 0, volume: 0 },
    { from: 2, to: 2, percent: 8, directs: 2, volume: 1000 },
    { from: 3, to: 5, percent: 5, directs: 6, volume: 6000 },
  ];
  for (const b of bands) {
    for (let level = b.from; level <= b.to; level++) {
      await prisma.commissionRule.upsert({
        where: { kind_level: { kind: 'GENERATION', level } },
        create: { kind: 'GENERATION', level, percent: String(b.percent), requiredDirects: b.directs, requiredTeamVolume: String(b.volume) },
        update: { percent: String(b.percent), requiredDirects: b.directs, requiredTeamVolume: String(b.volume), isActive: true },
      });
    }
  }

  await prisma.rankDefinition.upsert({
    where: { code: 'STARTER' },
    create: { code: 'STARTER', name: 'Starter', level: 1, selfCapital: '300', teamBusiness: '5000', reward: '300', sortOrder: 1 },
    update: {},
  });

  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({ where: { key: p.key }, create: p, update: p });
  }
  for (const r of DEFAULT_ROLES) {
    const role = await prisma.adminRole.upsert({
      where: { slug: r.slug },
      create: { name: r.name, slug: r.slug, description: r.description, level: r.level, isSystem: r.isSystem },
      update: {},
    });
    const perms = await prisma.permission.findMany({ where: { key: { in: r.permissions } }, select: { id: true } });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({ data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })), skipDuplicates: true });
  }
}

let seq = 0;
/** Creates a member with wallets and a team-volume row, like registration does. */
export async function makeUser(opts: { sponsorId?: string; funded?: number } = {}) {
  seq += 1;
  const sponsor = opts.sponsorId
    ? await prisma.user.findUniqueOrThrow({ where: { id: opts.sponsorId }, select: { id: true, path: true, depth: true } })
    : null;

  const user = await prisma.user.create({
    data: {
      userCode: `T${String(seq).padStart(6, '0')}${Date.now() % 1000}`,
      email: `t${seq}-${Date.now()}@test.local`,
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      firstName: `User${seq}`,
      status: 'ACTIVE',
      sponsorId: sponsor?.id,
      path: sponsor ? (sponsor.path ? `${sponsor.path}.${sponsor.id}` : sponsor.id) : '',
      depth: sponsor ? sponsor.depth + 1 : 0,
    },
  });

  await prisma.walletAccount.createMany({
    data: (['MAIN', 'FUND', 'DIGITAL'] as const).map((type) => ({ userId: user.id, type })),
  });
  await prisma.teamVolume.create({ data: { userId: user.id } });
  if (sponsor) await prisma.$executeRaw`UPDATE users SET "directCount" = "directCount" + 1, "activeDirectCount" = "activeDirectCount" + 1 WHERE id = ${sponsor.id}`;

  if (opts.funded) {
    await prisma.$executeRaw`
      UPDATE wallet_accounts SET balance = ${opts.funded}::numeric
       WHERE "userId" = ${user.id} AND type = 'FUND'`;
  }
  return user;
}

export const balanceOf = async (userId: string, type: 'MAIN' | 'FUND' | 'DIGITAL' = 'MAIN') => {
  const w = await prisma.walletAccount.findFirstOrThrow({ where: { userId, type } });
  return Number(w.balance);
};

/**
 * Signs a member in for HTTP-level tests.
 *
 * This goes through the real session machinery rather than hand-signing a JWT,
 * because a token with no session behind it is exactly what `requireAuth` is
 * supposed to reject.
 */
export const accessTokenFor = async (userId: string) => {
  const { accessToken } = await issue('USER', userId);
  return accessToken;
};

/**
 * Marks a member as identity-verified.
 *
 * Withdrawals require this now, so any test that withdraws has to say so
 * explicitly — which is the point: forgetting it should fail.
 */
export const verifyKyc = (userId: string) =>
  prisma.kycSubmission.create({
    data: {
      userId, fullName: 'Test Member', documentNo: 'TEST-1',
      countryCode: 'IN', status: 'APPROVED', reviewedAt: new Date(),
    },
  });
