'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { toastError } from '@/lib/toast';
import { clsx } from 'clsx';
import { Search, Send } from 'lucide-react';
import { adminGet, adminPost, adminPatch, adminError } from '@/lib/admin-api';
import { Card, CardHead, PageHeader, Badge, Button, Select, Skeleton, controlCls, type Tone } from '@/components/ui/primitives';
import { Pagination } from '@/components/ui/pagination';
import { usd, num, ago } from '@/lib/format';
import { UserCheck } from 'lucide-react';
import { AttachmentList } from '@/features/support/attachments';
import { adminGetBlob } from '@/lib/admin-api';

type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
type Category = 'DEPOSIT' | 'WITHDRAWAL' | 'ACCOUNT' | 'VERIFICATION' | 'EARNINGS' | 'TECHNICAL' | 'OTHER';

const PRIORITIES: Priority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
const CATEGORIES: Category[] = ['DEPOSIT', 'WITHDRAWAL', 'EARNINGS', 'VERIFICATION', 'ACCOUNT', 'TECHNICAL', 'OTHER'];

/** Only the two that need acting on get colour — everything red is nothing red. */
const PRIORITY_TONE: Record<Priority, Tone> = {
  LOW: 'neutral', NORMAL: 'neutral', HIGH: 'warn', URGENT: 'bad',
};

interface Attachment { id: string; fileName: string; mimeType: string; sizeBytes: number }

interface TicketRow {
  id: string; subject: string; status: string;
  priority: Priority; category: Category; assignedTo: string | null;
  user: { id: string; userCode: string; email: string; status: string };
  messageCount: number; awaitingReply: boolean;
  lastMessage: { body: string; isStaff: boolean; createdAt: string } | null;
  createdAt: string; updatedAt: string;
}
interface Thread {
  id: string; subject: string; status: string; createdAt: string;
  priority: Priority; category: Category; assignedTo: string | null;
  firstReplyAt: string | null;
  user: {
    id: string; userCode: string; email: string; phone: string | null; name: string;
    status: string; affiliateMode: string; totalInvested: string; totalEarned: string;
    rank: string | null; createdAt: string;
  };
  messages: { id: string; body: string; isStaff: boolean; author: string; createdAt: string; attachments: Attachment[] }[];
}

const statusTone = (s: string): Tone => (s === 'OPEN' ? 'warn' : s === 'ANSWERED' ? 'good' : 'neutral');

export default function SupportPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [awaiting, setAwaiting] = useState(false);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(25);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const on = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(0); };

  const list = useQuery({
    queryKey: ['admin', 'support', status, awaiting, q, page, size],
    queryFn: () => adminGet<{ total: number; openCount: number; awaitingCount: number; rows: TicketRow[] }>('/admin/support', {
      take: size, skip: page * size,
      status: status || undefined, awaiting: awaiting || undefined, q: q || undefined,
    }),
    refetchInterval: 60_000,
  });

  const thread = useQuery({
    queryKey: ['admin', 'support', 'thread', openId],
    queryFn: () => adminGet<Thread>(`/admin/support/${openId}`),
    enabled: !!openId,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'support'] });
  };

  const reply = useMutation({
    mutationFn: () => adminPost(`/admin/support/${openId}/reply`, { body: draft.trim() }),
    onSuccess: () => { toast.success('Reply sent'); setDraft(''); refresh(); },
    onError: (e) => toastError(e),
  });

  const me = useQuery<{ id: string }>({ queryKey: ['admin', 'me'], queryFn: () => adminGet('/admin/me') });

  const triage = useMutation({
    mutationFn: (patch: { priority?: Priority; category?: Category; assignedTo?: string | null }) =>
      adminPatch(`/admin/support/${openId}/triage`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'support'] }),
    onError: (e) => toastError(e),
  });

  const claim = useMutation({
    mutationFn: () => adminPost(`/admin/support/${openId}/claim`),
    onSuccess: () => { toast.success('Ticket is yours'); qc.invalidateQueries({ queryKey: ['admin', 'support'] }); },
    onError: (e) => toastError(e),
  });

  const setTicketStatus = useMutation({
    mutationFn: (next: string) => adminPatch(`/admin/support/${openId}/status`, { status: next }),
    onSuccess: (_d, next) => { toast.success(`Ticket ${next.toLowerCase()}`); refresh(); },
    onError: (e) => toastError(e),
  });

  const t = thread.data;

  return (
    <>
      <PageHeader
        title="Support Tickets"
        subtitle="Member queries and replies. A ticket needs attention when it is open and the last word was the member's."
      />

      <div className="grid grid-cols-1 items-start gap-3.5 xl:grid-cols-12">
        {/* ── queue ─────────────────────────────────────────────────── */}
        <Card className="xl:col-span-5">
          <CardHead
            title={`${num(list.data?.total ?? 0)} tickets`}
            action={list.data?.awaitingCount
              ? <Badge tone="warn">{num(list.data.awaitingCount)} awaiting reply</Badge>
              : undefined}
          />
          <div className="flex flex-wrap items-center gap-2 px-5 pb-3">
            <Select label="Filter by ticket status" value={status} onChange={on(setStatus)} className="h-9 text-[12.5px]"
                    options={[{ value: '', label: 'All statuses' },
                              ...['OPEN', 'ANSWERED', 'CLOSED'].map((s) => ({ value: s, label: s }))]} />
            <label className="flex items-center gap-1.5 text-[12.5px] text-ink-2">
              <input type="checkbox" checked={awaiting} onChange={(e) => on(setAwaiting)(e.target.checked)} className="accent-gold" />
              Awaiting reply
            </label>
            <label className="relative flex flex-1 items-center">
              <Search size={15} className="pointer-events-none absolute left-3 text-ink-3" />
              <input value={q} onChange={(e) => on(setQ)(e.target.value)} placeholder="Subject, email or member ID"
                     className={`${controlCls} h-9 w-full pl-9 text-[12.5px]`} />
            </label>
          </div>

          {list.isLoading ? (
            <div className="space-y-2 px-5 pb-5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
          ) : (list.data?.rows.length ?? 0) === 0 ? (
            <p className="px-5 py-14 text-center text-[13.5px] text-ink-2">No tickets match these filters.</p>
          ) : (
            <ul className="border-t border-line">
              {(list.data?.rows ?? []).map((row) => (
                <li key={row.id}>
                  <button
                    onClick={() => { setOpenId(row.id); setDraft(''); }}
                    className={clsx('w-full border-b border-line-soft px-5 py-3 text-left transition',
                      openId === row.id ? 'bg-gold-soft' : 'hover:bg-row-hover')}
                  >
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">{row.subject}</span>
                      {row.awaitingReply && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" title="Awaiting reply" />}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {(row.priority === 'HIGH' || row.priority === 'URGENT') && (
                          <Badge tone={PRIORITY_TONE[row.priority]}>{row.priority}</Badge>
                        )}
                        <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                      </div>
                    </div>
                    <p className="mt-1 truncate text-[12px] text-ink-2">
                      <span className="font-medium">{row.user.userCode}</span>
                      {row.lastMessage && <> · {row.lastMessage.isStaff ? 'You: ' : ''}{row.lastMessage.body}</>}
                    </p>
                    <p className="mt-0.5 text-[11px] text-ink-3">
                      {num(row.messageCount)} message{row.messageCount === 1 ? '' : 's'} · updated {ago(row.updatedAt)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Pagination total={list.data?.total ?? 0} page={page} pageSize={size} onPage={setPage} onPageSize={setSize} sizes={[10, 25, 50]} />
        </Card>

        {/* ── thread ────────────────────────────────────────────────── */}
        <Card className="xl:col-span-7">
          {!openId ? (
            <p className="px-5 py-20 text-center text-[13.5px] text-ink-2">Select a ticket to read the conversation.</p>
          ) : thread.isLoading || !t ? (
            <div className="space-y-3 p-5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
          ) : (
            <>
              <CardHead
                title={t.subject}
                action={
                  <div className="flex items-center gap-2">
                    <Badge tone={statusTone(t.status)}>{t.status}</Badge>
                    {t.status !== 'CLOSED' ? (
                      <Button size="sm" variant="outline" loading={setTicketStatus.isPending}
                              onClick={() => setTicketStatus.mutate('CLOSED')}>Close</Button>
                    ) : (
                      <Button size="sm" variant="outline" loading={setTicketStatus.isPending}
                              onClick={() => setTicketStatus.mutate('OPEN')}>Reopen</Button>
                    )}
                  </div>
                }
              />

              {/* Triage. Set by the member, adjustable here — they know whether
                  their money arrived, we know how the queue should run. */}
              <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
                <label className="flex items-center gap-1.5">
                  <span className="text-[11px] uppercase tracking-[0.04em] text-ink-3">Priority</span>
                  <select
                    value={t.priority}
                    onChange={(e) => triage.mutate({ priority: e.target.value as Priority })}
                    className={`${controlCls} h-8 text-[12.5px]`}
                  >
                    {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </label>

                <label className="flex items-center gap-1.5">
                  <span className="text-[11px] uppercase tracking-[0.04em] text-ink-3">Category</span>
                  <select
                    value={t.category}
                    onChange={(e) => triage.mutate({ category: e.target.value as Category })}
                    className={`${controlCls} h-8 text-[12.5px]`}
                  >
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>

                <div className="ml-auto flex items-center gap-2">
                  {t.assignedTo ? (
                    <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-2">
                      <UserCheck size={13} className="text-good" />
                      {t.assignedTo === me.data?.id ? 'Yours' : 'Assigned'}
                      <button type="button" onClick={() => triage.mutate({ assignedTo: null })}
                              className="text-ink-3 underline underline-offset-2 hover:text-ink">
                        release
                      </button>
                    </span>
                  ) : (
                    <Button size="sm" variant="outline" loading={claim.isPending} onClick={() => claim.mutate()}>
                      <UserCheck size={13} /> Claim
                    </Button>
                  )}
                </div>
              </div>

              {/* who you are talking to — enough to answer without leaving */}
              <dl className="grid grid-cols-2 gap-px border-y border-line bg-line sm:grid-cols-4">
                {[
                  { k: 'Member', v: t.user.userCode },
                  { k: 'Account', v: t.user.status },
                  { k: 'Invested', v: usd(t.user.totalInvested) },
                  { k: 'Rank', v: t.user.rank ?? '—' },
                ].map((s) => (
                  <div key={s.k} className="bg-card px-4 py-2.5">
                    <dt className="text-[10.5px] uppercase tracking-[0.04em] text-ink-2">{s.k}</dt>
                    <dd className="mt-0.5 truncate text-[13px] font-medium tabular-nums text-ink">{s.v}</dd>
                  </div>
                ))}
              </dl>

              <ul className="max-h-[46vh] space-y-3 overflow-y-auto px-5 py-4">
                {t.messages.map((m) => (
                  <li key={m.id} className={clsx('flex', m.isStaff ? 'justify-end' : 'justify-start')}>
                    <div className={clsx('max-w-[78%] rounded-[12px] px-3.5 py-2.5',
                      m.isStaff ? 'bg-violet-soft' : 'border border-line bg-canvas')}>
                      <p className="text-[11px] font-medium text-ink-2">
                        {m.author} <span className="font-normal text-ink-3">· {ago(m.createdAt)}</span>
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{m.body}</p>
                      <AttachmentList
                        attachments={m.attachments ?? []}
                        fetcher={(id) => adminGetBlob(`/admin/support/attachments/${id}`)}
                      />
                    </div>
                  </li>
                ))}
              </ul>

              <div className="border-t border-line p-4">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && draft.trim().length > 1) reply.mutate();
                  }}
                  rows={3}
                  placeholder={t.status === 'CLOSED' ? 'Replying will reopen this ticket…' : 'Write a reply…'}
                  className="w-full resize-none rounded-[9px] border border-field-line bg-field px-3 py-2 text-[13px] text-ink outline-none transition placeholder:text-field-ph focus:border-gold focus:ring-4 focus:ring-gold/15"
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-[11.5px] text-ink-3">⌘/Ctrl + Enter to send. The member sees this immediately.</p>
                  <Button size="sm" loading={reply.isPending} disabled={draft.trim().length < 2}
                          onClick={() => reply.mutate()}>
                    <Send size={13} /> Send reply
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
    </>
  );
}
