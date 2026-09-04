import type { NotificationCategory, NotificationSeverity } from '@prisma/client';

/**
 * Every notification the platform can send.
 *
 * One file, so "what do we tell people, and when?" is a question with a single
 * answer. Wording lives here rather than at the call site for the same reason
 * email templates do: a member reading "Withdrawal approved" in their bell and
 * "Payout sent" in their inbox for the same event has been told two things.
 *
 * Two rules govern what earns a place here:
 *
 *   1. **It must be actionable or consequential.** A notification the reader
 *      can do nothing about, and would not have wanted to know, is noise — and
 *      noise is not neutral. It trains people to dismiss the bell without
 *      reading, which is exactly when the payout-address alert gets missed.
 *
 *   2. **It must be low-volume per recipient.** Anything that fires per member
 *      per day — daily ROI, thirty levels of generation bonus — is aggregated
 *      into a digest instead. Thirty rows saying "you earned $0.04" is worse
 *      than one saying "you earned $1.20 from 30 levels".
 */

export interface NotificationSpec {
  category: NotificationCategory;
  severity: NotificationSeverity;
  /** Where clicking it should take the reader. */
  link?: string;
  /**
   * Security notices ignore preferences. Being told your password changed is
   * not something anyone gets to opt out of, on their own account or anyone
   * else's.
   */
  alwaysDeliver?: boolean;
}

export const MEMBER_NOTIFICATIONS = {
  // ── money ──
  'deposit.credited':      { category: 'MONEY', severity: 'SUCCESS', link: '/deposit' },
  'deposit.rejected':      { category: 'MONEY', severity: 'WARNING', link: '/deposit' },
  'withdrawal.requested':  { category: 'MONEY', severity: 'INFO',    link: '/withdrawals' },
  'withdrawal.sent':       { category: 'MONEY', severity: 'SUCCESS', link: '/withdrawals' },
  'withdrawal.rejected':   { category: 'MONEY', severity: 'WARNING', link: '/withdrawals' },
  'wallet.adjusted':       { category: 'MONEY', severity: 'INFO',    link: '/passbook' },
  'investment.purchased':  { category: 'MONEY', severity: 'SUCCESS', link: '/packages' },

  // ── earnings ──
  'earnings.daily':        { category: 'EARNINGS', severity: 'INFO',    link: '/income' },
  'commission.direct':     { category: 'EARNINGS', severity: 'SUCCESS', link: '/income' },
  'commission.binary':     { category: 'EARNINGS', severity: 'SUCCESS', link: '/income' },
  'investment.capped':     { category: 'EARNINGS', severity: 'WARNING', link: '/packages' },
  'rank.achieved':         { category: 'EARNINGS', severity: 'SUCCESS', link: '/rank' },
  'rank.instalment':       { category: 'EARNINGS', severity: 'SUCCESS', link: '/rank' },
  'roaming.qualified':     { category: 'EARNINGS', severity: 'SUCCESS', link: '/flyers-club' },

  // ── network ──
  'referral.joined':       { category: 'NETWORK', severity: 'INFO', link: '/team' },
  'referral.invested':     { category: 'NETWORK', severity: 'INFO', link: '/team' },

  // ── compliance ──
  'kyc.approved':          { category: 'COMPLIANCE', severity: 'SUCCESS', link: '/kyc' },
  'kyc.rejected':          { category: 'COMPLIANCE', severity: 'WARNING', link: '/kyc' },

  // ── support ──
  'support.replied':       { category: 'SUPPORT', severity: 'INFO', link: '/support' },
  'support.resolved':      { category: 'SUPPORT', severity: 'INFO', link: '/support' },

  // ── security: never silenced ──
  'security.password_changed':  { category: 'SECURITY', severity: 'WARNING',  link: '/security', alwaysDeliver: true },
  'security.new_device':        { category: 'SECURITY', severity: 'WARNING',  link: '/security', alwaysDeliver: true },
  'security.two_factor_on':     { category: 'SECURITY', severity: 'SUCCESS',  link: '/security', alwaysDeliver: true },
  'security.two_factor_off':    { category: 'SECURITY', severity: 'WARNING',  link: '/security', alwaysDeliver: true },
  'security.recovery_used':     { category: 'SECURITY', severity: 'WARNING',  link: '/security', alwaysDeliver: true },
  'security.payout_address':    { category: 'SECURITY', severity: 'CRITICAL', link: '/security', alwaysDeliver: true },
  'security.account_status':    { category: 'SECURITY', severity: 'CRITICAL', link: '/security', alwaysDeliver: true },
} as const satisfies Record<string, NotificationSpec>;

/**
 * Operator alerts.
 *
 * Each carries the permission that decides who sees it. Routing on capability
 * rather than on a named role means a new role that can approve withdrawals
 * starts receiving withdrawal alerts without anyone remembering to wire it up —
 * and an operator who loses the permission stops.
 */
export const ADMIN_NOTIFICATIONS = {
  'ops.deposit_pending':     { category: 'OPERATIONS', severity: 'INFO',     link: '/admin/deposits',    permission: 'deposits.approve' },
  'ops.withdrawal_pending':  { category: 'OPERATIONS', severity: 'INFO',     link: '/admin/withdrawals', permission: 'withdrawals.approve' },
  'ops.withdrawal_large':    { category: 'OPERATIONS', severity: 'WARNING',  link: '/admin/withdrawals', permission: 'withdrawals.approve' },
  'ops.withdrawal_overdue':  { category: 'OPERATIONS', severity: 'WARNING',  link: '/admin/withdrawals', permission: 'withdrawals.approve' },
  'ops.kyc_pending':         { category: 'COMPLIANCE', severity: 'INFO',     link: '/admin/kyc',         permission: 'kyc.review' },
  'ops.support_ticket':      { category: 'SUPPORT',    severity: 'INFO',     link: '/admin/support',     permission: 'support.manage' },
  'ops.support_reply':       { category: 'SUPPORT',    severity: 'INFO',     link: '/admin/support',     permission: 'support.manage' },
  'ops.roaming_award':       { category: 'OPERATIONS', severity: 'INFO',     link: '/admin/plans',       permission: 'roaming.fulfil' },
  'ops.member_registered':   { category: 'OPERATIONS', severity: 'INFO',     link: '/admin/users',       permission: 'users.view' },

  'system.payout_failed':    { category: 'SYSTEM', severity: 'CRITICAL', link: '/admin/chain',    permission: 'jobs.view' },
  'system.treasury_low':     { category: 'SYSTEM', severity: 'WARNING',  link: '/admin/chain',    permission: 'jobs.view' },
  'system.watcher_stalled':  { category: 'SYSTEM', severity: 'CRITICAL', link: '/admin/chain',    permission: 'jobs.view' },
  'system.job_failed':       { category: 'SYSTEM', severity: 'CRITICAL', link: '/admin/jobs',     permission: 'jobs.view' },
  /* The ledger no longer balances. Nothing on this platform matters more. */
  'system.trial_balance_failed': { category: 'SYSTEM', severity: 'CRITICAL', link: '/admin/ledger', permission: 'jobs.view' },
  'system.roi_complete':     { category: 'SYSTEM', severity: 'INFO',     link: '/admin/jobs',     permission: 'jobs.view' },
  'system.settings_changed': { category: 'SYSTEM', severity: 'WARNING',  link: '/admin/settings', permission: 'settings.view' },
  'system.admin_changed':    { category: 'SYSTEM', severity: 'WARNING',  link: '/admin/access',   permission: 'admins.view' },
} as const satisfies Record<string, NotificationSpec & { permission: string }>;

export type MemberNotificationType = keyof typeof MEMBER_NOTIFICATIONS;
export type AdminNotificationType = keyof typeof ADMIN_NOTIFICATIONS;

export const memberSpec = (type: MemberNotificationType): NotificationSpec =>
  MEMBER_NOTIFICATIONS[type];

export const adminSpec = (type: AdminNotificationType) => ADMIN_NOTIFICATIONS[type];

/** Human labels for the category filter. */
export const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  MONEY: 'Money',
  EARNINGS: 'Earnings',
  NETWORK: 'Network',
  SECURITY: 'Security',
  COMPLIANCE: 'Compliance',
  SUPPORT: 'Support',
  OPERATIONS: 'Queues',
  SYSTEM: 'System',
};
