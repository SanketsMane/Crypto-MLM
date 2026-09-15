import {
  LayoutDashboard, Package, TrendingUp, Wallet, BookOpen, Users, Network,
  Layers3, Trophy, Plane, ArrowDownToLine, ArrowUpFromLine, LifeBuoy, User, ShieldCheck, Bell, Share2, FileText, Gift, Ticket, Package as PackageIcon,
} from 'lucide-react';

export interface MemberNavItem { href: string; label: string; icon: typeof Users }
export interface MemberNavGroup { heading: string; items: MemberNavItem[] }

export const MEMBER_NAV: MemberNavGroup[] = [
  { heading: 'Overview', items: [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  ]},
  { heading: 'Earn', items: [
    { href: '/packages',    label: 'Packages',  icon: Package },
    { href: '/income',      label: 'Income',    icon: TrendingUp },
    { href: '/rank',        label: 'Rank',      icon: Trophy },
    { href: '/reward-cards', label: 'Rewards',  icon: Gift },
    { href: '/flyers-club',label: 'Offers',       icon: Plane },
    { href: '/draws',       label: 'Prize Draws', icon: Ticket },
  ]},
  { heading: 'Money', items: [
    { href: '/wallet',      label: 'Wallet',      icon: Wallet },
    { href: '/deposit',     label: 'Deposit',     icon: ArrowDownToLine },
    { href: '/withdrawals', label: 'Withdraw',    icon: ArrowUpFromLine },
    { href: '/passbook',    label: 'Passbook',    icon: BookOpen },
    { href: '/statement',   label: 'Statement',   icon: FileText },
  ]},
  { heading: 'Network', items: [
    { href: '/invite',        label: 'Invite',         icon: Share2 },
    { href: '/team',        label: 'My Team',    icon: Users },
    { href: '/genealogy',     label: 'Genealogy',      icon: Network },
    { href: '/team-packages', label: 'Team Packages',  icon: PackageIcon },
    { href: '/levels',      label: 'Level Status', icon: Layers3 },
  ]},
  { heading: 'Account', items: [
    { href: '/profile',       label: 'Profile',       icon: User },
    { href: '/notifications', label: 'Notifications', icon: Bell },
    { href: '/security',      label: 'Security',      icon: ShieldCheck },
    { href: '/support',     label: 'Support',  icon: LifeBuoy },
  ]},
];

export const MEMBER_PAGE: Record<string, { title: string; subtitle: string }> = {
  '/dashboard':    { title: 'Dashboard',     subtitle: 'Your earnings, packages and network at a glance.' },
  '/packages':     { title: 'Packages',      subtitle: 'Investment plans and the packages you hold.' },
  '/income':       { title: 'Income',        subtitle: 'Every payout you have received, and where it came from.' },
  '/reward-cards': { title: 'Rewards',       subtitle: 'Bonus cards that unlock as your investment grows.' },
  '/rank':         { title: 'Rank',          subtitle: 'Your position on the executive ladder and what unlocks next.' },
  '/draws':        { title: 'Prize Draws',   subtitle: 'Tickets earned by investing, and a result anyone can verify.' },
  '/flyers-club': { title: 'Affiliate offers', subtitle: 'Campaign rewards for team performance, open for a limited window.' },
  '/wallet':       { title: 'Wallet',        subtitle: 'Your three balances and how value moves between them.' },
  '/deposit':      { title: 'Deposit',       subtitle: 'Fund your account with USDT on BEP-20.' },
  '/withdrawals':  { title: 'Withdraw',      subtitle: 'Request a payout to your BEP-20 address.' },
  '/statement':    { title: 'Statement',     subtitle: 'A reconciled monthly summary you can print or file.' },
  '/passbook':     { title: 'Passbook',      subtitle: 'Your complete transaction history.' },
  '/invite':       { title: 'Invite',        subtitle: 'Your link, a QR code and something to send.' },
  '/team':         { title: 'My Team',       subtitle: 'Direct referrals, team volume and your legs.' },
  '/genealogy':    { title: 'Genealogy',     subtitle: 'Browse your downline as a tree, or level by level.' },
  '/team-packages':{ title: 'Team Packages', subtitle: 'Every package bought anywhere in your network.' },
  '/levels':       { title: 'Level Status',  subtitle: 'All 30 generation levels and what each one needs.' },
  '/profile':      { title: 'Profile',       subtitle: 'Your details and payout address.' },
  '/notifications':{ title: 'Notifications', subtitle: 'Everything the platform has told you, and what you want to hear about.' },
  '/security':     { title: 'Security',      subtitle: 'Password, two-factor authentication, devices and account activity.' },
  '/support':      { title: 'Support',       subtitle: 'Raise a ticket and track responses.' },
};
