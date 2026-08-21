'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { toastError } from '@/lib/toast';
import {
  ShieldCheck, ShieldAlert, KeyRound, Monitor, Copy, Check,
  LogOut, History, AlertTriangle,
} from 'lucide-react';
import { get, post, del, apiErrorMessage } from '@/lib/api';
import { Card, CardHead, Button, Badge, Skeleton, controlCls } from '@/components/ui/primitives';
import { TwoFactorCard } from '@/features/security/two-factor-card';
import { VerifyEmailCard } from '@/features/security/verify-email-card';
import { memberTwoFactor } from '@/features/security/clients';
import { NotificationPreferences } from '@/features/notifications/notification-preferences';
import { PrivacyCard } from '@/features/privacy/privacy-card';
import { memberTransport } from '@/features/notifications/transports';

interface TwoFactorStatus {
  enabled: boolean;
  enabledAt: string | null;
  pendingSetup: boolean;
  recoveryCodesRemaining: number;
}
interface Session {
  id: string; userAgent: string | null; ip: string | null;
  createdAt: string; lastUsedAt: string | null; expiresAt: string;
}
interface Activity {
  id: string; event: string; summary: string;
  ip: string | null; userAgent: string | null; byOperator: boolean; createdAt: string;
}

/** Events worth flagging in red — the ones that matter if they were not you. */
const ALARMING = new Set([
  'PAYOUT_ADDRESS_CHANGED', 'PASSWORD_CHANGED', 'TWO_FACTOR_DISABLED',
  'TWO_FACTOR_RECOVERY_USED', 'SIGN_IN_FAILED',
]);

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

/** "Chrome on macOS" out of a user-agent string, without a parser dependency. */
function device(ua: string | null) {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari'
    : /Firefox\//.test(ua) ? 'Firefox' : 'Browser';
  const os = /iPhone|iPad/.test(ua) ? 'iOS'
    : /Android/.test(ua) ? 'Android'
    : /Mac OS X/.test(ua) ? 'macOS'
    : /Windows/.test(ua) ? 'Windows'
    : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} on ${os}` : browser;
}

export default function SecurityPage() {
  return (
    <div className="space-y-4">
      {/* Only rendered while unverified — it removes itself once done. */}
      <VerifyEmailCard />

      <div className="grid gap-4 lg:grid-cols-2">
        <PasswordCard />
        <TwoFactorCard
          client={memberTwoFactor}
          subtitle="A code from your authenticator app, as well as your password."
        />
      </div>
      <NotificationPreferences transport={memberTransport} />
      <PrivacyCard />
      <SessionsCard />
      <ActivityCard />
    </div>
  );
}

// ── password ──

function PasswordCard() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');

  const change = useMutation({
    mutationFn: () => post('/auth/change-password', { currentPassword: current, newPassword: next }),
    onSuccess: () => {
      toast.success('Password changed — you have been signed out on other devices');
      setCurrent(''); setNext(''); setConfirm('');
    },
    onError: (e) => toastError(e),
  });

  const mismatch = confirm.length > 0 && next !== confirm;
  const weak = next.length > 0 && !(next.length >= 8 && /[a-z]/.test(next) && /[A-Z]/.test(next) && /\d/.test(next));

  return (
    <Card>
      <CardHead title="Password" subtitle="Changing it signs you out everywhere else." />
      <form
        className="space-y-3 px-5 pb-5"
        onSubmit={(e) => { e.preventDefault(); change.mutate(); }}
      >
        <label className="block">
          <span className="mb-1.5 block text-[12px] font-medium text-ink-2">Current password</span>
          <input type="password" autoComplete="current-password" value={current}
            onChange={(e) => setCurrent(e.target.value)} className={`${controlCls} h-11 w-full`} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[12px] font-medium text-ink-2">New password</span>
          <input type="password" autoComplete="new-password" value={next}
            onChange={(e) => setNext(e.target.value)} className={`${controlCls} h-11 w-full`} />
          {weak && (
            <span className="mt-1 block text-[11.5px] text-ink-3">
              At least 8 characters, with an uppercase letter, a lowercase letter and a number.
            </span>
          )}
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[12px] font-medium text-ink-2">Confirm new password</span>
          <input type="password" autoComplete="new-password" value={confirm}
            onChange={(e) => setConfirm(e.target.value)} className={`${controlCls} h-11 w-full`} />
          {mismatch && <span className="mt-1 block text-[11.5px] text-bad">These do not match.</span>}
        </label>
        <Button type="submit" loading={change.isPending}
          disabled={!current || !next || mismatch || weak}>
          Change password
        </Button>
      </form>
    </Card>
  );
}

// ── sessions ──

function SessionsCard() {
  const qc = useQueryClient();
  const sessions = useQuery<Session[]>({ queryKey: ['sessions'], queryFn: () => get('/auth/sessions') });

  const end = useMutation({
    mutationFn: (id: string) => del(`/auth/sessions/${id}`),
    onSuccess: () => { toast.success('Session ended'); qc.invalidateQueries({ queryKey: ['sessions'] }); },
    onError: (e) => toastError(e),
  });

  const endAll = useMutation({
    mutationFn: () => post('/auth/logout-all'),
    onSuccess: () => { toast.success('Signed out everywhere — sign in again'); window.location.href = '/login'; },
    onError: (e) => toastError(e),
  });

  return (
    <Card>
      <CardHead
        title="Devices"
        subtitle="Everywhere you are currently signed in."
        right={
          <Button type="button" variant="outline" onClick={() => endAll.mutate()} loading={endAll.isPending}>
            <LogOut size={14} /> Sign out everywhere
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
                <Button type="button" variant="outline" onClick={() => end.mutate(s.id)}>End</Button>
              </li>
            ))}
            {!sessions.data?.length && (
              <li className="py-3 text-[13px] text-ink-2">No active sessions.</li>
            )}
          </ul>
        )}
      </div>
    </Card>
  );
}

// ── activity ──

function ActivityCard() {
  const activity = useQuery<{ total: number; rows: Activity[] }>({
    queryKey: ['activity'],
    queryFn: () => get('/auth/activity', { take: 30 }),
  });

  return (
    <Card>
      <CardHead
        title="Recent activity"
        subtitle="If something here was not you, change your password and contact support."
      />
      <div className="px-5 pb-5">
        {activity.isLoading ? <Skeleton className="h-32" /> : (
          <ul className="divide-y divide-line">
            {(activity.data?.rows ?? []).map((r) => (
              <li key={r.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                  ALARMING.has(r.event) ? 'bg-warn-soft text-warn' : 'bg-canvas text-ink-3'}`}>
                  {ALARMING.has(r.event) ? <AlertTriangle size={14} /> : <History size={14} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] leading-snug text-ink">{r.summary}</p>
                  <p className="mt-0.5 text-[11.5px] text-ink-3">
                    {when(r.createdAt)}
                    {r.ip ? ` · ${r.ip}` : ''}
                    {r.userAgent ? ` · ${device(r.userAgent)}` : ''}
                  </p>
                </div>
                {r.byOperator && <Badge tone="info">By support</Badge>}
              </li>
            ))}
            {!activity.data?.rows.length && (
              <li className="py-3 text-[13px] text-ink-2">Nothing recorded yet.</li>
            )}
          </ul>
        )}
      </div>
    </Card>
  );
}
