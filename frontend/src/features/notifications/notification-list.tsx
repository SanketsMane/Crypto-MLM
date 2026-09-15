'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Bell, CheckCheck, Inbox, Archive, RotateCcw, Loader2,
  Banknote, TrendingUp, Users, ShieldAlert, FileCheck, LifeBuoy, ListChecks, Activity,
} from 'lucide-react';
import { clsx } from 'clsx';
import { Card, CardHead, Button, Skeleton } from '@/components/ui/primitives';
import {
  useNotificationActions, useNotificationSummary, relativeTime,
  type Category, type Notification, type Severity, type Transport,
} from './use-notifications';

const CATEGORY_ICON: Record<Category, typeof Bell> = {
  MONEY: Banknote, EARNINGS: TrendingUp, NETWORK: Users, SECURITY: ShieldAlert,
  COMPLIANCE: FileCheck, SUPPORT: LifeBuoy, OPERATIONS: ListChecks, SYSTEM: Activity,
};

const SEVERITY_STYLE: Record<Severity, string> = {
  INFO: 'bg-canvas text-ink-2',
  SUCCESS: 'bg-good-soft text-good',
  WARNING: 'bg-warn-soft text-warn',
  CRITICAL: 'bg-bad-soft text-bad',
};

const MEMBER_TABS: { key: Category | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'MONEY', label: 'Money' },
  { key: 'EARNINGS', label: 'Earnings' },
  { key: 'NETWORK', label: 'Network' },
  { key: 'SECURITY', label: 'Security' },
  { key: 'COMPLIANCE', label: 'Compliance' },
  { key: 'SUPPORT', label: 'Support' },
];

const ADMIN_TABS: { key: Category | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'OPERATIONS', label: 'Queues' },
  { key: 'COMPLIANCE', label: 'Compliance' },
  { key: 'SUPPORT', label: 'Support' },
  { key: 'SYSTEM', label: 'System' },
  { key: 'MONEY', label: 'Money' },
];

/**
 * The full history, as opposed to the bell's recent twenty.
 *
 * Selection lives here rather than in the bell because bulk actions only make
 * sense against a list you can see all of — picking twelve items out of a
 * dropdown that scrolls is not a thing anyone wants to do.
 */
export function NotificationList({
  transport,
  variant = 'member',
}: {
  transport: Transport;
  variant?: 'member' | 'admin';
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Category | 'all'>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const summary = useNotificationSummary(transport);
  const actions = useNotificationActions(transport);
  const tabs = variant === 'admin' ? ADMIN_TABS : MEMBER_TABS;

  const list = useQuery<{ rows: Notification[]; nextCursor: string | null }>({
    queryKey: [transport.scope, 'notifications', 'list', tab, unreadOnly, showArchived],
    queryFn: () =>
      transport.get(transport.base, {
        take: 50,
        ...(tab !== 'all' ? { category: tab } : {}),
        ...(unreadOnly ? { unreadOnly: 'true' } : {}),
        ...(showArchived ? { includeArchived: 'true' } : {}),
      }),
  });

  const rows = list.data?.rows ?? [];
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));

  const runOnSelection = (fn: (ids: string[]) => void) => {
    fn([...selected]);
    setSelected(new Set());
  };

  const open = (n: Notification) => {
    if (!n.read) actions.markRead.mutate([n.id]);
    if (n.link) router.push(variant === 'admin' && !n.link.startsWith('/admin') ? `/admin${n.link}` : n.link);
  };

  return (
    <Card>
      <CardHead
        title="Notifications"
        subtitle={
          summary.data?.unread
            ? `${summary.data.unread} unread`
            : 'Everything here has been read.'
        }
        right={
          <Button
            variant="outline"
            disabled={!summary.data?.unread || actions.markAllRead.isPending}
            onClick={() => actions.markAllRead.mutate(tab === 'all' ? undefined : tab)}
          >
            <CheckCheck size={14} /> Mark all as read
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-1 border-b border-line px-5 pb-3">
        {tabs.map((t) => {
          const count = t.key === 'all' ? summary.data?.unread ?? 0 : summary.data?.byCategory?.[t.key] ?? 0;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => { setTab(t.key); setSelected(new Set()); }}
              className={clsx(
                'rounded-full px-3 py-1.5 text-[12.5px] font-medium transition',
                tab === t.key
                  ? 'bg-navy text-white dark:bg-gold dark:text-navy'
                  : 'text-ink-2 hover:bg-canvas hover:text-ink',
              )}
            >
              {t.label}
              {count > 0 && <span className="ml-1.5 opacity-70">{count}</span>}
            </button>
          );
        })}

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setUnreadOnly((v) => !v)}
            className={clsx(
              'rounded-full px-3 py-1.5 text-[12.5px] font-medium transition',
              unreadOnly ? 'bg-gold-soft text-gold-ink' : 'text-ink-3 hover:bg-canvas hover:text-ink',
            )}
          >
            Unread only
          </button>
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className={clsx(
              'rounded-full px-3 py-1.5 text-[12.5px] font-medium transition',
              showArchived ? 'bg-gold-soft text-gold-ink' : 'text-ink-3 hover:bg-canvas hover:text-ink',
            )}
          >
            <Archive size={13} className="mr-1 inline" />
            Dismissed
          </button>
        </div>
      </div>

      {/* The bulk bar only appears when there is a selection — a permanently
          visible toolbar of disabled buttons is just clutter. */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-canvas px-5 py-2.5">
          <span className="text-[12.5px] font-medium text-ink">
            {selected.size} selected
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <Button variant="outline" onClick={() => runOnSelection((ids) => actions.markRead.mutate(ids))}>
              Mark as read
            </Button>
            <Button variant="outline" onClick={() => runOnSelection((ids) => actions.archive.mutate(ids))}>
              <Archive size={14} /> Dismiss
            </Button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="rounded-[4px] px-2 py-1.5 text-[12px] text-ink-3 transition hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div>
        {list.isLoading ? (
          <div className="px-5 py-4"><Skeleton className="h-40" /></div>
        ) : !rows.length ? (
          <div className="grid place-items-center gap-2 px-6 py-14 text-center">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-canvas text-ink-3">
              <Inbox size={19} />
            </span>
            <p className="text-[14px] font-medium text-ink">
              {unreadOnly ? 'Nothing unread' : showArchived ? 'Nothing dismissed' : 'No notifications yet'}
            </p>
            <p className="max-w-sm text-[12.5px] leading-relaxed text-ink-2">
              {variant === 'admin'
                ? 'Approval queues, verification requests and platform health alerts appear here.'
                : 'Deposits, payouts, earnings and account changes appear here.'}
            </p>
          </div>
        ) : (
          <>
            <label className="flex items-center gap-2.5 border-b border-line px-5 py-2 text-[12px] text-ink-2">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="h-3.5 w-3.5 rounded border-line-strong accent-gold"
              />
              Select all on this page
            </label>

            <ul className="divide-y divide-line">
              {rows.map((n) => {
                const Icon = CATEGORY_ICON[n.category] ?? Bell;
                return (
                  <li
                    key={n.id}
                    className={clsx(
                      'flex items-start gap-3 px-5 py-3.5 transition',
                      !n.read && 'bg-gold/[0.035]',
                      n.archived && 'opacity-60',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(n.id)}
                      onChange={() => toggle(n.id)}
                      aria-label={`Select ${n.title}`}
                      className="mt-2.5 h-3.5 w-3.5 shrink-0 rounded border-line-strong accent-gold"
                    />

                    <span className={clsx('mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-[4px]', SEVERITY_STYLE[n.severity])}>
                      <Icon size={16} />
                    </span>

                    <button
                      type="button"
                      onClick={() => open(n)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className={clsx('text-[13.5px] leading-snug', !n.read ? 'font-semibold text-ink' : 'font-medium text-ink-2')}>
                          {n.title}
                        </span>
                        <span className="text-[11px] text-ink-3">{relativeTime(n.createdAt)}</span>
                      </span>
                      <span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink-2">
                        {n.body}
                      </span>
                    </button>

                    <div className="flex shrink-0 items-center gap-1">
                      {n.archived ? (
                        <span className="text-[11px] text-ink-3">Dismissed</span>
                      ) : n.read ? (
                        <button
                          type="button"
                          onClick={() => actions.markUnread.mutate(n.id)}
                          title="Mark as unread"
                          aria-label="Mark as unread"
                          className="grid h-7 w-7 place-items-center rounded-[3px] text-ink-3 transition hover:bg-canvas hover:text-ink"
                        >
                          <RotateCcw size={13} />
                        </button>
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-label="Unread" />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            {list.isFetching && (
              <div className="grid place-items-center py-3 text-ink-3">
                <Loader2 size={15} className="animate-spin" />
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
