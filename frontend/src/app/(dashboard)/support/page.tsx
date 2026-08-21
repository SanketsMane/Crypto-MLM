'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { toastError } from '@/lib/toast';
import { MessageSquarePlus, Send } from 'lucide-react';
import { get, post, getBlob, apiErrorMessage } from '@/lib/api';
import { AttachmentPicker, AttachmentList, type Attachment as Attachment2 } from '@/features/support/attachments';
import { Card, CardHead, Badge, toneFor, Button, controlCls } from '@/components/ui/primitives';
import { ago } from '@/lib/format';

interface Attachment { id: string; fileName: string; mimeType: string; sizeBytes: number }

interface Ticket {
  id: string; subject: string; status: string; createdAt: string;
  priority: Priority; category: Category;
  messages: { id: string; body: string; isStaff: boolean; createdAt: string; attachments: Attachment[] }[];
}

type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
type Category = 'DEPOSIT' | 'WITHDRAWAL' | 'ACCOUNT' | 'VERIFICATION' | 'EARNINGS' | 'TECHNICAL' | 'OTHER';

/** Plain words, not enum names — the member picks from these. */
const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'DEPOSIT',      label: 'A deposit has not arrived' },
  { value: 'WITHDRAWAL',   label: 'A withdrawal problem' },
  { value: 'EARNINGS',     label: 'A question about earnings' },
  { value: 'VERIFICATION', label: 'Identity verification' },
  { value: 'ACCOUNT',      label: 'My account or profile' },
  { value: 'TECHNICAL',    label: 'Something is broken' },
  { value: 'OTHER',        label: 'Something else' },
];

const PRIORITIES: { value: Priority; label: string; hint: string }[] = [
  { value: 'NORMAL', label: 'Normal',   hint: 'A question, no rush' },
  { value: 'HIGH',   label: 'High',     hint: 'Blocking something I need to do' },
  { value: 'URGENT', label: 'Urgent',   hint: 'Money is missing' },
];

const PRIORITY_TONE: Record<Priority, 'neutral' | 'info' | 'warn' | 'bad'> = {
  LOW: 'neutral', NORMAL: 'neutral', HIGH: 'warn', URGENT: 'bad',
};

export default function SupportPage() {
  const qc = useQueryClient();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<Priority>('NORMAL');
  const [category, setCategory] = useState<Category>('OTHER');
  const [files, setFiles] = useState<(Attachment2 & { size: number })[]>([]);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [replyFiles, setReplyFiles] = useState<(Attachment2 & { size: number })[]>([]);

  const list = useQuery({ queryKey: ['member', 'tickets'], queryFn: () => get<Ticket[]>('/support') });

  const create = useMutation({
    mutationFn: () => post('/support', {
      subject, body, priority, category,
      attachments: files.map(({ fileName, mimeType, data }) => ({ fileName, mimeType, data })),
    }),
    onSuccess: () => {
      toast.success('Ticket opened', { description: 'We will reply by email and in your notifications.' });
      setSubject(''); setBody(''); setFiles([]); setPriority('NORMAL'); setCategory('OTHER');
      qc.invalidateQueries({ queryKey: ['member', 'tickets'] });
    },
    onError: (e) => toastError(e),
  });

  const send = useMutation({
    mutationFn: (id: string) => post(`/support/${id}/reply`, {
      body: reply,
      attachments: replyFiles.map(({ fileName, mimeType, data }) => ({ fileName, mimeType, data })),
    }),
    onSuccess: () => {
      setReply(''); setReplyTo(null); setReplyFiles([]);
      qc.invalidateQueries({ queryKey: ['member', 'tickets'] });
    },
    onError: (e) => toastError(e),
  });

  return (
    <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-12">
      <div className="lg:col-span-5">
        <Card>
          <CardHead title="Open a ticket" />
          <form className="space-y-3 px-5 pb-5" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
            <input required value={subject} onChange={(e) => setSubject(e.target.value)}
                   placeholder="What is this about?" className={`${controlCls} h-11 w-full`} />
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-ink-2">What kind of problem?</span>
              <select value={category} onChange={(e) => setCategory(e.target.value as Category)}
                      className={`${controlCls} h-11 w-full`}>
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </label>

            <div>
              <span className="mb-1.5 block text-[12px] font-medium text-ink-2">How urgent is it?</span>
              <div className="grid grid-cols-3 gap-1.5">
                {PRIORITIES.map((p) => (
                  <button key={p.value} type="button" onClick={() => setPriority(p.value)}
                          title={p.hint}
                          className={`rounded-[9px] border px-2 py-2 text-[12px] font-medium transition ${
                            priority === p.value
                              ? 'border-violet bg-violet text-white'
                              : 'border-line bg-card text-ink-2 hover:border-violet/40 hover:text-ink'}`}>
                    {p.label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-ink-3">
                {PRIORITIES.find((p) => p.value === priority)?.hint}
              </p>
            </div>

            <textarea required rows={5} value={body} onChange={(e) => setBody(e.target.value)}
                      placeholder="Describe the issue — include amounts and reference numbers where relevant."
                      className={`${controlCls} w-full resize-y py-2.5`} />

            <AttachmentPicker files={files} onChange={setFiles} />

            <Button type="submit" className="w-full" loading={create.isPending}
                    disabled={subject.trim().length < 3 || body.trim().length < 5}>
              <MessageSquarePlus size={15} /> Submit ticket
            </Button>
          </form>
        </Card>
      </div>

      <div className="space-y-3.5 lg:col-span-7">
        {(list.data ?? []).length === 0 && (
          <Card>
            <p className="px-5 py-14 text-center text-[13.5px] text-ink-2">
              You have no tickets. Open one on the left and we will reply here.
            </p>
          </Card>
        )}

        {(list.data ?? []).map((t) => (
          <Card key={t.id}>
            <CardHead
              title={t.subject}
              action={
                <div className="flex flex-wrap items-center gap-1.5">
                  {t.priority !== 'NORMAL' && t.priority !== 'LOW' && (
                    <Badge tone={PRIORITY_TONE[t.priority]}>{t.priority}</Badge>
                  )}
                  <Badge tone={toneFor(t.status)}>{t.status}</Badge>
                </div>
              }
            />
            <div className="space-y-2.5 px-5 pb-4">
              {t.messages.map((m) => (
                <div key={m.id}
                     className={`max-w-[85%] rounded-[10px] px-3.5 py-2.5 ${
                       m.isStaff ? 'bg-violet-soft' : 'ml-auto bg-canvas'}`}>
                  <p className="text-[10.5px] font-medium uppercase tracking-[0.04em] text-ink-2">
                    {m.isStaff ? 'Support' : 'You'} · {ago(m.createdAt)}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{m.body}</p>
                  <AttachmentList
                    attachments={m.attachments ?? []}
                    fetcher={(id) => getBlob(`/support/attachments/${id}`)}
                  />
                </div>
              ))}
            </div>

            {t.status !== 'CLOSED' && (
              <div className="border-t border-line px-5 py-3.5">
                {replyTo === t.id ? (
                  <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); send.mutate(t.id); }}>
                    <div className="flex gap-2">
                      <input autoFocus value={reply} onChange={(e) => setReply(e.target.value)}
                             placeholder="Write a reply…" className={`${controlCls} h-10 flex-1`} />
                      <Button type="submit" size="sm" loading={send.isPending} disabled={reply.trim().length < 2}>
                        <Send size={14} />
                      </Button>
                    </div>
                    <AttachmentPicker files={replyFiles} onChange={setReplyFiles} />
                  </form>
                ) : (
                  <button onClick={() => setReplyTo(t.id)}
                          className="text-[12.5px] font-medium text-violet hover:underline">
                    Reply to this ticket
                  </button>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
