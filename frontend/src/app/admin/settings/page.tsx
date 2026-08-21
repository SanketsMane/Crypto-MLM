'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { toastError } from '@/lib/toast';
import { clsx } from 'clsx';
import { RotateCcw, Zap } from 'lucide-react';
import { adminGet, adminPut, adminDelete, adminError } from '@/lib/admin-api';
import { NotificationPreferences } from '@/features/notifications/notification-preferences';
import { adminTransport } from '@/features/notifications/transports';
import { Card, CardHead, PageHeader, Badge, Button, Skeleton } from '@/components/ui/primitives';

interface Row {
  key: string; value: string; isDefault: boolean; default: string | null;
  group: string; label: string; help: string; type: string; enforcedIn: string;
  min?: number; max?: number;
}

const WEEKDAYS = [
  { n: 1, s: 'Mon' }, { n: 2, s: 'Tue' }, { n: 3, s: 'Wed' }, { n: 4, s: 'Thu' },
  { n: 5, s: 'Fri' }, { n: 6, s: 'Sat' }, { n: 7, s: 'Sun' },
];

export default function SettingsPage() {
  const qc = useQueryClient();
  const { data: payload, isLoading } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => adminGet<{ settings: Row[]; yourIp: string | null }>('/admin/settings'),
  });
  const data = payload?.settings;
  const [edits, setEdits] = useState<Record<string, string>>({});

  const done = () => { qc.invalidateQueries({ queryKey: ['admin', 'settings'] }); setEdits({}); };

  const save = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) => adminPut(`/admin/settings/${key}`, { value }),
    onSuccess: () => { toast.success('Saved — live on the next request, no restart'); done(); },
    onError: (e) => toastError(e),
  });
  const reset = useMutation({
    mutationFn: (key: string) => adminDelete(`/admin/settings/${key}`),
    onSuccess: () => { toast.success('Restored to the deploy default'); done(); },
    onError: (e) => toastError(e),
  });

  const groups = [...new Set((data ?? []).map((r) => r.group))];
  const valueOf = (r: Row) => edits[r.key] ?? r.value;
  const dirty = (r: Row) => valueOf(r) !== r.value;
  const set = (key: string, value: string) => setEdits((s) => ({ ...s, [key]: value }));

  const field =
    'h-9 w-full rounded-[9px] border border-field-line bg-field px-3 text-[13px] tabular-nums text-ink outline-none ' +
    'transition placeholder:text-field-ph focus:border-gold focus:ring-4 focus:ring-gold/15';

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Runtime configuration. These values override the deploy defaults at read time — a change is live on the next request with no restart, and every edit is audited."
      />

      {isLoading ? (
        <div className="space-y-3.5">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-52" />)}</div>
      ) : (
        <div className="space-y-3.5">
          {groups.map((group) => (
            <Card key={group}>
              <CardHead title={group} />
              <div className="divide-y divide-line-soft border-t border-line">
                {(data ?? []).filter((r) => r.group === group).map((r) => (
                  <div key={r.key} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-start">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[13.5px] font-medium text-ink">{r.label}</p>
                        {!r.isDefault && <Badge tone="info">overridden</Badge>}
                      </div>
                      <p className="mt-0.5 max-w-[64ch] text-[12px] leading-relaxed text-ink-2">{r.help}</p>
                      {/* the contract that was missing before: what this actually changes */}
                      <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-3">
                        <Zap size={11} className="text-gold" />
                        Enforced in <span className="font-medium text-ink-2">{r.enforcedIn}</span>
                        <span aria-hidden>·</span>
                        <code className="font-mono text-[10.5px]">{r.key}</code>
                        {!r.isDefault && r.default && (
                          <>
                            <span aria-hidden>·</span>
                            <span>default {r.default}</span>
                          </>
                        )}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2 lg:justify-end">
                      {r.type === 'bool' ? (
                        <div className="flex gap-1.5">
                          {([['true', 'On'], ['false', 'Off']] as const).map(([v, label]) => (
                            <button key={v} onClick={() => set(r.key, v)} aria-pressed={valueOf(r) === v}
                              className={clsx('h-9 w-14 rounded-[9px] border text-[12.5px] font-medium transition',
                                valueOf(r) === v
                                  ? 'border-gold bg-gold text-gold-on'
                                  : 'border-line bg-card text-ink-2 hover:border-line-strong hover:text-ink')}>
                              {label}
                            </button>
                          ))}
                        </div>
                      ) : r.type === 'weekdays' ? (
                        <div className="flex flex-wrap gap-1">
                          {WEEKDAYS.map((d) => {
                            const days = valueOf(r).split(',').filter(Boolean).map(Number);
                            const on = days.includes(d.n);
                            return (
                              <button key={d.n} aria-pressed={on}
                                onClick={() => set(r.key, (on ? days.filter((x) => x !== d.n) : [...days, d.n]).sort((a, b) => a - b).join(','))}
                                className={clsx('h-9 w-11 rounded-[9px] border text-[11.5px] font-medium transition',
                                  on ? 'border-gold bg-gold text-gold-on'
                                     : 'border-line bg-card text-ink-3 hover:border-line-strong hover:text-ink')}>
                                {d.s}
                              </button>
                            );
                          })}
                        </div>
                      ) : r.type === 'text' ? (
                        // Free text needs the width numbers do not — a message
                        // or a list of CIDR ranges in a 150px box is unusable.
                        <label className="flex min-w-0 flex-1 flex-col gap-1">
                          <span className="sr-only">{r.label}</span>
                          <textarea
                            value={valueOf(r)}
                            rows={2}
                            onChange={(e) => set(r.key, e.target.value)}
                            className={clsx(field, 'w-full resize-y py-2 font-normal')}
                          />
                          {r.key === 'ADMIN_IP_ALLOWLIST' && (
                            <span className="text-[11px] text-ink-3">
                              Your address right now is{' '}
                              <code className="font-mono text-ink-2">{payload?.yourIp ?? 'unknown'}</code>.
                              Saving a list that excludes it is refused.
                            </span>
                          )}
                        </label>
                      ) : (
                        <label className="relative flex w-[150px] items-center">
                          <span className="sr-only">{r.label}</span>
                          {r.type === 'money' && <span className="pointer-events-none absolute left-3 text-[13px] text-ink-3">$</span>}
                          <input
                            value={valueOf(r)}
                            inputMode="decimal"
                            onChange={(e) => set(r.key, e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && dirty(r)) save.mutate({ key: r.key, value: valueOf(r) }); }}
                            className={clsx(field, r.type === 'money' && 'pl-6', r.type === 'percent' && 'pr-7')}
                          />
                          {r.type === 'percent' && <span className="pointer-events-none absolute right-3 text-[13px] text-ink-3">%</span>}
                        </label>
                      )}

                      <Button size="sm" disabled={!dirty(r)}
                              loading={save.isPending && save.variables?.key === r.key}
                              onClick={() => save.mutate({ key: r.key, value: valueOf(r) })}>
                        Save
                      </Button>
                      <button
                        title="Restore the deploy default"
                        aria-label={`Restore ${r.label} to its default`}
                        disabled={r.isDefault || reset.isPending}
                        onClick={() => reset.mutate(r.key)}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] border border-line text-ink-3 transition hover:border-line-strong hover:text-ink disabled:pointer-events-none disabled:opacity-35"
                      >
                        <RotateCcw size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}

          {/* Which alerts reach this operator. Personal, unlike everything
              above it, which changes the platform for everyone. */}
          <NotificationPreferences transport={adminTransport} variant="admin" />
        </div>
      )}
    </>
  );
}
