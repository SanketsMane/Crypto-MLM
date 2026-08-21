'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Megaphone, Send, Trash2, Undo2, Pin, Users } from 'lucide-react';
import { clsx } from 'clsx';
import { adminGet, adminPost, adminDelete } from '@/lib/admin-api';
import { useMoneyMutation } from '@/lib/money-mutation';
import { Card, CardHead, PageHeader, Badge, Button, Skeleton, controlCls } from '@/components/ui/primitives';
import { toastError } from '@/lib/toast';

type Severity = 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL';
type Audience = 'ALL' | 'INVESTED' | 'NOT_INVESTED';

interface Announcement {
  id: string; title: string; body: string; severity: Severity;
  status: 'DRAFT' | 'PUBLISHED' | 'WITHDRAWN'; audience: Audience;
  link: string | null; pinned: boolean;
  publishedAt: string | null; expiresAt: string | null;
  deliveredTo: number; createdAt: string;
}

const EMPTY = {
  title: '', body: '', severity: 'INFO' as Severity,
  audience: 'ALL' as Audience, link: '', pinned: false, expiresAt: '',
};

const AUDIENCE_LABEL: Record<Audience, string> = {
  ALL: 'Every active member',
  INVESTED: 'Members holding a package',
  NOT_INVESTED: 'Members who have not invested',
};

const STATUS_TONE = { DRAFT: 'neutral', PUBLISHED: 'good', WITHDRAWN: 'warn' } as const;

export default function AnnouncementsPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ ...EMPTY, id: undefined as string | undefined });

  const list = useQuery<{ total: number; rows: Announcement[] }>({
    queryKey: ['admin', 'announcements'],
    queryFn: () => adminGet('/admin/announcements'),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'announcements'] });

  const save = useMutation({
    mutationFn: () => adminPost('/admin/announcements', {
      ...form,
      link: form.link || undefined,
      expiresAt: form.expiresAt || null,
    }),
    onSuccess: () => { refresh(); setForm({ ...EMPTY, id: undefined }); toast.success('Draft saved'); },
    onError: (e) => toastError(e),
  });

  // Sending reaches everyone at once and cannot be undone, so it carries an
  // idempotency key like any other irreversible action.
  const publish = useMoneyMutation({
    mutationFn: (id: string, key) => adminPost<{ deliveredTo: number }>(`/admin/announcements/${id}/publish`, {}, key),
    onSuccess: (d) => { refresh(); toast.success(`Sent to ${d.deliveredTo} member${d.deliveredTo === 1 ? '' : 's'}`); },
    onError: (e) => toastError(e),
  });

  const withdraw = useMutation({
    mutationFn: (id: string) => adminPost(`/admin/announcements/${id}/withdraw`),
    onSuccess: () => { refresh(); toast.success('Withdrawn — the banner is gone'); },
    onError: (e) => toastError(e),
  });

  const remove = useMutation({
    mutationFn: (id: string) => adminDelete(`/admin/announcements/${id}`),
    onSuccess: () => { refresh(); toast.success('Draft deleted'); },
    onError: (e) => toastError(e),
  });

  const valid = form.title.trim().length >= 3 && form.body.trim().length >= 10;

  return (
    <>
      <PageHeader
        title="Announcements"
        subtitle="Written by you, sent to members. Drafts can be edited; sent ones cannot."
      />

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <Card>
          <CardHead title={form.id ? 'Edit draft' : 'Write an announcement'} />
          <form
            className="space-y-3 px-5 pb-5"
            onSubmit={(e) => { e.preventDefault(); save.mutate(); }}
          >
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-ink-2">Title</span>
              <input value={form.title} maxLength={160}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Scheduled maintenance on Sunday"
                className={`${controlCls} h-10 w-full`} />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-ink-2">Message</span>
              <textarea value={form.body} rows={5} maxLength={4000}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                placeholder="What members need to know, in plain language."
                className={`${controlCls} w-full resize-none py-2`} />
              <span className="mt-1 block text-[11px] text-ink-3">{form.body.length}/4000</span>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-ink-2">Who sees it</span>
              <select value={form.audience}
                onChange={(e) => setForm({ ...form, audience: e.target.value as Audience })}
                className={`${controlCls} h-10 w-full`}>
                {(Object.keys(AUDIENCE_LABEL) as Audience[]).map((a) => (
                  <option key={a} value={a}>{AUDIENCE_LABEL[a]}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-ink-2">Tone</span>
              <select value={form.severity}
                onChange={(e) => setForm({ ...form, severity: e.target.value as Severity })}
                className={`${controlCls} h-10 w-full`}>
                <option value="INFO">Informational</option>
                <option value="SUCCESS">Good news</option>
                <option value="WARNING">Needs attention</option>
                <option value="CRITICAL">Urgent</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-ink-2">Link (optional)</span>
              <input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })}
                placeholder="/packages" className={`${controlCls} h-10 w-full`} />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-ink-2">Stops showing (optional)</span>
              <input type="datetime-local" value={form.expiresAt}
                onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                className={`${controlCls} h-10 w-full`} />
            </label>

            <label className="flex items-start gap-2.5 rounded-[10px] border border-line bg-canvas px-3 py-2.5">
              <input type="checkbox" checked={form.pinned}
                onChange={(e) => setForm({ ...form, pinned: e.target.checked })}
                className="mt-0.5 h-3.5 w-3.5 rounded border-line-strong accent-gold" />
              <span className="min-w-0">
                <span className="block text-[12.5px] font-medium text-ink">Pin as a banner</span>
                <span className="mt-0.5 block text-[11.5px] leading-relaxed text-ink-2">
                  Also shows at the top of the member app until they dismiss it. Use sparingly — a
                  banner that is always there stops being read.
                </span>
              </span>
            </label>

            <div className="flex gap-2">
              <Button type="submit" loading={save.isPending} disabled={!valid}>
                {form.id ? 'Save draft' : 'Create draft'}
              </Button>
              {form.id && (
                <Button type="button" variant="outline" onClick={() => setForm({ ...EMPTY, id: undefined })}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </Card>

        <Card>
          <CardHead title={`All announcements — ${list.data?.total ?? 0}`} />
          <div className="px-5 pb-5">
            {list.isLoading ? <Skeleton className="h-40" /> : !list.data?.rows.length ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-canvas text-ink-3">
                  <Megaphone size={18} />
                </span>
                <p className="text-[13.5px] font-medium text-ink">Nothing sent yet</p>
                <p className="max-w-sm text-[12.5px] leading-relaxed text-ink-2">
                  Announcements land in every member&apos;s notification bell, so they are hard to miss.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {list.data.rows.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-start gap-3 py-3.5 first:pt-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13.5px] font-semibold text-ink">{a.title}</span>
                        <Badge tone={STATUS_TONE[a.status]}>{a.status}</Badge>
                        {a.pinned && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-ink-3">
                            <Pin size={10} /> pinned
                          </span>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-2 max-w-2xl text-[12.5px] leading-relaxed text-ink-2">
                        {a.body}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 text-[11px] text-ink-3">
                        <span className="inline-flex items-center gap-1">
                          <Users size={10} /> {AUDIENCE_LABEL[a.audience]}
                        </span>
                        {a.status === 'PUBLISHED' && <span>delivered to {a.deliveredTo}</span>}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      {a.status === 'DRAFT' && (
                        <>
                          <Button variant="outline" onClick={() => setForm({
                            id: a.id, title: a.title, body: a.body, severity: a.severity,
                            audience: a.audience, link: a.link ?? '', pinned: a.pinned,
                            expiresAt: a.expiresAt ? a.expiresAt.slice(0, 16) : '',
                          })}>Edit</Button>
                          <Button loading={publish.isPending} onClick={() => publish.mutate(a.id)}>
                            <Send size={13} /> Send
                          </Button>
                          <button type="button" onClick={() => remove.mutate(a.id)}
                            aria-label="Delete draft" title="Delete draft"
                            className="grid h-9 w-9 place-items-center rounded-[9px] border border-line text-ink-3 transition hover:border-bad/40 hover:text-bad">
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                      {a.status === 'PUBLISHED' && (
                        <Button variant="outline" onClick={() => withdraw.mutate(a.id)}>
                          <Undo2 size={13} /> Withdraw
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
