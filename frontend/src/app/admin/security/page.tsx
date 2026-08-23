'use client';

import { useQuery } from '@tanstack/react-query';
import { Monitor, LogOut } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { adminGet, adminDelete, adminPost } from '@/lib/admin-api';
import { Card, CardHead, Button, Skeleton, PageHeader } from '@/components/ui/primitives';
import { TwoFactorCard } from '@/features/security/two-factor-card';
import { adminTwoFactor } from '@/features/security/clients';
import { toastError } from '@/lib/toast';
import { useConfirmOk } from '@/components/ui/confirm';

interface Session {
  id: string; userAgent: string | null; ip: string | null;
  createdAt: string; lastUsedAt: string | null; expiresAt: string;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

function device(ua: string | null) {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : 'Browser';
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android'
    : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows'
    : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} on ${os}` : browser;
}

export default function AdminSecurityPage() {
  return (
    <>
      <PageHeader
        title="My security"
        subtitle="Protect the account that can move money. This page covers you, not the platform."
      />
      <div className="space-y-4">
        <TwoFactorCard
          client={adminTwoFactor}
          subtitle="A code from your authenticator app, as well as your password."
          // This account can adjust balances and approve payouts. Say so.
          emphasis
        />
        <SessionsCard />
      </div>
    </>
  );
}

function SessionsCard() {
  const sessions = useQuery<Session[]>({
    queryKey: ['admin', 'sessions'],
    queryFn: () => adminGet('/admin/sessions'),
  });

  const askConfirm = useConfirmOk();


  const end = useMutation({
    mutationFn: (id: string) => adminDelete(`/admin/sessions/${id}`),
    onSuccess: () => { toast.success('Session ended'); sessions.refetch(); },
    onError: (e) => toastError(e),
  });

  const endAll = useMutation({
    mutationFn: () => adminPost('/admin/logout'),
    onSuccess: () => { window.location.href = '/admin/login'; },
    onError: (e) => toastError(e),
  });

  return (
    <Card>
      <CardHead
        title="Signed-in devices"
        subtitle="Everywhere this console account is currently open."
        right={
          <Button variant="outline" onClick={async () => {
            if (!(await askConfirm({
              title: 'Sign out every other session?',
              body: 'All of your console sessions except this one are ended immediately.',
              confirmLabel: 'Sign out other sessions',
            }))) return;
            endAll.mutate();
          }} loading={endAll.isPending}>
            <LogOut size={14} /> Sign out
          </Button>
        }
      />
      <div className="px-5 pb-5">
        {sessions.isLoading ? <Skeleton className="h-20" /> : (
          <ul className="divide-y divide-line">
            {(sessions.data ?? []).map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-canvas text-ink-2">
                  <Monitor size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-ink">{device(s.userAgent)}</p>
                  <p className="mt-0.5 text-[11.5px] text-ink-3">
                    {s.ip ?? 'unknown IP'} · started {when(s.createdAt)}
                  </p>
                </div>
                <Button variant="outline" onClick={async () => {
                  if (!(await askConfirm({
                    title: 'End this session?',
                    body: 'That device is signed out immediately and must authenticate again.',
                    confirmLabel: 'End session',
                  }))) return;
                  end.mutate(s.id);
                }}>End</Button>
              </li>
            ))}
            {!sessions.data?.length && <li className="py-3 text-[13px] text-ink-2">No active sessions.</li>}
          </ul>
        )}
      </div>
    </Card>
  );
}
