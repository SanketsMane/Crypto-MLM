'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bell, Check, CheckCheck, Settings2, X, Inbox, Loader2,
  Banknote, TrendingUp, Users, ShieldAlert, FileCheck, LifeBuoy, ListChecks, Activity,
} from 'lucide-react';
import { clsx } from 'clsx';
import {
  useNotificationActions, useNotifications, useNotificationSummary,
  relativeTime,
  type Category, type Notification, type Severity, type Transport,
} from './use-notifications';

/** One icon per category, so the list is scannable without reading it. */
const CATEGORY_ICON: Record<Category, typeof Bell> = {
  MONEY: Banknote,
  EARNINGS: TrendingUp,
  NETWORK: Users,
  SECURITY: ShieldAlert,
  COMPLIANCE: FileCheck,
  SUPPORT: LifeBuoy,
  OPERATIONS: ListChecks,
  SYSTEM: Activity,
};

/**
 * Severity drives colour, category drives the icon.
 *
 * Deliberately restrained: if half the list is red, none of it is. Only
 * CRITICAL gets the alarming treatment, and only a handful of types can be
 * critical at all.
 */
const SEVERITY_STYLE: Record<Severity, string> = {
  INFO: 'bg-canvas text-ink-2',
  SUCCESS: 'bg-good-soft text-good',
  WARNING: 'bg-warn-soft text-warn',
  CRITICAL: 'bg-bad-soft text-bad',
};

const FILTERS: { key: Category | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'MONEY', label: 'Money' },
  { key: 'EARNINGS', label: 'Earnings' },
  { key: 'SECURITY', label: 'Security' },
];

const ADMIN_FILTERS: { key: Category | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'OPERATIONS', label: 'Queues' },
  { key: 'COMPLIANCE', label: 'Compliance' },
  { key: 'SYSTEM', label: 'System' },
];

export function NotificationBell({
  transport,
  settingsHref,
  variant = 'member',
}: {
  transport: Transport;
  settingsHref: string;
  variant?: 'member' | 'admin';
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Category | 'all'>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const summary = useNotificationSummary(transport);
  const list = useNotifications(transport, {
    category: filter === 'all' ? undefined : filter,
    unreadOnly,
  });
  const actions = useNotificationActions(transport);

  // Close on an outside click or Escape — a panel that traps you is worse than
  // no panel.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const unread = summary.data?.unread ?? 0;
  const critical = summary.data?.hasCritical ?? false;
  const filters = variant === 'admin' ? ADMIN_FILTERS : FILTERS;

  const openItem = (n: Notification) => {
    if (!n.read) actions.markRead.mutate([n.id]);
    if (n.link) {
      setOpen(false);
      router.push(variant === 'admin' && !n.link.startsWith('/admin') ? `/admin${n.link}` : n.link);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        className={clsx(
          'relative grid h-10 w-10 place-items-center rounded-full transition',
          open ? 'bg-canvas text-ink' : 'text-ink-2 hover:bg-canvas hover:text-ink',
        )}
      >
        <Bell size={19} />
        {unread > 0 && (
          <span
            className={clsx(
              'absolute right-1 top-1 grid h-[17px] min-w-[17px] place-items-center rounded-full px-1 text-[9.5px] font-bold text-white',
              'ring-2 ring-card',
              critical ? 'bg-bad' : 'bg-gold',
            )}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className={clsx(
            'absolute right-0 z-50 mt-2 w-[min(calc(100vw-2rem),380px)] overflow-hidden rounded-[14px]',
            'border border-line bg-card shadow-[0_18px_50px_-12px_rgba(7,20,38,0.28)]',
          )}
        >
          <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <div className="min-w-0">
              <h2 className="text-[14.5px] font-semibold leading-tight text-ink">Notifications</h2>
              <p className="mt-0.5 text-[11.5px] text-ink-2">
                {unread === 0 ? 'You are all caught up' : `${unread} unread`}
              </p>
            </div>
            <div className="flex items-center gap-0.5">
              <Link
                href={settingsHref}
                onClick={() => setOpen(false)}
                title="Notification settings"
                className="grid h-8 w-8 place-items-center rounded-lg text-ink-3 transition hover:bg-canvas hover:text-ink"
              >
                <Settings2 size={15} />
              </Link>
              <button
                type="button" onClick={() => setOpen(false)} aria-label="Close"
                className="grid h-8 w-8 place-items-center rounded-lg text-ink-3 transition hover:bg-canvas hover:text-ink"
              >
                <X size={15} />
              </button>
            </div>
          </header>

          <div className="flex items-center gap-1 overflow-x-auto border-b border-line px-3 py-2">
            {filters.map((f) => {
              const count = f.key === 'all' ? unread : summary.data?.byCategory?.[f.key] ?? 0;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={clsx(
                    'shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-medium transition',
                    filter === f.key
                      ? 'bg-navy text-white dark:bg-gold dark:text-navy'
                      : 'text-ink-2 hover:bg-canvas hover:text-ink',
                  )}
                >
                  {f.label}
                  {count > 0 && <span className="ml-1 opacity-70">{count}</span>}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setUnreadOnly((v) => !v)}
              className={clsx(
                'ml-auto shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-medium transition',
                unreadOnly ? 'bg-gold-soft text-gold-ink' : 'text-ink-3 hover:bg-canvas hover:text-ink',
              )}
            >
              Unread only
            </button>
          </div>

          <div className="max-h-[min(60vh,420px)] overflow-y-auto overscroll-contain">
            {list.isLoading ? (
              <div className="grid place-items-center py-10 text-ink-3">
                <Loader2 size={18} className="animate-spin" />
              </div>
            ) : !list.data?.rows.length ? (
              <div className="grid place-items-center gap-2 px-6 py-10 text-center">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-canvas text-ink-3">
                  <Inbox size={18} />
                </span>
                <p className="text-[13px] font-medium text-ink">
                  {unreadOnly ? 'Nothing unread' : 'No notifications yet'}
                </p>
                <p className="text-[11.5px] leading-relaxed text-ink-2">
                  {unreadOnly
                    ? 'Everything here has been read.'
                    : 'Deposits, payouts and account changes will show up here.'}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {list.data.rows.map((n) => (
                  <Row key={n.id} n={n} onOpen={openItem} onArchive={(id) => actions.archive.mutate([id])} />
                ))}
              </ul>
            )}
          </div>

          <footer className="flex items-center justify-between gap-2 border-t border-line px-3 py-2.5">
            <button
              type="button"
              disabled={unread === 0 || actions.markAllRead.isPending}
              onClick={() => actions.markAllRead.mutate(filter === 'all' ? undefined : filter)}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-medium text-ink-2 transition hover:bg-canvas hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              <CheckCheck size={14} />
              Mark all as read
            </button>
            <Link
              href={variant === 'admin' ? '/admin/notifications' : '/notifications'}
              onClick={() => setOpen(false)}
              className="rounded-lg px-2 py-1.5 text-[12px] font-medium text-violet transition hover:underline"
            >
              View all
            </Link>
          </footer>
        </div>
      )}
    </div>
  );
}

function Row({
  n, onOpen, onArchive,
}: {
  n: Notification;
  onOpen: (n: Notification) => void;
  onArchive: (id: string) => void;
}) {
  const Icon = CATEGORY_ICON[n.category] ?? Bell;

  return (
    <li className={clsx('group relative transition', !n.read && 'bg-gold/[0.035]')}>
      <button
        type="button"
        onClick={() => onOpen(n)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-canvas"
      >
        <span className={clsx('mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg', SEVERITY_STYLE[n.severity])}>
          <Icon size={15} />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className={clsx('truncate text-[13px] leading-snug', !n.read ? 'font-semibold text-ink' : 'font-medium text-ink-2')}>
              {n.title}
            </span>
            <span className="ml-auto shrink-0 text-[10.5px] text-ink-3">{relativeTime(n.createdAt)}</span>
          </span>
          <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-2 line-clamp-2">
            {n.body}
          </span>
        </span>

        {/* An unread dot as well as the weight change — colour alone is not a
            signal everyone can see. */}
        {!n.read && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" aria-label="Unread" />}
      </button>

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onArchive(n.id); }}
        aria-label="Dismiss"
        title="Dismiss"
        className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-md bg-card text-ink-3 opacity-0 shadow-sm transition hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Check size={13} />
      </button>
    </li>
  );
}
