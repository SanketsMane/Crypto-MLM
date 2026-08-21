'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { toastError } from '@/lib/toast';

export type Category =
  | 'MONEY' | 'EARNINGS' | 'NETWORK' | 'SECURITY'
  | 'COMPLIANCE' | 'SUPPORT' | 'OPERATIONS' | 'SYSTEM';

export type Severity = 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL';

export interface Notification {
  id: string;
  type: string;
  category: Category;
  severity: Severity;
  title: string;
  body: string;
  link: string | null;
  meta: Record<string, unknown> | null;
  read: boolean;
  archived: boolean;
  createdAt: string;
}

export interface Summary {
  unread: number;
  byCategory: Partial<Record<Category, number>>;
  hasCritical: boolean;
}

export interface Preference {
  category: Category;
  label: string;
  inApp: boolean;
  email: boolean;
  locked: boolean;
}

/** The two consoles talk to different base paths but the same API. */
export interface Transport {
  get: <T>(url: string, params?: Record<string, unknown>) => Promise<T>;
  post: <T>(url: string, body?: unknown) => Promise<T>;
  patch: <T>(url: string, body?: unknown) => Promise<T>;
  /** '/notifications' for members, '/admin/notifications' for operators. */
  base: string;
  /** Namespaces the cache so an admin tab and a member tab cannot collide. */
  scope: string;
}

/**
 * How often the bell asks whether anything has happened.
 *
 * Polling rather than a live socket, deliberately. A socket needs the access
 * token somewhere EventSource can send it — a query string, which then lands in
 * proxy logs — or a second token endpoint and connection lifecycle to maintain.
 * For a bell, the difference between instant and "within twenty seconds" is not
 * worth that, and polling degrades gracefully behind every proxy and load
 * balancer without special configuration.
 *
 * A hidden tab backs right off. Twenty tabs open in the background should not
 * cost twenty requests every twenty seconds.
 */
const POLL_ACTIVE_MS = 20_000;
const POLL_HIDDEN_MS = 120_000;

function usePollInterval() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const onChange = () => setHidden(document.visibilityState === 'hidden');
    onChange();
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  return hidden ? POLL_HIDDEN_MS : POLL_ACTIVE_MS;
}

export function useNotificationSummary(t: Transport) {
  const refetchInterval = usePollInterval();
  const seen = useRef<number | null>(null);

  const query = useQuery<Summary>({
    queryKey: [t.scope, 'notifications', 'summary'],
    queryFn: () => t.get(`${t.base}/summary`),
    refetchInterval,
    refetchOnWindowFocus: true,
    // A failed poll should not blank the badge — the last known count is a far
    // better answer than zero, which reads as "nothing is waiting".
    placeholderData: (prev) => prev,
  });

  // Something new arriving while you are looking at another page deserves a
  // toast; the bell alone is easy to miss. Only on an increase, and never on
  // the first load, or every page refresh would announce old news.
  useEffect(() => {
    const unread = query.data?.unread;
    if (unread === undefined) return;

    if (seen.current !== null && unread > seen.current) {
      const count = unread - seen.current;
      toast(count === 1 ? 'New notification' : `${count} new notifications`, {
        description: query.data?.hasCritical ? 'One needs your attention.' : undefined,
      });
    }
    seen.current = unread;
  }, [query.data?.unread, query.data?.hasCritical]);

  return query;
}

export function useNotifications(t: Transport, opts: { category?: Category; unreadOnly?: boolean } = {}) {
  return useQuery<{ rows: Notification[]; nextCursor: string | null }>({
    queryKey: [t.scope, 'notifications', 'list', opts.category ?? 'all', opts.unreadOnly ?? false],
    queryFn: () =>
      t.get(`${t.base}`, {
        take: 20,
        ...(opts.category ? { category: opts.category } : {}),
        ...(opts.unreadOnly ? { unreadOnly: 'true' } : {}),
      }),
  });
}

/** Everything the bell can do. */
export function useNotificationActions(t: Transport) {
  const qc = useQueryClient();
  const refresh = () => invalidate(qc, t.scope);

  // A button that appears to do nothing is worse than one that reports the
  // failure — the reader is left believing they have cleared something.
  const failed = (what: string) => (e: unknown) => toastError(e, `Could not ${what}.`);

  const markRead = useMutation({
    mutationFn: (ids: string[]) => t.post(`${t.base}/read`, { ids }),
    onSuccess: refresh,
    onError: failed('mark that as read'),
  });

  const markUnread = useMutation({
    mutationFn: (id: string) => t.post(`${t.base}/${id}/unread`),
    onSuccess: refresh,
    onError: failed('mark that as unread'),
  });

  const markAllRead = useMutation({
    mutationFn: (category?: Category) => t.post<{ updated: number }>(`${t.base}/read-all`, { category }),
    onSuccess: (d) => {
      refresh();
      toast.success(
        d.updated === 0 ? 'Nothing left to read'
          : d.updated === 1 ? '1 notification marked as read'
          : `${d.updated} notifications marked as read`,
      );
    },
    onError: failed('mark everything as read'),
  });

  const archive = useMutation({
    mutationFn: (ids: string[]) => t.post(`${t.base}/archive`, { ids }),
    onSuccess: refresh,
    onError: failed('dismiss that'),
  });

  const clearRead = useMutation({
    mutationFn: () => t.post<{ updated: number }>(`${t.base}/clear-read`),
    onSuccess: (d) => {
      refresh();
      toast.success(d.updated ? `Cleared ${d.updated} read notification${d.updated === 1 ? '' : 's'}` : 'Nothing to clear');
    },
    onError: failed('clear read notifications'),
  });

  return { markRead, markUnread, markAllRead, archive, clearRead };
}

export function useNotificationPreferences(t: Transport) {
  const qc = useQueryClient();

  const query = useQuery<Preference[]>({
    queryKey: [t.scope, 'notifications', 'preferences'],
    queryFn: () => t.get(`${t.base}/preferences`),
  });

  const update = useMutation({
    mutationFn: (body: { category: Category; inApp?: boolean; email?: boolean }) =>
      t.patch<Preference[]>(`${t.base}/preferences`, body),
    onSuccess: (data) => {
      qc.setQueryData([t.scope, 'notifications', 'preferences'], data);
      toast.success('Preferences saved');
    },
    onError: (e: unknown) => toastError(e, 'Your preference was not saved.'),
  });

  return { query, update };
}

const invalidate = (qc: QueryClient, scope: string) =>
  qc.invalidateQueries({ queryKey: [scope, 'notifications'] });

/** "3 minutes ago" — the only format that matters in a notification list. */
export function useRelativeTime(iso: string) {
  return useMemo(() => relativeTime(iso), [iso]);
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);

  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
