import {
  AlertTriangle, ArrowLeftRight, BadgeCheck, Banknote, BarChart3, Bell, CalendarClock, CandlestickChart, FlaskConical, KeyRound, LayoutDashboard, LifeBuoy, Link2, Megaphone, Network, Package, Percent, ScrollText, Settings, ShieldCheck, Ticket, TrendingUp, Users, Wallet, Inbox,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: typeof Users;
  /** Permission key the API also enforces. Absent = always visible. */
  perm?: string;
  /** Modules with no backend yet — shown, but routed to an honest empty state. */
  pending?: boolean;
}

export interface NavGroup {
  heading: string;
  items: NavItem[];
}

/**
 * The console navigation, grouped by what an operator is trying to do.
 *
 * It used to be twenty-five items in one flat list. Nothing was wrong with any
 * single entry, but a flat list of that length has no shape: finding "Payout
 * Engine" meant reading past twenty labels, and there was no way to tell at a
 * glance that Deposits and Payouts are the same kind of work while Audit Log
 * is not.
 *
 * The groups follow the operator's task, not the codebase's modules — money
 * movement together, whoever built it; everything that is a record of what
 * happened together, whatever it records.
 */
export const ADMIN_NAV: NavGroup[] = [
  { heading: 'Overview', items: [
    { href: '/admin',              label: 'Dashboard',        icon: LayoutDashboard, perm: 'dashboard.view' },
  ]},

  { heading: 'Members', items: [
    { href: '/admin/users',        label: 'Users',            icon: Users,           perm: 'users.view' },
    { href: '/admin/network',      label: 'Network',          icon: Network,         perm: 'users.view' },
    { href: '/admin/kyc',          label: 'KYC Verification', icon: BadgeCheck,      perm: 'kyc.view' },
    { href: '/admin/support',      label: 'Support Tickets',  icon: LifeBuoy,        perm: 'support.view' },
  ]},

  // The queues. Everything here either moves money or is waiting to.
  { heading: 'Money', items: [
    { href: '/admin/deposits',     label: 'Deposits',         icon: Inbox,           perm: 'deposits.view' },
    { href: '/admin/payouts',      label: 'Payouts',          icon: Banknote,        perm: 'withdrawals.view' },
    { href: '/admin/transactions', label: 'Transactions',     icon: ArrowLeftRight,  perm: 'users.view' },
    { href: '/admin/wallet',       label: 'Wallet',           icon: Wallet,          perm: 'deposits.view' },
    { href: '/admin/investments',  label: 'Investments',      icon: TrendingUp,      perm: 'users.view' },
    { href: '/admin/commissions',  label: 'Commissions',      icon: Percent,         perm: 'users.view' },
  ]},

  // What the platform pays, and what it would pay under other assumptions.
  { heading: 'Plan', items: [
    { href: '/admin/plans',        label: 'Plans',            icon: Package,         perm: 'plan.view' },
    { href: '/admin/draws',        label: 'Prize Draws',      icon: Ticket,          perm: 'plan.view' },
    { href: '/admin/dry-run',      label: 'Dry Run',          icon: FlaskConical,    perm: 'simulation.run' },
  ]},

  { heading: 'Operations', items: [
    { href: '/admin/jobs',         label: 'Payout Engine',    icon: CalendarClock,   perm: 'jobs.view' },
    { href: '/admin/chain',        label: 'On-chain',         icon: Link2,           perm: 'jobs.view' },
    { href: '/admin/reports',      label: 'Reports',          icon: BarChart3,       perm: 'reports.view' },
    { href: '/admin/trading',      label: 'Trading',          icon: CandlestickChart, perm: 'dashboard.view', pending: true },
  ]},

  // The record of what happened, and the controls over who can make it happen.
  { heading: 'System', items: [
    { href: '/admin/announcements',label: 'Announcements',    icon: Megaphone,       perm: 'announcements.view' },
    { href: '/admin/notifications',label: 'Notifications',    icon: Bell,            perm: 'dashboard.view' },
    { href: '/admin/errors',       label: 'Faults',           icon: AlertTriangle,   perm: 'errors.view' },
    { href: '/admin/audit',        label: 'Audit Log',        icon: ScrollText,      perm: 'audit.view' },
    { href: '/admin/access',       label: 'Roles & Access',   icon: ShieldCheck,     perm: 'roles.view' },
    { href: '/admin/settings',     label: 'Settings',         icon: Settings,        perm: 'settings.view' },
    { href: '/admin/security',     label: 'My Security',      icon: KeyRound,        perm: 'dashboard.view' },
  ]},
];

/** Flat, for anything that wants every destination without the grouping. */
export const NAV: NavItem[] = ADMIN_NAV.flatMap((g) => g.items);

export const PAGE_TITLE: Record<string, { title: string; subtitle: string }> = {
  '/admin':              { title: 'Dashboard',         subtitle: "Welcome back, Admin! Here's what's happening with your platform." },
  '/admin/users':        { title: 'Users',             subtitle: 'Every member on the platform, with balances and network position.' },
  '/admin/plans':        { title: 'Plans',             subtitle: 'Investment tiers, commission levels, ranks and affiliate offers.' },
  '/admin/investments':  { title: 'Investments',       subtitle: 'Active and completed packages across the platform.' },
  '/admin/trading':      { title: 'Trading',           subtitle: 'Live trading desk.' },
  '/admin/network':      { title: 'Network',           subtitle: 'Genealogy, team volume and level distribution.' },
  '/admin/commissions':  { title: 'Commissions',       subtitle: 'Direct sponsor and generation bonuses paid out.' },
  '/admin/deposits':     { title: 'Deposits',           subtitle: 'Reported deposits awaiting on-chain confirmation.' },
  '/admin/payouts':      { title: 'Payouts',           subtitle: 'Withdrawal requests, approvals and the 48-hour SLA.' },
  '/admin/transactions': { title: 'Transactions',      subtitle: 'The append-only ledger — every movement of value.' },
  '/admin/kyc':          { title: 'KYC Verification',  subtitle: 'Identity document review.' },
  '/admin/reports':      { title: 'Reports',           subtitle: 'Platform performance, liability and top earners.' },
  '/admin/wallet':       { title: 'Wallet',            subtitle: 'Deposits, balances held and platform position.' },
  '/admin/support':      { title: 'Support Tickets',   subtitle: 'Member queries and replies.' },
  '/admin/access':       { title: 'Roles & Access',    subtitle: 'Admin accounts, roles and permission grants.' },
  '/admin/jobs':         { title: 'Payout Engine',     subtitle: 'Daily accrual runs, what they paid and what was missed.' },
  '/admin/errors':       { title: 'Faults',            subtitle: 'Unhandled errors, grouped so one problem is one row.' },
  '/admin/audit':        { title: 'Audit Log',         subtitle: 'Every mutating action, with actor and before/after.' },
  '/admin/dry-run':      { title: 'Dry Run',           subtitle: 'Model the compensation plan against a synthetic member base.' },
  '/admin/draws':        { title: 'Prize Draws',      subtitle: 'Tickets earned by investing, with a result anyone can verify.' },
  '/admin/announcements':{ title: 'Announcements',     subtitle: 'Write once, reaches every member you choose.' },
  '/admin/notifications':{ title: 'Notifications',     subtitle: 'Approval queues, verification requests and platform health.' },
  '/admin/security':     { title: 'My Security',       subtitle: 'Two-factor authentication and the devices you are signed in on.' },
  '/admin/chain':        { title: 'On-chain',          subtitle: 'Deposit watching, hot wallet and outbound payouts.' },
  '/admin/settings':     { title: 'Settings',          subtitle: 'Runtime configuration that overrides deploy defaults.' },
};
