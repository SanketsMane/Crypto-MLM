'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { clsx } from 'clsx';
import { LifeBuoy, Search, Send, UserCheck } from 'lucide-react';
import { toastError } from '@/lib/toast';
import { adminGet, adminGetBlob, adminPost, adminPatch } from '@/lib/admin-api';
import { PageHeader, Badge, Button, Skeleton, controlCls, type Tone } from '@/components/ui/primitives';
import { Pagination } from '@/components/ui/pagination';
import {
  Workbench, Rail, Detail, DetailBar, QueueRow, QueueTabs, EmptyDetail, FactGrid, useQueueKeys,
} from '@/components/admin/workbench';
import { AttachmentList } from '@/features/support/attachments';
import { useAdmin } from '@/features/admin/use-admin';
import { useConfirmOk } from '@/components/ui/confirm';
import { usd, num, ago, shortDate } from '@/lib/format';

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
  const { admin, can } = useAdmin();
  const askConfirm = useConfirmOk();

  const [status, setStatus] = useState('');
  const [awaiting, setAwaiting] = useState(false);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(25);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const on = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(0); };

  /* Replying, triaging, claiming and closing are all gated on `support.manage`
     server-side (admin.routes.ts:109-113). `support.view` alone is a real role,
     so the console must not offer controls that come back 403. */
  const mayManage = can('support.manage');

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

  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'support'] });

  const reply = useMutation({
    mutationFn: () => adminPost(`/admin/support/${openId}/reply`, { body: draft.trim() }),
    onSuccess: () => { toast.success('Reply sent'); setDraft(''); refresh(); },
    onError: (e) => toastError(e),
  });

  const triage = useMutation({
    mutationFn: (patch: { priority?: Priority; category?: Category; assignedTo?: string | null }) =>
      adminPatch(`/admin/support/${openId}/triage`, patch),
    // Silent success reads as "nothing happened" on a control that did change
    // how the queue is ordered for everyone else.
    onSuccess: (_d, patch) => {
      toast.success(patch.priority ? `Priority set to ${patch.priority.toLowerCase()}`
        : patch.category ? `Category set to ${patch.category.toLowerCase()}`
        : 'Ticket released');
      refresh();
    },
    onError: (e) => toastError(e),
  });

  const claim = useMutation({
    mutationFn: () => adminPost(`/admin/support/${openId}/claim`),
    onSuccess: () => { toast.success('Ticket is yours'); refresh(); },
    onError: (e) => toastError(e),
  });

  const setTicketStatus = useMutation({
    mutationFn: (next: string) => adminPatch(`/admin/support/${openId}/status`, { status: next }),
    onSuccess: (_d, next) => { toast.success(`Ticket ${next.toLowerCase()}`); refresh(); },
    onError: (e) => toastError(e),
  });

  const rows = list.data?.rows ?? [];
  useQueueKeys(rows.map((r) => r.id), openId, (id) => { setOpenId(id); setDraft(''); });

  const t = thread.data;

  /* Jump to the newest message whenever the thread changes or a reply lands —
     a conversation that opens at the top hides the thing you need to answer. */
  const feedRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!t) return;
    const el = feedRef.current;
    if (el) el.scrollIntoView({ block: 'end' });
  }, [t?.id, t?.messages.length]);

  const closed = t?.status === 'CLOSED';

  return (
    <>
      <PageHeader
        title="Support Tickets"
        subtitle="Member queries and replies. A ticket needs attention when it is open and the last word was the member's."
      />

      <Workbench>
        {/* ── queue ──────────────────────────────────────────────────────── */}
        <Rail>
          <div className="shrink-0 border-b border-line">
            <div className="flex items-center justify-between gap-3 px-5 pb-2.5 pt-4">
              <h2 className="text-[15px] font-semibold text-ink">{num(list.data?.total ?? 0)} tickets</h2>
              {!!list.data?.awaitingCount && (
                <Badge tone="warn">{num(list.data.awaitingCount)} awaiting reply</Badge>
              )}
            </div>

            <QueueTabs
              value={status}
              onChange={on(setStatus)}
              tabs={[
                { value: '', label: 'All' },
                { value: 'OPEN', label: 'Open', count: list.data?.openCount },
                { value: 'ANSWERED', label: 'Answered' },
                { value: 'CLOSED', label: 'Closed' },
              ]}
            />

            <div className="flex items-center gap-2 px-5 pb-3">
              <label className="relative flex flex-1 items-center">
                <Search size={15} className="pointer-events-none absolute left-3 text-ink-3" />
                <span className="sr-only">Search tickets</span>
                <input value={q} onChange={(e) => on(setQ)(e.target.value)}
                       placeholder="Subject, email or member ID"
                       className={`${controlCls} h-9 w-full pl-9 text-[12.5px]`} />
              </label>
              <label className="flex shrink-0 items-center gap-1.5 text-[12.5px] text-ink-2">
                <input type="checkbox" checked={awaiting} onChange={(e) => on(setAwaiting)(e.target.checked)}
                       className="h-4 w-4 accent-gold" />
                Awaiting
              </label>
            </div>
          </div>

          <div className="fx-scrollbar-hide min-h-0 flex-1 overflow-y-auto">
            {list.isLoading ? (
              <div className="space-y-2 p-5">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
              </div>
            ) : rows.length === 0 ? (
              <p className="px-5 py-14 text-center text-[13.5px] text-ink-2">
                {awaiting || status || q ? 'No tickets match these filters.' : 'No tickets yet.'}
              </p>
            ) : rows.map((row) => (
              <QueueRow key={row.id} selected={openId === row.id}
                        onSelect={() => { setOpenId(row.id); setDraft(''); }}>
                <div className="flex items-start gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">{row.subject}</span>
                  <div className="flex shrink-0 items-center gap-1.5">
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
                <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-ink-3">
                  {row.awaitingReply && (
                    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap font-medium text-warn-on">
                      <span className="h-1.5 w-1.5 rounded-full bg-warn" aria-hidden />
                      awaiting reply
                    </span>
                  )}
                  <span className="truncate">
                    {num(row.messageCount)} message{row.messageCount === 1 ? '' : 's'} · updated {ago(row.updatedAt)}
                  </span>
                </p>
              </QueueRow>
            ))}
          </div>

          <div className="shrink-0 border-t border-line">
            <Pagination total={list.data?.total ?? 0} page={page} pageSize={size}
                        onPage={setPage} onPageSize={setSize} sizes={[10, 25, 50]} />
          </div>
        </Rail>

        {/* ── thread ─────────────────────────────────────────────────────── */}
        <Detail>
          {!openId ? (
            <EmptyDetail
              icon={<LifeBuoy size={20} />}
              title="No ticket selected"
              hint="Pick one from the queue to read the conversation and answer it."
            />
          ) : thread.isLoading || !t ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
            </div>
          ) : (
            <>
              <DetailBar
                title={t.subject}
                subtitle={<span>{t.user.userCode} · opened {ago(t.createdAt)} · {t.category.toLowerCase()}</span>}
              >
                <Badge tone={statusTone(t.status)}>{t.status}</Badge>
                {mayManage && (
                  closed ? (
                    <Button size="sm" variant="outline" loading={setTicketStatus.isPending}
                            onClick={() => setTicketStatus.mutate('OPEN')}>Reopen</Button>
                  ) : (
                    <Button size="sm" variant="outline" loading={setTicketStatus.isPending}
                      onClick={async () => {
                        if (!(await askConfirm({
                          title: 'Close this ticket?',
                          body: 'The member is no longer expecting a reply. They can reopen it by writing again.',
                          confirmLabel: 'Close ticket',
                          tone: 'primary',
                        }))) return;
                        setTicketStatus.mutate('CLOSED');
                      }}>Close</Button>
                  )
                )}
              </DetailBar>

              {/* Triage — set by the member, adjustable here. */}
              {mayManage && (
                <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-2.5">
                  <label className="flex items-center gap-1.5">
                    <span className="text-[11px] uppercase tracking-[0.04em] text-ink-3">Priority</span>
                    <select value={t.priority} aria-label="Ticket priority"
                            onChange={(e) => triage.mutate({ priority: e.target.value as Priority })}
                            className={`${controlCls} h-8 text-[12.5px]`}>
                      {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </label>

                  <label className="flex items-center gap-1.5">
                    <span className="text-[11px] uppercase tracking-[0.04em] text-ink-3">Category</span>
                    <select value={t.category} aria-label="Ticket category"
                            onChange={(e) => triage.mutate({ category: e.target.value as Category })}
                            className={`${controlCls} h-8 text-[12.5px]`}>
                      {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>

                  <div className="ml-auto flex items-center gap-2">
                    {t.assignedTo ? (
                      <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-2">
                        <UserCheck size={13} className="text-good" />
                        {t.assignedTo === admin?.id ? 'Yours' : 'Assigned to someone else'}
                        <button type="button" onClick={() => triage.mutate({ assignedTo: null })}
                                className="rounded text-ink-3 underline underline-offset-2 transition hover:text-ink">
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
              )}

              {/* who you are talking to — enough to answer without leaving */}
              <FactGrid facts={[
                { k: 'Member', v: t.user.userCode },
                { k: 'Account', v: t.user.status, tone: t.user.status === 'ACTIVE' ? 'good' : 'warn' },
                { k: 'Invested', v: usd(t.user.totalInvested) },
                { k: 'Earned', v: usd(t.user.totalEarned) },
              ]} />

              <div className="space-y-3 px-5 py-4">
                {t.messages.map((m) => (
                  <div key={m.id} className={clsx('flex', m.isStaff ? 'justify-end' : 'justify-start')}>
                    <div className={clsx('max-w-[78%] rounded-[5px] px-3.5 py-2.5',
                      m.isStaff ? 'bg-violet-soft' : 'border border-line bg-canvas')}>
                      <p className="text-[11px] font-medium text-ink-2">
                        {m.author}{' '}
                        <span className="font-normal text-ink-3" title={shortDate(m.createdAt)}>
                          · {ago(m.createdAt)}
                        </span>
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{m.body}</p>
                      <AttachmentList
                        attachments={m.attachments ?? []}
                        fetcher={(id) => adminGetBlob(`/admin/support/attachments/${id}`)}
                      />
                    </div>
                  </div>
                ))}
                <div ref={feedRef} aria-hidden />
              </div>

              {/* Composer sticks to the bottom of the viewport so a long thread
                  never puts the reply box a scroll away. */}
              {mayManage ? (
                <div className="sticky bottom-0 z-10 border-t border-line bg-card/95 p-4 backdrop-blur">
                  {closed && (
                    <p className="mb-2 rounded-[3px] bg-warn-soft px-3 py-1.5 text-[11.5px] text-warn-on">
                      This ticket is closed. Sending a reply reopens it.
                    </p>
                  )}
                  <label>
                    <span className="sr-only">Reply to this ticket</span>
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && draft.trim().length > 1) reply.mutate();
                      }}
                      rows={3}
                      placeholder="Write a reply…"
                      className="w-full resize-none rounded-[4px] border border-field-line bg-field px-3 py-2 text-[13px] text-ink outline-none transition placeholder:text-field-ph focus:border-gold focus:ring-4 focus:ring-gold/15"
                    />
                  </label>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <p className="text-[11.5px] text-ink-3">⌘/Ctrl + Enter to send. The member sees this immediately.</p>
                    <Button size="sm" loading={reply.isPending} disabled={draft.trim().length < 2}
                            onClick={() => reply.mutate()}>
                      <Send size={13} /> Send reply
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="border-t border-line bg-canvas px-5 py-3 text-[12px] text-ink-2">
                  Read-only. Answering, triaging and closing tickets need the “Reply and close tickets”
                  permission.
                </p>
              )}
            </>
          )}
        </Detail>
      </Workbench>
    </>
  );
}
