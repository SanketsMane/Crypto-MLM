import type { AffiliateMode, UserStatus } from '@prisma/client';
import { prisma } from '../../../core/db.js';
import { postEntry } from '../../../core/ledger.js';
import { getCapState } from '../../../core/capping.js';
import { money, toDb } from '../../../core/money.js';
import { makeReference } from '../../../core/reference.js';
import { badRequest, notFound } from '../../../core/errors.js';
import { recalculate } from '../../team/team.service.js';
import { ensureWallets } from '../../../core/ledger.js';
import { buildPath } from '../../../core/tree.js';
import { userCode as newUserCode } from '../../../core/reference.js';
import bcrypt from 'bcryptjs';
import * as audit from '../audit/audit.service.js';
import { revokeAllFor } from '../../../core/sessions.js';
import * as activity from '../../../core/activity.js';
import { notifyMember } from '../../../core/notify.js';
import type { Request } from 'express';

export async function list(opts: { take: number; skip: number; search?: string; status?: UserStatus }) {
  const where = {
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.search
      ? {
          OR: [
            { email: { contains: opts.search, mode: 'insensitive' as const } },
            { userCode: { contains: opts.search.toUpperCase() } },
            { firstName: { contains: opts.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where, orderBy: { createdAt: 'desc' }, take: opts.take, skip: opts.skip,
      include: {
        currentRank: { select: { name: true } },
        teamVolume: { select: { totalTeamBusiness: true, teamSize: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    total,
    rows: rows.map((u) => ({
      id: u.id, userCode: u.userCode, email: u.email,
      name: [u.firstName, u.lastName].filter(Boolean).join(' '),
      status: u.status, affiliateMode: u.affiliateMode,
      totalInvested: u.totalInvested.toString(),
      totalEarned: u.totalEarned.toString(),
      directCount: u.directCount,
      rank: u.currentRank?.name ?? null,
      teamBusiness: u.teamVolume?.totalTeamBusiness?.toString() ?? '0',
      teamSize: u.teamVolume?.teamSize ?? 0,
      createdAt: u.createdAt,
    })),
  };
}

/** Everything an operator needs on one screen to answer a support ticket. */
export async function detail(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      currentRank: true,
      sponsor: { select: { id: true, userCode: true, email: true } },
      teamVolume: true,
      wallets: true,
    },
  });
  if (!user) throw notFound('User not found');

  const [investments, ledger, commissions, ranks, deposits, withdrawals, directs, cap] = await Promise.all([
    prisma.investment.findMany({ where: { userId }, include: { package: { select: { name: true } } }, orderBy: { createdAt: 'desc' } }),
    prisma.ledgerEntry.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100, include: { wallet: { select: { type: true } } } }),
    prisma.commission.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50, include: { fromUser: { select: { userCode: true } } } }),
    prisma.rankAchievement.findMany({ where: { userId }, include: { rank: true }, orderBy: { achievedAt: 'desc' } }),
    prisma.deposit.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 25 }),
    prisma.withdrawal.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 25 }),
    prisma.user.findMany({ where: { sponsorId: userId }, select: { id: true, userCode: true, email: true, status: true, totalInvested: true, createdAt: true } }),
    getCapState(userId),
  ]);

  return {
    profile: {
      id: user.id, userCode: user.userCode, email: user.email, phone: user.phone,
      name: [user.firstName, user.lastName].filter(Boolean).join(' '),
      status: user.status, affiliateMode: user.affiliateMode,
      walletAddress: user.walletAddress,
      totalInvested: user.totalInvested.toString(),
      totalEarned: user.totalEarned.toString(),
      directCount: user.directCount, activeDirectCount: user.activeDirectCount,
      depth: user.depth, path: user.path,
      rank: user.currentRank ? { code: user.currentRank.code, name: user.currentRank.name } : null,
      sponsor: user.sponsor,
      emailVerifiedAt: user.emailVerifiedAt, lastLoginAt: user.lastLoginAt, createdAt: user.createdAt,
    },
    capping: {
      limit: cap.capLimit.toString(), earned: cap.totalEarned.toString(),
      remaining: cap.remaining.toString(), isCapped: cap.isCapped,
    },
    team: {
      totalTeamBusiness: user.teamVolume?.totalTeamBusiness?.toString() ?? '0',
      powerLegVolume: user.teamVolume?.powerLegVolume?.toString() ?? '0',
      otherLegsVolume: user.teamVolume?.otherLegsVolume?.toString() ?? '0',
      teamSize: user.teamVolume?.teamSize ?? 0,
    },
    wallets: user.wallets.map((w) => ({ type: w.type, balance: w.balance.toString(), locked: w.locked.toString() })),
    investments: investments.map((i) => ({
      id: i.id, package: i.package.name, amount: i.amount.toString(),
      capLimit: i.capLimit.toString(), totalEarned: i.totalEarned.toString(),
      status: i.status, startedAt: i.startedAt,
    })),
    ledger: ledger.map((l) => ({
      id: l.id, wallet: l.wallet.type, direction: l.direction, category: l.category,
      amount: l.amount.toString(), balanceAfter: l.balanceAfter.toString(),
      reference: l.reference, description: l.description, createdAt: l.createdAt,
    })),
    commissions: commissions.map((c) => ({
      id: c.id, kind: c.kind, level: c.level, from: c.fromUser.userCode,
      percent: c.percent.toString(), baseAmount: c.baseAmount.toString(),
      amount: c.amount.toString(), paidAmount: c.paidAmount.toString(),
      status: c.status, createdAt: c.createdAt,
    })),
    ranks: ranks.map((r) => ({ rank: r.rank.name, reward: r.rewardAmount.toString(), achievedAt: r.achievedAt })),
    deposits, withdrawals,
    directs: directs.map((d) => ({ ...d, totalInvested: d.totalInvested.toString() })),
  };
}

export async function setStatus(adminId: string, userId: string, status: UserStatus, req?: Request) {
  const before = await prisma.user.findUnique({ where: { id: userId }, select: { status: true, userCode: true } });
  if (!before) throw notFound('User not found');

  const user = await prisma.user.update({ where: { id: userId }, data: { status } });

  // A block that leaves the member signed in is not a block. Ending the
  // sessions here means the decision takes effect immediately rather than
  // whenever their access token happens to run out.
  if (status !== 'ACTIVE') {
    await revokeAllFor('USER', userId, `STATUS_${status}`);
  }

  await audit.record({
    adminId, action: 'STATUS_CHANGE', entityType: 'user', entityId: userId,
    summary: `${before.userCode} status ${before.status} → ${status}`,
    before: { status: before.status }, after: { status }, req,
  });

  notifyMember({
    userId,
    type: 'security.account_status',
    dedupeKey: `status:${userId}:${status}:${Math.floor(Date.now() / 60_000)}`,
    title: `Account ${status.toLowerCase()}`,
    body: status === 'ACTIVE'
      ? 'Your account is active again. Full access has been restored.'
      : `Your account has been set to ${status.toLowerCase()}. Contact support if you believe this is a mistake.`,
    meta: { from: before.status, to: status },
  });

  activity.record({
    userId, event: 'ACCOUNT_STATUS_CHANGED', actorAdminId: adminId,
    summary: `Your account status was changed from ${before.status} to ${status}`,
    meta: { from: before.status, to: status },
  });
  return { id: user.id, userCode: user.userCode, status: user.status };
}

export async function setAffiliateMode(adminId: string, userId: string, mode: AffiliateMode, req?: Request) {
  const before = await prisma.user.findUnique({ where: { id: userId }, select: { affiliateMode: true, userCode: true } });
  if (!before) throw notFound('User not found');

  const user = await prisma.user.update({ where: { id: userId }, data: { affiliateMode: mode } });
  await audit.record({
    adminId, action: 'UPDATE', entityType: 'user', entityId: userId,
    summary: `${before.userCode} cap mode ${before.affiliateMode} → ${mode} (250% → 300%)`,
    before: { affiliateMode: before.affiliateMode }, after: { affiliateMode: mode }, req,
  });
  return { id: user.id, userCode: user.userCode, affiliateMode: user.affiliateMode };
}

/**
 * Manual balance adjustment. Routed through the ledger like every other money
 * movement — an operator cannot write a balance directly, and the reason is
 * mandatory so the audit row is meaningful.
 */
export async function adjustBalance(
  adminId: string,
  params: { userId: string; walletType: 'MAIN' | 'FUND' | 'DIGITAL'; direction: 'CREDIT' | 'DEBIT'; amount: string; reason: string },
  req?: Request,
) {
  const value = money(params.amount);
  if (value.lte(0)) throw badRequest('Amount must be positive');
  if (!params.reason?.trim()) throw badRequest('A reason is required for manual adjustments');

  const user = await prisma.user.findUnique({ where: { id: params.userId }, select: { userCode: true } });
  if (!user) throw notFound('User not found');

  const reference = makeReference('ADJ', params.userId);

  const entry = await prisma.$transaction(async (tx) => {
    const e = await postEntry(tx, {
      userId: params.userId,
      walletType: params.walletType,
      direction: params.direction,
      category: 'ADJUSTMENT',
      amount: value,
      reference,
      description: `Manual adjustment: ${params.reason}`,
      meta: { adminId, reason: params.reason },
      sourceType: 'admin_adjustment',
      sourceId: adminId,
    });

    await audit.record({
      adminId,
      action: params.direction === 'CREDIT' ? 'CREDIT' : 'DEBIT',
      entityType: 'user', entityId: params.userId,
      summary: `${params.direction} ${toDb(value)} to ${user.userCode} ${params.walletType} — ${params.reason}`,
      after: { amount: toDb(value), wallet: params.walletType, reference }, req,
    }, tx);

    return e;
  });

  // A balance that changed without the member doing anything is exactly what
  // they will query later, so it appears in their trail attributed to an
  // operator rather than to them.
  notifyMember({
    userId: params.userId,
    type: 'wallet.adjusted',
    dedupeKey: `adjustment:${entry.reference}`,
    title: params.direction === 'CREDIT' ? 'Balance credited' : 'Balance debited',
    body: `An operator ${params.direction === 'CREDIT' ? 'added' : 'removed'} $${value.toString()} ${params.direction === 'CREDIT' ? 'to' : 'from'} your ${params.walletType.toLowerCase()} wallet. Reason: ${params.reason}`,
    meta: { direction: params.direction, amount: value.toString(), reason: params.reason },
  });

  activity.record({
    userId: params.userId, event: 'BALANCE_ADJUSTED', actorAdminId: adminId,
    summary: `An operator ${params.direction === 'CREDIT' ? 'credited' : 'debited'} $${value.toString()} ${params.direction === 'CREDIT' ? 'to' : 'from'} your ${params.walletType.toLowerCase()} wallet — ${params.reason}`,
    meta: { direction: params.direction, wallet: params.walletType, amount: value.toString(), reason: params.reason },
  });

  return { reference: entry.reference, balanceAfter: entry.balanceAfter.toString() };
}

/** Force a team-volume rebuild — useful after data fixes. */
export async function recalcTeam(adminId: string, userId: string, req?: Request) {
  const tv = await recalculate(userId);
  await audit.record({
    adminId, action: 'UPDATE', entityType: 'team_volume', entityId: userId,
    summary: 'Team volume recalculated', after: { totalTeamBusiness: tv.totalTeamBusiness.toString() }, req,
  });
  return tv;
}

/**
 * Create a member on their behalf.
 *
 * Support routinely needs this — a member who cannot complete sign-up, or an
 * account being migrated in. It mirrors the public registration path exactly
 * (wallets, team-volume row, sponsor counters) rather than writing a partial
 * user that later breaks the commission walk. Registration being closed does
 * not block an operator; that switch governs self-service sign-up.
 */
export async function createMember(
  adminId: string,
  input: { email: string; firstName: string; lastName?: string; phone?: string; password: string; sponsorCode?: string },
  req?: Request,
) {
  const email = input.email.trim().toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) {
    throw badRequest('An account with that email already exists');
  }

  let sponsor: { id: string; path: string; depth: number; userCode: string } | null = null;
  if (input.sponsorCode?.trim()) {
    sponsor = await prisma.user.findUnique({
      where: { userCode: input.sponsorCode.trim().toUpperCase() },
      select: { id: true, path: true, depth: true, userCode: true },
    });
    if (!sponsor) throw badRequest('Sponsor code not found');
  }

  const passwordHash = await bcrypt.hash(input.password, 12);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        userCode: newUserCode(),
        email,
        phone: input.phone?.trim() || null,
        passwordHash,
        firstName: input.firstName.trim(),
        lastName: input.lastName?.trim() || null,
        sponsorId: sponsor?.id,
        path: sponsor ? buildPath(sponsor.path, sponsor.id) : '',
        depth: sponsor ? sponsor.depth + 1 : 0,
        status: 'ACTIVE',
      },
    });
    await ensureWallets(created.id, tx);
    await tx.teamVolume.create({ data: { userId: created.id } });
    if (sponsor) {
      await tx.$executeRaw`UPDATE users SET "directCount" = "directCount" + 1 WHERE id = ${sponsor.id}`;
    }
    return created;
  });

  await audit.record({
    adminId, action: 'CREATE', entityType: 'user', entityId: user.id,
    summary: `Created member ${user.userCode} (${email})${sponsor ? ` under ${sponsor.userCode}` : ''}`,
    after: { userCode: user.userCode, email, sponsor: sponsor?.userCode ?? null }, req,
  });

  return { id: user.id, userCode: user.userCode, email: user.email };
}

/**
 * Set a member's password.
 *
 * The operator never learns the old one — there is nothing to learn, only a
 * hash — and the new password is not echoed back in the audit row.
 */
export async function resetPassword(adminId: string, userId: string, password: string, req?: Request) {
  if (password.length < 8) throw badRequest('Password must be at least 8 characters');

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { userCode: true, email: true } });
  if (!user) throw notFound('User not found');

  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(password, 12) } });

  await audit.record({
    adminId, action: 'UPDATE', entityType: 'user', entityId: userId,
    summary: `Password reset for ${user.userCode} by an operator`,
    after: { userCode: user.userCode }, req,
  });
  return { id: userId, userCode: user.userCode };
}

/**
 * Acting on several members at once.
 *
 * Status changes and cap-mode switches are the two an operator genuinely does
 * in bulk — onboarding a batch, suspending a set of accounts after a fraud
 * review. Balance adjustments are deliberately NOT here: money moving to many
 * people in one click, with one shared reason, is exactly the operation that
 * should be slow and individual.
 *
 * Each member is processed independently so one failure does not silently
 * abandon the rest, and the result says precisely what happened to each.
 */
export interface BulkResult {
  requested: number;
  succeeded: string[];
  failed: { userId: string; reason: string }[];
}

const BULK_LIMIT = 200;

export async function bulkStatus(
  adminId: string,
  userIds: string[],
  status: UserStatus,
  reason: string,
  req?: Request,
): Promise<BulkResult> {
  if (!userIds.length) throw badRequest('Select at least one member');
  if (userIds.length > BULK_LIMIT) {
    throw badRequest(`Act on at most ${BULK_LIMIT} members at a time`);
  }
  if (!reason.trim()) throw badRequest('A reason is required — it goes in the audit log');

  const succeeded: string[] = [];
  const failed: { userId: string; reason: string }[] = [];

  for (const userId of userIds) {
    try {
      await setStatus(adminId, userId, status, req);
      succeeded.push(userId);
    } catch (err) {
      failed.push({ userId, reason: err instanceof Error ? err.message : 'Failed' });
    }
  }

  // One summary line for the batch, on top of the per-member entries setStatus
  // already wrote — so the log shows both the sweep and each account in it.
  await audit.record({
    adminId, action: 'STATUS_CHANGE', entityType: 'user',
    summary: `Bulk status change to ${status} for ${succeeded.length} of ${userIds.length} members — ${reason.trim()}`,
    after: { status, reason: reason.trim(), succeeded: succeeded.length, failed: failed.length },
    req,
  });

  return { requested: userIds.length, succeeded, failed };
}

export async function bulkAffiliateMode(
  adminId: string,
  userIds: string[],
  mode: AffiliateMode,
  req?: Request,
): Promise<BulkResult> {
  if (!userIds.length) throw badRequest('Select at least one member');
  if (userIds.length > BULK_LIMIT) {
    throw badRequest(`Act on at most ${BULK_LIMIT} members at a time`);
  }

  const succeeded: string[] = [];
  const failed: { userId: string; reason: string }[] = [];

  for (const userId of userIds) {
    try {
      await setAffiliateMode(adminId, userId, mode, req);
      succeeded.push(userId);
    } catch (err) {
      failed.push({ userId, reason: err instanceof Error ? err.message : 'Failed' });
    }
  }

  await audit.record({
    adminId, action: 'UPDATE', entityType: 'user',
    summary: `Bulk cap mode change to ${mode} for ${succeeded.length} of ${userIds.length} members`,
    after: { mode, succeeded: succeeded.length, failed: failed.length }, req,
  });

  return { requested: userIds.length, succeeded, failed };
}