'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Ticket, Trophy, ShieldCheck, Clock, Gift } from 'lucide-react';
import { clsx } from 'clsx';
import { get, post } from '@/lib/api';
import { useMoneyMutation } from '@/lib/money-mutation';
import { Card, CardHead, Metric, Badge, Button, Skeleton } from '@/components/ui/primitives';
import { toastError } from '@/lib/toast';
import { usd } from '@/lib/format';

interface Prize { position: number; label: string; amount: string }
interface ResultPrize extends Prize {
  ticket: string | null; winner: string | null; isMine: boolean; prizeId: string; claimed: boolean;
}
interface Payload {
  live: {
    id: string; name: string; notes: string | null; status: 'OPEN' | 'CLOSED';
    closesAt: string | null; ticketThreshold: string; maxTicketsPerMember: number;
    totalTickets: number; seedHash: string | null; prizes: Prize[];
  } | null;
  myTickets: { id: string; number: string; issuedAt: string }[];
  results: {
    id: string; name: string; drawnAt: string; seed: string | null; seedHash: string | null;
    prizes: ResultPrize[];
  }[];
}

/** Counts down to entries closing. Nothing else on the page needs a timer. */
function useCountdown(iso: string | null) {
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!iso) return setLeft(null);
    const tick = () => setLeft(Math.max(0, new Date(iso).getTime() - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [iso]);

  if (left === null) return null;
  const s = Math.floor(left / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

export default function DrawsPage() {
  const qc = useQueryClient();

  const data = useQuery<Payload>({
    queryKey: ['member', 'draws'],
    queryFn: () => get('/draws'),
  });

  const claim = useMoneyMutation({
    mutationFn: (id: string, key) =>
      post<{ prize: string; amount: string }>(`/draws/prizes/${id}/claim`, {}, key),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['member'] });
      toast.success(`${usd(Number(d.amount))} added to your main wallet`, { description: d.prize });
    },
    onError: (e) => toastError(e),
  });

  const live = data.data?.live;
  const tickets = data.data?.myTickets ?? [];
  const countdown = useCountdown(live?.closesAt ?? null);

  if (data.isLoading) {
    return <Card><div className="p-3.5"><Skeleton className="h-64" /></div></Card>;
  }

  return (
    <div className="space-y-4">
      {live ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Your tickets" value={tickets.length} tone={tickets.length ? 'good' : undefined} />
            <Metric label="Tickets in the draw" value={live.totalTickets} />
            <Metric
              label={live.status === 'CLOSED' ? 'Entries' : 'Entries close'}
              value={live.status === 'CLOSED' ? 'Closed' : countdown ?? 'Open'}
            />
          </div>

          <Card>
            <CardHead
              title={live.name}
              subtitle={live.notes ?? 'Tickets are earned by investing — they are never sold.'}
              right={<Badge tone={live.status === 'OPEN' ? 'good' : 'warn'}>
                {live.status === 'OPEN' ? 'Entries open' : 'Entries closed'}
              </Badge>}
            />
            <div className="grid gap-4 px-3.5 pb-3.5 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-3">
                  Prizes
                </h3>
                <ul className="divide-y divide-line">
                  {live.prizes.map((p) => (
                    <li key={p.position} className="flex items-center gap-3 py-2.5 first:pt-0">
                      <span className={clsx(
                        'grid h-8 w-8 shrink-0 place-items-center rounded-[4px] text-[12px] font-bold',
                        p.position === 1 ? 'bg-gold/20 text-gold-ink' : 'bg-canvas text-ink-2',
                      )}>
                        {p.position}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{p.label}</span>
                      <span className="shrink-0 tabular-nums text-[13.5px] font-semibold text-ink">
                        {usd(Number(p.amount))}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-3">
                  Your tickets
                </h3>
                {tickets.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {tickets.map((t) => (
                      <span key={t.id}
                            className="rounded-[4px] border border-gold/40 bg-gold-soft px-2.5 py-1.5 font-mono text-[12px] font-medium text-gold-ink">
                        {t.number}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[5px] border border-dashed border-line px-4 py-6 text-center">
                    <Ticket size={18} className="mx-auto text-ink-3" />
                    <p className="mt-1.5 text-[13px] font-medium text-ink">No tickets yet</p>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-ink-2">
                      One ticket for every {usd(Number(live.ticketThreshold))} you have invested,
                      up to {live.maxTicketsPerMember}.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* The commitment. It is the reason this is worth trusting, so it is
                on the page rather than buried in terms. */}
            {live.seedHash && (
              <div className="flex items-start gap-2.5 border-t border-line px-3.5 py-3.5">
                <ShieldCheck size={15} className="mt-0.5 shrink-0 text-good" />
                <div className="min-w-0">
                  <p className="text-[12.5px] font-medium text-ink">This draw is verifiable</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-ink-2">
                    The random seed was fixed before entries opened and its fingerprint published
                    below. After the draw the seed itself is revealed, so anyone can recompute the
                    result and check it matches.
                  </p>
                  <p className="mt-1 break-all font-mono text-[10.5px] text-ink-3">{live.seedHash}</p>
                </div>
              </div>
            )}
          </Card>
        </>
      ) : (
        <Card>
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-canvas text-ink-3">
              <Clock size={22} />
            </span>
            <p className="text-[15px] font-medium text-ink">No draw is running</p>
            <p className="max-w-sm text-[13px] leading-relaxed text-ink-2">
              Tickets are earned by investing, so you will already have entries when the next one
              opens. Past results are below.
            </p>
          </div>
        </Card>
      )}

      {/* Anything won and not yet taken. Surfaced above the results so it is
          not missed in a long list. */}
      {data.data?.results.some((r) => r.prizes.some((p) => p.isMine && !p.claimed)) && (
        <Card>
          <CardHead title="You have a prize to claim" />
          <div className="space-y-2 px-3.5 pb-3.5">
            {data.data.results.flatMap((r) =>
              r.prizes.filter((p) => p.isMine && !p.claimed).map((p) => (
                <div key={p.prizeId}
                     className="flex flex-wrap items-center gap-3 rounded-[5px] border border-gold/40 bg-gold-soft px-4 py-3">
                  <Trophy size={17} className="shrink-0 text-gold-ink" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-semibold text-ink">{p.label} — {r.name}</p>
                    <p className="text-[12px] text-ink-2">Ticket {p.ticket}</p>
                  </div>
                  <span className="tabular-nums text-[15px] font-bold text-ink">
                    {usd(Number(p.amount))}
                  </span>
                  <Button
                    loading={claim.isPending && claim.variables === p.prizeId}
                    onClick={() => claim.mutate(p.prizeId)}
                  >
                    <Gift size={14} /> Claim
                  </Button>
                </div>
              )),
            )}
          </div>
        </Card>
      )}

      <Card>
        <CardHead title="Past draws" subtitle="Newest first, with the seed for each so results can be checked." />
        <div className="px-3.5 pb-3.5">
          {!data.data?.results.length ? (
            <p className="py-8 text-center text-[13px] text-ink-2">No draws have been run yet.</p>
          ) : (
            <div className="space-y-4">
              {data.data.results.map((r) => (
                <div key={r.id} className="rounded-[5px] border border-line">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-2.5">
                    <span className="text-[13.5px] font-semibold text-ink">{r.name}</span>
                    <span className="text-[11.5px] text-ink-3">
                      {new Date(r.drawnAt).toLocaleDateString(undefined, {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                    </span>
                  </div>
                  <ul className="divide-y divide-line">
                    {r.prizes.filter((p) => p.winner).map((p) => (
                      <li key={p.prizeId}
                          className={clsx('flex flex-wrap items-center gap-3 px-4 py-2.5',
                                          p.isMine && 'bg-gold-soft')}>
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[3px] bg-canvas text-[11px] font-bold text-ink-2">
                          {p.position}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] text-ink">
                            {p.isMine ? 'You' : p.winner}
                          </span>
                          <span className="block font-mono text-[11px] text-ink-3">{p.ticket}</span>
                        </span>
                        <span className="shrink-0 tabular-nums text-[13px] font-medium text-ink">
                          {usd(Number(p.amount))}
                        </span>
                        {p.isMine && (
                          <Badge tone={p.claimed ? 'good' : 'gold'}>
                            {p.claimed ? 'Claimed' : 'Unclaimed'}
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                  {r.seed && (
                    <div className="border-t border-line px-4 py-2">
                      <p className="break-all font-mono text-[10.5px] text-ink-3">
                        seed {r.seed}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <p className="px-1 text-[11.5px] leading-relaxed text-ink-3">
        Tickets are issued for investment you have already made and cannot be bought. A member
        holding several tickets can win more than one prize — that is the honest consequence of
        tickets being earned.
      </p>
    </div>
  );
}
