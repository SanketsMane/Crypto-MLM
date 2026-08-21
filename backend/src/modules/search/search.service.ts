import { prisma } from '../../core/db.js';
import { getDownline } from '../../core/tree.js';

/**
 * Search.
 *
 * Both consoles had a search box in the header that was never wired to
 * anything — it accepted typing and silently did nothing. This is what they
 * were promising.
 *
 * Two rules shape it:
 *
 *   • **Scoped by who is asking.** A member searches their own downline and
 *     their own transactions. The scoping lives in the WHERE clause, not in a
 *     filter applied afterwards, so there is no path where a wider result set
 *     is fetched and then trimmed.
 *
 *   • **Grouped, not ranked into one list.** "FX1234" could be a member or a
 *     transaction reference; showing both under headings is more useful than
 *     guessing which one was meant.
 */

const LIMIT_PER_GROUP = 5;
const MIN_QUERY = 2;

export interface Hit {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  badge?: string;
}
export interface Group {
  key: string;
  label: string;
  hits: Hit[];
}

const money = (v: unknown) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const name = (f: string, l: string | null, code: string) => [f, l].filter(Boolean).join(' ') || code;

// ── operator search ───────────────────────────────────────────────────────

export async function forAdmin(q: string): Promise<Group[]> {
  const query = q.trim();
  if (query.length < MIN_QUERY) return [];

  const contains = { contains: query, mode: 'insensitive' as const };
  const upper = query.toUpperCase();

  const [members, withdrawals, deposits, tickets, plans] = await Promise.all([
    prisma.user.findMany({
      where: {
        OR: [
          { userCode: { contains: upper } },
          { email: contains },
          { firstName: contains },
          { lastName: contains },
          { phone: contains },
          { walletAddress: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: LIMIT_PER_GROUP,
      select: {
        id: true, userCode: true, email: true, firstName: true, lastName: true,
        status: true, totalInvested: true,
      },
    }),

    prisma.withdrawal.findMany({
      where: {
        OR: [
          { reference: { contains: upper } },
          { txHash: contains },
          { walletAddress: contains },
          { user: { userCode: { contains: upper } } },
        ],
      },
      take: LIMIT_PER_GROUP,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, reference: true, amount: true, status: true,
        user: { select: { userCode: true } },
      },
    }),

    prisma.deposit.findMany({
      where: {
        OR: [
          { reference: { contains: upper } },
          { txHash: contains },
          { user: { userCode: { contains: upper } } },
        ],
      },
      take: LIMIT_PER_GROUP,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, reference: true, amount: true, status: true,
        user: { select: { userCode: true } },
      },
    }),

    prisma.supportTicket.findMany({
      where: {
        OR: [{ subject: contains }, { user: { userCode: { contains: upper } } }, { user: { email: contains } }],
      },
      take: LIMIT_PER_GROUP,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, subject: true, status: true, user: { select: { userCode: true } } },
    }),

    prisma.packagePlan.findMany({
      where: { name: contains },
      take: LIMIT_PER_GROUP,
      select: { id: true, name: true, amount: true, isActive: true },
    }),
  ]);

  return compact([
    {
      key: 'members', label: 'Members',
      hits: members.map((m) => ({
        id: m.id,
        title: name(m.firstName, m.lastName, m.userCode),
        subtitle: `${m.userCode} · ${m.email} · ${money(m.totalInvested)} invested`,
        href: `/admin/users/${m.id}`,
        badge: m.status === 'ACTIVE' ? undefined : m.status,
      })),
    },
    {
      key: 'withdrawals', label: 'Withdrawals',
      hits: withdrawals.map((w) => ({
        id: w.id,
        title: `${money(w.amount)} — ${w.user.userCode}`,
        subtitle: w.reference,
        href: '/admin/withdrawals',
        badge: w.status,
      })),
    },
    {
      key: 'deposits', label: 'Deposits',
      hits: deposits.map((d) => ({
        id: d.id,
        title: `${money(d.amount)} — ${d.user.userCode}`,
        subtitle: d.reference,
        href: '/admin/deposits',
        badge: d.status,
      })),
    },
    {
      key: 'tickets', label: 'Support tickets',
      hits: tickets.map((t) => ({
        id: t.id,
        title: t.subject,
        subtitle: t.user.userCode,
        href: `/admin/support?ticket=${t.id}`,
        badge: t.status,
      })),
    },
    {
      key: 'plans', label: 'Packages',
      hits: plans.map((p) => ({
        id: p.id,
        title: p.name,
        subtitle: money(p.amount),
        href: '/admin/plans',
        badge: p.isActive ? undefined : 'INACTIVE',
      })),
    },
  ]);
}

// ── member search ─────────────────────────────────────────────────────────

/**
 * A member's search covers their own network and their own money, plus the
 * pages of the app — jumping to a screen is the most common thing anyone types
 * into a search box, and a search that cannot do it feels broken.
 */
const MEMBER_PAGES: { title: string; subtitle: string; href: string; terms: string }[] = [
  { title: 'Dashboard',     subtitle: 'Earnings, packages and network at a glance', href: '/dashboard',    terms: 'dashboard home overview' },
  { title: 'Packages',      subtitle: 'Investment plans and what you hold',         href: '/packages',     terms: 'packages plans invest buy' },
  { title: 'Income',        subtitle: 'Every payout and where it came from',        href: '/income',       terms: 'income earnings payouts roi bonus' },
  { title: 'Wallet',        subtitle: 'Your balances and transfers',                href: '/wallet',       terms: 'wallet balance transfer funds' },
  { title: 'Deposit',       subtitle: 'Fund your account',                          href: '/deposit',      terms: 'deposit fund add money topup' },
  { title: 'Withdraw',      subtitle: 'Request a payout',                           href: '/withdrawals',  terms: 'withdraw payout cash out' },
  { title: 'Passbook',      subtitle: 'Complete transaction history',               href: '/passbook',     terms: 'passbook history statement ledger' },
  { title: 'My Team',       subtitle: 'Referrals, volume and legs',                 href: '/team',         terms: 'team referrals downline network' },
  { title: 'Genealogy',     subtitle: 'Browse your downline',                       href: '/genealogy',    terms: 'genealogy tree downline levels' },
  { title: 'Level Status',  subtitle: 'All 30 generation levels',                   href: '/levels',       terms: 'levels generation unlock' },
  { title: 'Rank',          subtitle: 'Your position and what unlocks next',        href: '/rank',         terms: 'rank ladder achievement' },
  { title: 'Roaming Club',  subtitle: 'Travel rewards',                             href: '/roaming-club', terms: 'roaming club travel reward trip' },
  { title: 'Notifications', subtitle: 'Everything we have told you',                href: '/notifications',terms: 'notifications alerts bell' },
  { title: 'Security',      subtitle: 'Password, two-factor and devices',           href: '/security',     terms: 'security password 2fa two factor devices sessions' },
  { title: 'Profile',       subtitle: 'Your details and payout address',            href: '/profile',      terms: 'profile account details address' },
  { title: 'Support',       subtitle: 'Raise a ticket',                             href: '/support',      terms: 'support help ticket contact' },
];

export async function forMember(userId: string, q: string): Promise<Group[]> {
  const query = q.trim();
  if (query.length < MIN_QUERY) return [];

  const lower = query.toLowerCase();
  const upper = query.toUpperCase();

  const pages = MEMBER_PAGES
    .filter((p) => p.terms.includes(lower) || p.title.toLowerCase().includes(lower))
    .slice(0, LIMIT_PER_GROUP)
    .map((p) => ({ id: p.href, title: p.title, subtitle: p.subtitle, href: p.href }));

  // The downline is resolved from the materialised path, so this stays one
  // query however deep the network goes.
  const downline = await getDownline(userId, 30);
  const people = downline
    .filter((d) =>
      d.userCode.includes(upper) ||
      [d.firstName, d.lastName].filter(Boolean).join(' ').toLowerCase().includes(lower))
    .slice(0, LIMIT_PER_GROUP);

  const [entries, tickets] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where: { userId, OR: [{ reference: { contains: upper } }, { description: { contains: query, mode: 'insensitive' } }] },
      take: LIMIT_PER_GROUP,
      orderBy: { createdAt: 'desc' },
      select: { id: true, reference: true, description: true, amount: true, direction: true, category: true },
    }),
    prisma.supportTicket.findMany({
      where: { userId, subject: { contains: query, mode: 'insensitive' } },
      take: LIMIT_PER_GROUP,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, subject: true, status: true },
    }),
  ]);

  return compact([
    { key: 'pages', label: 'Go to', hits: pages },
    {
      key: 'team', label: 'Your team',
      hits: people.map((d) => ({
        id: d.id,
        title: name(d.firstName, d.lastName, d.userCode),
        subtitle: `${d.userCode} · ${money(d.totalInvested)} invested`,
        href: '/genealogy',
        badge: d.status === 'ACTIVE' ? undefined : d.status,
      })),
    },
    {
      key: 'transactions', label: 'Transactions',
      hits: entries.map((e) => ({
        id: e.id,
        title: `${e.direction === 'CREDIT' ? '+' : '−'}${money(e.amount)} — ${e.description}`,
        subtitle: e.reference,
        href: '/passbook',
        badge: e.category,
      })),
    },
    {
      key: 'tickets', label: 'Your tickets',
      hits: tickets.map((t) => ({
        id: t.id,
        title: t.subject,
        subtitle: 'Support ticket',
        href: `/support?ticket=${t.id}`,
        badge: t.status,
      })),
    },
  ]);
}

const compact = (groups: Group[]) => groups.filter((g) => g.hits.length > 0);
