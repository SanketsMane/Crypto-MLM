'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { clsx } from 'clsx';
import {
  CheckCircle2, Clock, Copy, Lock, Play, Plus, ShieldCheck, Ticket, Trash2, Trophy, Users,
} from 'lucide-react';
import { adminGet, adminPost } from '@/lib/admin-api';
import { useMoneyMutation } from '@/lib/money-mutation';
import { PageHeader, Badge, Button, Skeleton, controlCls, type Tone } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/modal';
import { useConfirmOk } from '@/components/ui/confirm';
import {
  Workbench, Rail, Detail, DetailBar, QueueRow, EmptyDetail, FactGrid, useQueueKeys,
} from '@/components/admin/workbench';
import { toastError } from '@/lib/toast';
import { usd, num, shortDate } from '@/lib/format';
import { useAdmin } from '@/features/admin/use-admin';

type Status = 'DRAFT' | 'OPEN' | 'CLOSED' | 'DRAWN' | 'CANCELLED';

interface Prize {
  id: string; position: number; label: string; amount: string;
  winnerTicketId: string | null; claimedAt: string | null;
  winnerTicket: string | null; winner: string | null;
}
interface Draw {
  id: string; name: string; notes: string | null; status: Status;
  ticketThreshold: string; maxTicketsPerMember: number;
  opensAt: string | null; closesAt: string | null; drawnAt: string | null;
  seedHash: string | null; seed: string | null;
  entrants: number; prizes: Prize[]; _count: { tickets: number };
}

const STATUS_TONE: Record<Status, Tone> = {
  DRAFT: 'neutral', OPEN: 'good', CLOSED: 'warn', DRAWN: 'info', CANCELLED: 'neutral',
};

/** What the operator is actually looking at, in one line each. */
const STATUS_MEANING: Record<Status, string> = {
  DRAFT: 'Not visible to members. Prizes and the threshold can still be changed.',
  OPEN: 'Members are earning tickets. Prizes and the threshold are now fixed.',
  CLOSED: 'No further tickets are issued. Ready to draw.',
  DRAWN: 'Winners are selected and the seed is revealed. Prizes are paid as each winner claims.',
  CANCELLED: 'This draw was cancelled.',
};

const EMPTY_PRIZE = { position: 1, label: '', amount: '' };

/**
 * Sum a set of prize amounts for display.
 *
 * Summed in integer minor units rather than as floats: `0.1 + 0.2` is the
 * classic way a prize pool ends up reading `$1,250.0000000000001`, and this is
 * the number an operator uses to decide whether to create the liability at all.
 * Rounding each amount to cents first matches what `usd` renders per row, so
 * the total always equals the visible parts.
 */
const poolOf = (prizes: { amount: string }[]) =>
  prizes.reduce((cents, p) => cents + Math.round((Number(p.amount) || 0) * 100), 0) / 100;

export default function DrawsAdminPage() {
  const qc = useQueryClient();
  const { can } = useAdmin();
  const askConfirm = useConfirmOk();

  const [selected, setSelected] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [form, setForm] = useState({
    name: '', notes: '', ticketThreshold: '500', maxTicketsPerMember: 50, closesAt: '',
    prizes: [{ ...EMPTY_PRIZE }],
  });

  /* Writing a draw is gated on `plan.edit` server-side (admin.routes.ts), so the
     console must not offer buttons that are guaranteed to come back 403. The
     shipped Operations Manager role holds `plan.view` but not `plan.edit`. */
  const mayEdit = can('plan.edit');

  const list = useQuery<Draw[]>({ queryKey: ['admin', 'draws'], queryFn: () => adminGet('/admin/draws') });
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'draws'] });

  const draw = list.data?.find((d) => d.id === selected) ?? null;

  useEffect(() => {
    if (!selected && list.data?.length) setSelected(list.data[0].id);
  }, [list.data, selected]);

  useQueueKeys((list.data ?? []).map((d) => d.id), selected, setSelected);

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
      setNewOpen(false);
      toast.success('Draft saved', { description: 'Nothing is visible to members until you open entries.' });
    },
    onError: (e) => toastError(e),
  });

  const open = useMoneyMutation({
    mutationFn: (id: string, key) => adminPost(`/admin/draws/${id}/open`, {}, key),
    onSuccess: () => {
      refresh();
      toast.success('Entries are open', {
        description: 'Existing investors have been issued their tickets, and the commitment hash is published.',
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
      setRunOpen(false);
      toast.success(`${d.winners} winner${d.winners === 1 ? '' : 's'} drawn`, {
        description: 'The seed is revealed and every winner has been notified. Prizes are paid as they claim.',
      });
    },
    onError: (e) => toastError(e),
  });

  const valid = form.name.trim().length >= 3
    && Number(form.ticketThreshold) > 0
    && form.prizes.length > 0
    && form.prizes.every((p) => p.label.trim() && Number(p.amount) > 0);

  const copy = (v: string, what: string) => {
    navigator.clipboard?.writeText(v).then(
      () => toast.success(`${what} copied`),
      () => toast.error('Could not copy'),
    );
  };

  const unclaimed = useMemo(
    () => (draw?.prizes ?? []).filter((p) => p.winnerTicketId && !p.claimedAt),
    [draw],
  );

  return (
    <>
      <PageHeader
        title="Prize draws"
        subtitle="Tickets are earned by investing and never sold. Every result is verifiable: the seed's hash is published before entries open, and the seed itself only after the draw."
      />

      <Workbench>
        {/* ── draws ─────────────────────────────────────────────────────── */}
        <Rail>
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-3.5">
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold leading-tight text-ink">
                {list.data?.length ?? 0} draw{(list.data?.length ?? 0) === 1 ? '' : 's'}
              </h2>
              <p className="mt-0.5 text-[11.5px] text-ink-2">Newest first</p>
            </div>
            {mayEdit && (
              <Button size="sm" variant="outline" onClick={() => setNewOpen(true)}>
                <Plus size={14} /> New draw
              </Button>
            )}
          </div>

          <div className="fx-scrollbar-hide min-h-0 flex-1 overflow-y-auto">
            {list.isLoading ? (
              <div className="space-y-2 p-5">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[76px]" />)}
              </div>
            ) : !list.data?.length ? (
              <div className="px-5 py-14 text-center">
                <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-canvas text-ink-3">
                  <Ticket size={19} />
                </span>
                <p className="mt-3 text-[13.5px] font-medium text-ink">No draws yet</p>
                <p className="mx-auto mt-1 max-w-[34ch] text-[12.5px] leading-relaxed text-ink-2">
                  Opening a draw issues tickets to everyone who has already invested, so nobody is
                  excluded for having joined early.
                </p>
              </div>
            ) : list.data.map((d) => (
              <QueueRow key={d.id} selected={selected === d.id} onSelect={() => setSelected(d.id)}>
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">{d.name}</span>
                  <Badge tone={STATUS_TONE[d.status]}>{d.status}</Badge>
                </div>
                <p className="mt-1.5 text-[12px] tabular-nums text-ink-2">
                  {usd(poolOf(d.prizes))} in {d.prizes.length} prize{d.prizes.length === 1 ? '' : 's'}
                </p>
                {d.status !== 'DRAFT' && (
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[11.5px] tabular-nums text-ink-3">
                    <span className="inline-flex items-center gap-1"><Ticket size={11} /> {num(d._count.tickets)} tickets</span>
                    <span className="inline-flex items-center gap-1"><Users size={11} /> {num(d.entrants)} entrants</span>
                  </p>
                )}
              </QueueRow>
            ))}
          </div>
        </Rail>

        {/* ── the selected draw ─────────────────────────────────────────── */}
        <Detail>
          {!draw ? (
            list.isLoading ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
              </div>
            ) : (
              <EmptyDetail
                icon={<Trophy size={20} />}
                title="No draw selected"
                hint="Pick a draw to see its prizes, who won, and the seed that proves the result."
              />
            )
          ) : (
            <>
              <DetailBar
                title={draw.name}
                subtitle={<span className="tabular-nums">{usd(poolOf(draw.prizes))} pool · one ticket per {usd(draw.ticketThreshold)} invested · up to {draw.maxTicketsPerMember} each</span>}
              >
                <Badge tone={STATUS_TONE[draw.status]}>{draw.status}</Badge>
                {mayEdit && draw.status === 'DRAFT' && (
                  <Button size="sm" loading={open.isPending}
                    onClick={async () => {
                      if (!(await askConfirm({
                        title: `Open "${draw.name}" for entries?`,
                        body: 'Tickets are issued immediately to everyone who has already invested, the commitment hash is published, and the prizes and threshold become fixed. This cannot be undone.',
                        confirmLabel: 'Open entries',
                        tone: 'primary',
                      }))) return;
                      open.mutate(draw.id);
                    }}>
                    Open entries
                  </Button>
                )}
                {mayEdit && draw.status === 'OPEN' && (
                  <Button size="sm" variant="outline" loading={close.isPending}
                    onClick={async () => {
                      if (!(await askConfirm({
                        title: `Close "${draw.name}" to new entries?`,
                        body: 'No further tickets are issued. Members already holding tickets keep them.',
                        confirmLabel: 'Close entries',
                      }))) return;
                      close.mutate(draw.id);
                    }}>
                    <Lock size={13} /> Close entries
                  </Button>
                )}
                {mayEdit && (draw.status === 'OPEN' || draw.status === 'CLOSED') && (
                  <Button size="sm" onClick={() => setRunOpen(true)} disabled={draw._count.tickets === 0}
                          title={draw._count.tickets === 0 ? 'Nobody has entered this draw' : undefined}>
                    <Play size={13} /> Run draw
                  </Button>
                )}
              </DetailBar>

              <p className="border-b border-line bg-canvas px-5 py-2.5 text-[12px] leading-relaxed text-ink-2">
                {STATUS_MEANING[draw.status]}
              </p>

              <FactGrid facts={[
                { k: 'Prize pool', v: usd(poolOf(draw.prizes)), strong: true },
                { k: 'Tickets', v: num(draw._count.tickets) },
                { k: 'Entrants', v: num(draw.entrants) },
                {
                  k: draw.status === 'DRAWN' ? 'Drawn' : 'Entries close',
                  v: draw.status === 'DRAWN'
                    ? (draw.drawnAt ? shortDate(draw.drawnAt) : '—')
                    : (draw.closesAt ? shortDate(draw.closesAt) : 'None'),
                },
              ]} />

              {/* Unclaimed prizes are money the platform still owes. */}
              {draw.status === 'DRAWN' && unclaimed.length > 0 && (
                <div className="flex items-start gap-2.5 border-b border-line bg-warn-soft px-5 py-3">
                  <Clock size={15} className="mt-[1px] shrink-0 text-warn-on" />
                  <p className="text-[12.5px] leading-relaxed text-warn-on">
                    <span className="font-semibold tabular-nums">{usd(poolOf(unclaimed))}</span> across{' '}
                    {unclaimed.length} prize{unclaimed.length === 1 ? '' : 's'} is still unclaimed. Nothing is
                    debited until a winner claims, so this is money still owed rather than money paid.
                  </p>
                </div>
              )}

              {draw.notes && (
                <p className="border-b border-line px-5 py-3 text-[12.5px] leading-relaxed text-ink-2">
                  <span className="font-medium text-ink">Note to members: </span>{draw.notes}
                </p>
              )}

              {/* ── prizes and winners ───────────────────────────────────── */}
              <section className="border-b border-line px-5 py-4">
                <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-2">
                  Prizes {draw.status === 'DRAWN' && <span className="font-normal text-ink-3">and winners</span>}
                </h3>
                <ul className="space-y-1.5">
                  {draw.prizes.map((p) => (
                    <li key={p.id}
                        className={clsx('flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[5px] border px-3.5 py-2.5',
                          p.winnerTicketId ? 'border-line bg-canvas' : 'border-line bg-card')}>
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-[3px] bg-mute-soft text-[11px] font-semibold tabular-nums text-mute-on">
                        {p.position}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{p.label}</span>

                      {p.winner ? (
                        <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-ink-2">
                          <Trophy size={12} className="shrink-0 text-gold" />
                          <span className="truncate">{p.winner}</span>
                          <span className="shrink-0 font-mono text-[10.5px] text-ink-3">{p.winnerTicket}</span>
                        </span>
                      ) : draw.status === 'DRAWN' ? (
                        <span className="text-[12px] text-ink-3">No ticket for this prize</span>
                      ) : null}

                      {p.winnerTicketId && (
                        <span className={clsx('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-[2px] text-[10.5px] font-medium',
                          p.claimedAt ? 'bg-good-soft text-good-on' : 'bg-warn-soft text-warn-on')}>
                          {p.claimedAt ? <CheckCircle2 size={11} /> : <Clock size={11} />}
                          {p.claimedAt ? `claimed ${shortDate(p.claimedAt)}` : 'unclaimed'}
                        </span>
                      )}

                      <span className="shrink-0 text-[13px] font-semibold tabular-nums text-ink">{usd(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {/* ── proof ────────────────────────────────────────────────── */}
              {draw.seedHash && (
                <section className="px-5 py-4">
                  <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-2">
                    Verifiable result
                  </h3>
                  <p className="mb-3 max-w-[62ch] text-[12px] leading-relaxed text-ink-2">
                    {draw.seed
                      ? 'The seed below produced the winning order. Hash it with SHA-256 and it matches the commitment published before entries opened, which is what proves the winners were not chosen after seeing who entered.'
                      : 'This hash was published before a single ticket existed. The seed behind it stays secret until the draw runs — anyone holding it early could compute the winning tickets.'}
                  </p>

                  <dl className="space-y-2">
                    <div className="rounded-[5px] border border-line bg-canvas px-3.5 py-2.5">
                      <dt className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.04em] text-ink-2">
                        <ShieldCheck size={12} className="text-good" /> Commitment (SHA-256)
                      </dt>
                      <dd className="mt-1 flex items-start gap-2">
                        <code className="min-w-0 flex-1 break-all font-mono text-[11px] leading-relaxed text-ink">{draw.seedHash}</code>
                        <button type="button" onClick={() => copy(draw.seedHash!, 'Commitment')}
                                aria-label="Copy commitment hash"
                                className="shrink-0 rounded-[3px] p-1 text-ink-3 transition hover:bg-card hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">
                          <Copy size={13} />
                        </button>
                      </dd>
                    </div>

                    <div className="rounded-[5px] border border-line bg-canvas px-3.5 py-2.5">
                      <dt className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.04em] text-ink-2">
                        {draw.seed ? <ShieldCheck size={12} className="text-good" /> : <Lock size={12} />} Seed
                      </dt>
                      <dd className="mt-1 flex items-start gap-2">
                        {draw.seed ? (
                          <>
                            <code className="min-w-0 flex-1 break-all font-mono text-[11px] leading-relaxed text-ink">{draw.seed}</code>
                            <button type="button" onClick={() => copy(draw.seed!, 'Seed')}
                                    aria-label="Copy seed"
                                    className="shrink-0 rounded-[3px] p-1 text-ink-3 transition hover:bg-card hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">
                              <Copy size={13} />
                            </button>
                          </>
                        ) : (
                          <span className="text-[12px] text-ink-2">Sealed until the draw runs.</span>
                        )}
                      </dd>
                    </div>
                  </dl>
                </section>
              )}
            </>
          )}
        </Detail>
      </Workbench>

      {/* ── review before running ───────────────────────────────────────── */}
      <Modal
        open={runOpen && !!draw}
        onClose={() => setRunOpen(false)}
        title={draw ? `Run "${draw.name}"?` : ''}
        description="Check these numbers before committing. A draw cannot be re-run or reversed."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setRunOpen(false)}>Cancel</Button>
            <Button size="sm" loading={run.isPending} onClick={() => draw && run.mutate(draw.id)}>
              <Play size={13} /> Draw winners
            </Button>
          </>
        }
      >
        {draw && (
          <div className="space-y-3">
            <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-[5px] border border-line bg-line">
              {[
                { k: 'Prize pool', v: usd(poolOf(draw.prizes)) },
                { k: 'Tickets', v: num(draw._count.tickets) },
                { k: 'Entrants', v: num(draw.entrants) },
              ].map((f) => (
                <div key={f.k} className="bg-card px-3 py-2.5">
                  <dt className="text-[10.5px] uppercase tracking-[0.04em] text-ink-2">{f.k}</dt>
                  <dd className="mt-0.5 text-[15px] font-semibold tabular-nums text-ink">{f.v}</dd>
                </div>
              ))}
            </dl>

            <ul className="space-y-1">
              {draw.prizes.map((p) => (
                <li key={p.id} className="flex items-center gap-2 rounded-[3px] bg-canvas px-2.5 py-1.5 text-[12px]">
                  <span className="w-4 shrink-0 tabular-nums text-ink-3">{p.position}</span>
                  <span className="min-w-0 flex-1 truncate text-ink">{p.label}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-ink">{usd(p.amount)}</span>
                </li>
              ))}
            </ul>

            {draw.prizes.length > draw._count.tickets && (
              <p className="rounded-[5px] bg-warn-soft px-3.5 py-2.5 text-[12px] leading-relaxed text-warn-on">
                There are {draw.prizes.length} prizes but only {num(draw._count.tickets)} ticket
                {draw._count.tickets === 1 ? '' : 's'}. Prizes beyond the last ticket go unawarded.
              </p>
            )}

            <p className="text-[12px] leading-relaxed text-ink-2">
              Winners are selected from the sealed seed and notified, and the seed is revealed so anyone
              can check the result. <span className="font-medium text-ink">No money moves yet</span> — each
              prize is credited to the winner&apos;s main wallet when they claim it.
            </p>
          </div>
        )}
      </Modal>

      {/* ── new draw ───────────────────────────────────────────────────── */}
      <Modal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title="New draw"
        description="Saved as a draft. Nothing reaches members until you open entries."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button size="sm" loading={save.isPending} disabled={!valid} onClick={() => save.mutate()}>
              Save draft
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-ink">Name</span>
            <input value={form.name} autoFocus onChange={(e) => setForm({ ...form, name: e.target.value })}
                   placeholder="Gateway of Winners" className={`${controlCls} w-full`} />
          </label>

          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-ink">Note to members (optional)</span>
            <textarea value={form.notes} rows={2} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      className={`${controlCls} h-auto w-full resize-none py-2`} />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-ink">One ticket per</span>
              <span className="relative block">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-3">$</span>
                <input value={form.ticketThreshold} inputMode="decimal"
                       onChange={(e) => setForm({ ...form, ticketThreshold: e.target.value })}
                       className={`${controlCls} w-full pl-7 tabular-nums`} />
              </span>
              <span className="mt-1 block text-[11px] text-ink-3">invested</span>
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-ink">Max per member</span>
              <input value={form.maxTicketsPerMember} inputMode="numeric"
                     onChange={(e) => setForm({ ...form, maxTicketsPerMember: Number(e.target.value) || 1 })}
                     className={`${controlCls} w-full tabular-nums`} />
              <span className="mt-1 block text-[11px] text-ink-3">caps a large investor</span>
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-ink">Entries close (optional)</span>
            <input type="datetime-local" value={form.closesAt}
                   onChange={(e) => setForm({ ...form, closesAt: e.target.value })}
                   className={`${controlCls} w-full`} />
          </label>

          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-[12px] font-medium text-ink">
                Prizes
                {form.prizes.some((p) => Number(p.amount) > 0) && (
                  <span className="ml-1.5 font-normal tabular-nums text-ink-2">
                    — {usd(poolOf(form.prizes))} total
                  </span>
                )}
              </span>
              <button type="button"
                      onClick={() => setForm({ ...form, prizes: [...form.prizes, { ...EMPTY_PRIZE, position: form.prizes.length + 1 }] })}
                      className="inline-flex items-center gap-1 rounded-[3px] px-1.5 py-0.5 text-[11.5px] font-medium text-violet transition hover:bg-violet-soft">
                <Plus size={11} /> Add
              </button>
            </div>
            <div className="space-y-1.5">
              {form.prizes.map((p, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="grid h-9 w-8 shrink-0 place-items-center rounded-[3px] bg-canvas text-[11px] font-bold tabular-nums text-ink-2">
                    {i + 1}
                  </span>
                  <input value={p.label} placeholder="1st prize"
                         aria-label={`Prize ${i + 1} label`}
                         onChange={(e) => {
                           const prizes = [...form.prizes];
                           prizes[i] = { ...p, label: e.target.value };
                           setForm({ ...form, prizes });
                         }}
                         className={`${controlCls} h-9 min-w-0 flex-1`} />
                  <span className="relative shrink-0">
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-ink-3">$</span>
                    <input value={p.amount} placeholder="100" inputMode="decimal"
                           aria-label={`Prize ${i + 1} amount in dollars`}
                           onChange={(e) => {
                             const prizes = [...form.prizes];
                             prizes[i] = { ...p, amount: e.target.value };
                             setForm({ ...form, prizes });
                           }}
                           className={`${controlCls} h-9 w-24 pl-6 tabular-nums`} />
                  </span>
                  {form.prizes.length > 1 && (
                    <button type="button" aria-label={`Remove prize ${i + 1}`}
                            onClick={() => setForm({ ...form, prizes: form.prizes.filter((_, x) => x !== i) })}
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-[3px] text-ink-3 transition hover:bg-bad-soft hover:text-bad">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <p className="text-[11.5px] leading-relaxed text-ink-3">
            Prizes and the ticket threshold are fixed once entries open — changing them afterwards would
            move the goalposts on people already entered.
          </p>
        </div>
      </Modal>
    </>
  );
}
