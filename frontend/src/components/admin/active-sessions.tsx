'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { toastError } from '@/lib/toast';
import { Laptop, Smartphone, Monitor } from 'lucide-react';
import { adminGet, adminDelete, adminError } from '@/lib/admin-api';
import { Panel, Badge, Button, Skeleton } from '@/components/ui/primitives';
import { ago } from '@/lib/format';

interface Session {
  id: string; userAgent: string | null; ip: string | null;
  createdAt: string; lastUsedAt: string | null; expiresAt: string;
}

/** Enough of a user agent to recognise your own device, without pretending to
 *  be device fingerprinting. */
function describe(ua: string | null) {
  if (!ua) return { label: 'Unknown device', Icon: Monitor };
  const mobile = /iPhone|Android|Mobile/i.test(ua);
  const os = /Mac OS X|Macintosh/i.test(ua) ? 'macOS'
    : /Windows/i.test(ua) ? 'Windows'
    : /Android/i.test(ua) ? 'Android'
    : /iPhone|iPad|iOS/i.test(ua) ? 'iOS'
    : /Linux/i.test(ua) ? 'Linux' : 'Unknown OS';
  const browser = /Edg\//i.test(ua) ? 'Edge'
    : /Chrome\//i.test(ua) ? 'Chrome'
    : /Safari\//i.test(ua) ? 'Safari'
    : /Firefox\//i.test(ua) ? 'Firefox' : 'Browser';
  return { label: `${browser} on ${os}`, Icon: mobile ? Smartphone : os === 'macOS' || os === 'Windows' ? Laptop : Monitor };
}

/**
 * The operator's own signed-in devices.
 *
 * The API has served these since sessions were introduced, with no way to see
 * or end one — so a session left open on a shared machine could only be closed
 * by waiting for it to expire.
 */
export function ActiveSessions() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'sessions'],
    queryFn: () => adminGet<Session[]>('/admin/sessions'),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => adminDelete(`/admin/sessions/${id}`),
    onSuccess: () => { toast.success('Session ended'); qc.invalidateQueries({ queryKey: ['admin', 'sessions'] }); },
    onError: (e) => toastError(e),
  });

  return (
    <Panel title={`Your active sessions — ${data?.length ?? 0}`}>
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : (data?.length ?? 0) === 0 ? (
        <p className="py-6 text-center text-[13px] text-ink-2">No other sessions are open.</p>
      ) : (
        <ul className="space-y-2">
          {(data ?? []).map((s, i) => {
            const { label, Icon } = describe(s.userAgent);
            return (
              <li key={s.id} className="flex items-center gap-3 rounded-xl border border-line bg-canvas px-3 py-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-soft text-violet-on">
                  <Icon size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-[13px] font-medium text-ink">
                    {label}
                    {i === 0 && <Badge tone="good">this device</Badge>}
                  </p>
                  <p className="truncate text-[11.5px] text-ink-2">
                    {s.ip ?? 'unknown IP'} · signed in {ago(s.createdAt)}
                    {s.lastUsedAt && <> · last used {ago(s.lastUsedAt)}</>}
                  </p>
                </div>
                <Button size="sm" variant="outline" loading={revoke.isPending && revoke.variables === s.id}
                        onClick={() => revoke.mutate(s.id)}>
                  End
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
