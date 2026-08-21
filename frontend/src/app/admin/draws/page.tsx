'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Play, Plus, ShieldCheck, Ticket, Trash2, Trophy, Lock } from 'lucide-react';
import { clsx } from 'clsx';
import { adminGet, adminPost } from '@/lib/admin-api';
import { useMoneyMutation } from '@/lib/money-mutation';
import { Card, CardHead, PageHeader, Badge, Button, Skeleton, controlCls, type Tone } from '@/components/ui/primitives';
import { toastError } from '@/lib/toast';
import { usd } from '@/lib/format';

type Status = 'DRAFT' | 'OPEN' | 'CLOSED' | 'DRAWN' | 'CANCELLED';

interface Prize {
  id: string; position: number; label: string; amount: string;
  winnerTicketId: string | null; claimedAt: string | null;
}
interface Draw {
  id: string; name: string; notes: string | null; status: Status;
  ticketThreshold: string; maxTicketsPerMember: number;
  opensAt: string | null; closesAt: string | null; drawnAt: string | null;
  seedHash: string | null; seed: string | null;
  prizes: Prize[]; _count: { tickets: number };
}

const STATUS_TONE: Record<Status, Tone> = {
  DRAFT: 'neutral', OPEN: 'good', CLOSED: 'warn', DRAWN: 'info', CANCELLED: 'neutral',
};

const EMPTY_PRIZE = { position: 1, label: '', amount: '' };

export default function DrawsAdminPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: '', notes: '', ticketThreshold: '500', maxTicketsPerMember: 50, closesAt: '',
    prizes: [{ ...EMPTY_PRIZE }],
  });

  const list = useQuery<Draw[]>({ queryKey: ['admin', 'draws'], queryFn: () => adminGet('/admin/draws') });
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'draws'] });

  const save = useMutation({
    mutationFn: () => adminPost('/admin/draws', {
      ...form,
      notes: form.notes || undefined,
      closesAt: form.closesAt || null,
      prizes: form.prizes.map((p, i) => ({ ...p, position: i + 1 })),
    }),
    onSuccess: () => {
      refresh();
      setForm({ name: '', notes: '', ticketThreshold: '500', maxTicketsPerMember: 50, closesAt: '', prizes: [{ ...EMPTY_PRIZE }] });
      toast.success('Draft saved');
    },
    onError: (e) => toastError(e),
  });

  const open = useMoneyMutation({
    mutationFn: (id: string, key) => adminPost(`/admin/draws/${id}/open`, {}, key),
    onSuccess: () => {
      refresh();
      toast.success('Entries are open', {
        description: 'Existing investors have been issued their tickets, and the seed is now published.',
      });
    },
    onError: (e) => toastError(e),
  });

  const close = useMutation({
    mutationFn: (id: string) => adminPost(`/admin/draws/${id}/close`),
    onSuccess: () => { refresh(); toast.success('Entries closed'); },
    onError: (e) => toastError(e),
  });

  const run = useMoneyMutation({
    mutationFn: (id: string, key) => adminPost<{ winners: number }>(`/admin/draws/${id}/run`, {}, key),
    onSuccess: (d) => {
      refresh();
      toast.success(`${d.winners} winner${d.winners === 1 ? '' : 's'} drawn`, {
        description: 'The seed has been revealed and every winner has been notified.',
      });
    },
    onError: (e) => toastError(e),
  });

  const valid = form.name.trim().length >= 3
    && Number(form.ticketThreshold) > 0
    && form.prizes.length > 0
    && form.prizes.every((p) => p.label.trim() && Number(p.amount) > 0);

  return (
    <>
      <PageHeader
        title="Prize draws"
        subtitle="Tickets are earned by investing and never sold, and every result is verifiable from a seed published before entries open."
      />

      <div className="grid gap-4 xl:grid-cols-[400px_1fr]">
        <Card>
          <CardHead title="New draw" />
          <form className="space-y-3 px-5 pb-5" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-ink-2">Name</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                     placeholder="Gateway of Winners" className={`${controlCls} h-10 w-full`} />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-ink-2">Note to members (optional)</span>
              <textarea value={form.notes} rows={2} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                        className={`${controlCls} w-full resize-none py-2`} />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-ink-2">One ticket per</span>
                <input value={form.ticketThreshold} inputMode="decimal"
                       onChange={(e) => setForm({ ...form, ticketThreshold: e.target.value })}
                       className={`${controlCls} h-10 w-full`} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-ink-2">Max per member</span>
                <input value={form.maxTicketsPerMember} inputMode="numeric"
                       onChange={(e) => setForm({ ...form, maxTicketsPerMember: Number(e.target.value) || 1 })}
                       className={`${controlCls} h-10 w-full`} />
              </label>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-ink-2">Entries close (optional)</span>
              <input type="datetime-local" value={form.closesAt}
                     onChange={(e) => setForm({ ...form, closesAt: e.target.value })}
                     className={`${controlCls} h-10 w-full`} />
            </label>

            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-[12px] font-medium text-ink-2">Prizes</span>
                <button type="button"
                        onClick={() => setForm({ ...form, prizes: [...form.prizes, { ...EMPTY_PRIZE, position: form.prizes.length + 1 }] })}
                        className="inline-flex items-center gap-1 text-[11.5px] font-medium text-violet hover:underline">
                  <Plus size={11} /> Add
                </button>
              </div>
              <div className="space-y-1.5">
                {form.prizes.map((p, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="grid h-9 w-8 shrink-0 place-items-center rounded-md bg-canvas text-[11px] font-bold text-ink-2">
                      {i + 1}
                    </span>
                    <input value={p.label} placeholder="1st prize"
                           onChange={(e) => {
                             const prizes = [...form.prizes];
                             prizes[i] = { ...p, label: e.target.value };
                             setForm({ ...form, prizes });
                           }}
                           className={`${controlCls} h-9 min-w-0 flex-1`} />
                    <input value={p.amount} placeholder="100" inputMode="decimal"
                           onChange={(e) => {
                             const prizes = [...form.prizes];
                             prizes[i] = { ...p, amount: e.target.value };
                             setForm({ ...form, prizes });
                           }}
                           className={`${controlCls} h-9 w-24`} />
                    {form.prizes.length > 1 && (
                      <button type="button" aria-label={`Remove prize ${i + 1}`}
                              onClick={() => setForm({ ...form, prizes: form.prizes.filter((_, x) => x !== i) })}
                              className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-ink-3 transition hover:text-bad">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <Button type="submit" loading={save.isPending} disabled={!valid}>Save draft</Button>

            <p className="text-[11px] leading-relaxed text-ink-3">
              Prizes and the ticket threshold are fixed once entries open — changing them afterwards
              would move the goalposts on people already entered.
            </p>
          </form>
        </Card>

        <Card>
          <CardHead title={`All draws — ${list.data?.length ?? 0}`} />
          <div className="px-5 pb-5">
            {list.isLoading ? <Skeleton className="h-48" /> : !list.data?.length ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-canvas text-ink-3">
                  <Ticket size={19} />
                </span>
                <p className="text-[13.5px] font-medium text-ink">No draws yet</p>
                <p className="max-w-sm text-[12.5px] leading-relaxed text-ink-2">
                  Create one on the left. Opening it issues tickets to everyone who has already
                  invested, so nobody is excluded for having joined early.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {list.data.map((d) => (
                  <li key={d.id} className="py-4 first:pt-0">
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[14px] font-semibold text-ink">{d.name}</span>
                          <Badge tone={STATUS_TONE[d.status]}>{d.status}</Badge>
                          {d.status !== 'DRAFT' && (
                            <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-3">
                              <Ticket size={11} /> {d._count.tickets}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[12px] text-ink-2">
                          One ticket per {usd(Number(d.ticketThreshold))} invested · up to {d.maxTicketsPerMember} each
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-1.5">
                        {d.status === 'DRAFT' && (
                          <Button loading={open.isPending} onClick={() => open.mutate(d.id)}>
                            Open entries
                          </Button>
                        )}
                        {d.status === 'OPEN' && (
                          <>
                            <Button variant="outline" onClick={() => close.mutate(d.id)}>
                              <Lock size={13} /> Close entries
                            </Button>
                            <Button loading={run.isPending} onClick={() => run.mutate(d.id)}>
                              <Play size={13} /> Run draw
                            </Button>
                          </>
                        )}
                        {d.status === 'CLOSED' && (
                          <Button loading={run.isPending} onClick={() => run.mutate(d.id)}>
                            <Play size={13} /> Run draw
                          </Button>
                        )}
                      </div>
                    </div>

                    <ul className="mt-2.5 grid gap-1 sm:grid-cols-2">
                      {d.prizes.map((p) => (
                        <li key={p.id} className={clsx(
                          'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px]',
                          p.winnerTicketId ? 'bg-good-soft' : 'bg-canvas',
                        )}>
                          <span className="w-4 shrink-0 text-ink-3">{p.position}</span>
                          <span className="min-w-0 flex-1 truncate text-ink">{p.label}</span>
                          <span className="shrink-0 tabular-nums text-ink-2">{usd(Number(p.amount))}</span>
                          {p.winnerTicketId && <Trophy size={11} className="shrink-0 text-good" />}
                        </li>
                      ))}
                    </ul>

                    {d.seedHash && (
                      <p className="mt-2 flex items-start gap-1.5 text-[10.5px] leading-relaxed text-ink-3">
                        <ShieldCheck size={11} className="mt-0.5 shrink-0 text-good" />
                        <span className="min-w-0 break-all font-mono">
                          {d.seed ? `seed ${d.seed}` : `committed ${d.seedHash}`}
                        </span>
                      </p>
                    )}
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
