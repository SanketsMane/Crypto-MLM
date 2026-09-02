import type { Request } from 'express';
import { prisma } from '../../core/db.js';
import * as activity from '../../core/activity.js';
import { notifyMember } from '../../core/notify.js';
import { badRequest, notFound } from '../../core/errors.js';
import { stepUpRequired } from '../auth/step-up.service.js';
import { activeDirectCount } from '../../core/tree.js';

export async function profile(userId: string) {
  /* Active directs are counted, never read from `User.activeDirectCount` — that
     column is stale for every real member. See core/tree.ts. */
  const [u, activeDirects] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      include: {
        currentRank: { select: { code: true, name: true, level: true } },
        sponsor: { select: { userCode: true, firstName: true } },
        teamVolume: true,
      },
    }),
    activeDirectCount(userId),
  ]);
  if (!u) throw notFound('User not found');

  return {
    id: u.id, userCode: u.userCode, email: u.email, phone: u.phone,
    firstName: u.firstName, lastName: u.lastName,
    status: u.status, affiliateMode: u.affiliateMode,
    walletAddress: u.walletAddress,
    totalInvested: u.totalInvested.toString(),
    totalEarned: u.totalEarned.toString(),
    directCount: u.directCount, activeDirectCount: activeDirects,
    rank: u.currentRank, sponsor: u.sponsor,
    teamBusiness: u.teamVolume?.totalTeamBusiness?.toString() ?? '0',
    joinedAt: u.createdAt,
  };
}

/**
 * Profile changes.
 *
 * The payout address gets its own treatment. It is the field an account
 * takeover actually wants — everything else is cosmetic, and changing this one
 * redirects every future withdrawal. So it is validated, logged separately, and
 * the old value is kept in the record so a member can see exactly what it was
 * changed from.
 */
export async function update(
  userId: string,
  data: { firstName?: string; lastName?: string; phone?: string; walletAddress?: string },
  req?: Request,
  stepUpMethod?: 'password' | 'totp',
) {
  const before = await prisma.user.findUnique({
    where: { id: userId },
    select: { walletAddress: true },
  });
  if (!before) throw notFound('User not found');

  /**
   * Re-authentication, but only for the field that matters.
   *
   * Demanding it for a phone-number edit would train members to confirm
   * without reading. Demanding it here is the point: this is the change an
   * attacker makes, and the notification below is only a record of it —
   * this is what actually stops it.
   */
  const changingAddress =
    data.walletAddress !== undefined &&
    data.walletAddress !== '' &&
    data.walletAddress !== before.walletAddress;
  if (changingAddress && !stepUpMethod) {
    throw stepUpRequired('Confirm it is you before changing where your money is sent.');
  }

  if (data.walletAddress !== undefined && data.walletAddress !== '') {
    if (!/^0x[a-fA-F0-9]{40}$/.test(data.walletAddress)) {
      throw badRequest('That is not a valid BEP-20 address');
    }
  }

  const user = await prisma.user.update({
    where: { id: userId },
    // Stamped in the same write as the address itself, so the hold can never
    // be missing for an address that did change.
    data: changingAddress ? { ...data, walletAddressChangedAt: new Date() } : data,
  });

  const addressChanged =
    data.walletAddress !== undefined && data.walletAddress !== before.walletAddress;

  if (addressChanged) {
    notifyMember({
      userId,
      type: 'security.payout_address',
      title: 'Your payout address was changed',
      body: `Future withdrawals will go to ${activity.maskAddress(user.walletAddress!)}. If this was not you, contact support immediately — this is the change an attacker makes to redirect your money.`,
      meta: { from: before.walletAddress, to: user.walletAddress },
    });

    activity.record({
      userId, event: 'PAYOUT_ADDRESS_CHANGED', req,
      summary: before.walletAddress
        ? `Payout address changed from ${activity.maskAddress(before.walletAddress)} to ${activity.maskAddress(user.walletAddress!)}`
        : `Payout address set to ${activity.maskAddress(user.walletAddress!)}`,
      meta: { from: before.walletAddress, to: user.walletAddress },
    });
  }

  const otherFields = (['firstName', 'lastName', 'phone'] as const).filter(
    (k) => data[k] !== undefined,
  );
  if (otherFields.length) {
    activity.record({
      userId, event: 'PROFILE_UPDATED', req,
      summary: `Updated profile details (${otherFields.join(', ')})`,
    });
  }

  return user;
}

export const referralLink = async (userId: string, webUrl: string) => {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { userCode: true } });
  if (!u) throw notFound('User not found');
  return { userCode: u.userCode, link: `${webUrl}/register?ref=${u.userCode}` };
};
