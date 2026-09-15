'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { toastError } from '@/lib/toast';
import { clsx } from 'clsx';
import { AlertTriangle, Banknote, CalendarClock, CheckCircle2, Layers, MinusCircle, Play } from 'lucide-react';
import { adminGet, adminPost, adminError } from '@/lib/admin-api';
import { useMoneyMutation } from '@/lib/money-mutation';
import { Card, CardHead, PageHeader, Badge, Button, Skeleton } from '@/components/ui/primitives';
import { ActionDialog } from '@/components/ui/dialog';
import { StatCard } from '@/components/dashboard/stat-card';
import { usd, num, shortDate, ago } from '@/lib/format';

interface Day {
  date: string; tradingDay: boolean; ran: boolean;
  investments: number; gross: string; paid: string; withheld: string;
}
interface Overview {
  activeInvestments: number;
  /** Null when no package has ever existed to accrue. */
  accruableFrom: string | null;
  tradingDays: number[];
  lastRun: { date: string; at: string } | null;
  missedRuns: string[];
  timeline: Day[];
}
interface RunResult { skipped: boolean; date: string; processed: number; paid: string }

const DAY_NAME = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function JobsPage() {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'jobs'],
    queryFn: () => adminGet<Overview>('/admin/jobs', { days: 14 }),
    refetchInterval: 60_000,
  });

  const run = useMoneyMutation<RunResult, void>({
    mutationFn: (_v, key) => adminPost<RunResult>('/admin/jobs/daily-roi/run', {}, key),
    onSuccess: (r) => {
      toast.success(r.skipped
        ? `${r.date} is not a trading day — nothing accrued`
        : `${r.date}: ${num(r.processed)} accruals, ${usd(r.paid)} paid`);
      setConfirm(false);
      qc.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e) => toastError(e),
  });

  const paid14 = (data?.timeline ?? []).reduce((a, d) => a + Number(d.paid), 0);

  return (
    <>
      <PageHeader
        title="Payout Engine"
        subtitle="The daily trade bonus runs at 00:10 UTC on trading days. This is what it has actually done — every figure comes from the accrual records themselves, not from a log."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active Packages" value={num(data?.activeInvestments ?? 0)} change={null}
                  icon={Layers} chip="bg-violet-soft text-violet-on" loading={isLoading} />
        <StatCard label="Paid — Last 14 Days" value={usd(paid14)} change={null}
                  icon={Banknote} chip="bg-good-soft text-good-on" loading={isLoading} />
        <StatCard label="Last Run" value={data?.lastRun ? shortDate(data.lastRun.date) : '—'} change={null}
                  icon={CalendarClock} chip="bg-info-soft text-info-on" loading={isLoading} />
        <StatCard label="Missed Runs" value={num(data?.missedRuns.length ?? 0)} change={null}
                  icon={AlertTriangle} chip="bg-warn-soft text-warn-on" invert loading={isLoading} />
      </div>

      {(data?.missedRuns.length ?? 0) > 0 && (
        <div className="mt-3.5 flex items-start gap-3 rounded-[5px] border border-bad/35 bg-bad-soft px-4 py-3">
          <AlertTriangle size={17} className="mt-0.5 shrink-0 text-bad" />
          <div className="text-[13px] text-bad-on">
            <p className="font-medium">
              {data!.missedRuns.length} trading day{data!.missedRuns.length === 1 ? '' : 's'} did not accrue
            </p>
            <p className="mt-0.5 text-[12.5px]">
              {data!.missedRuns.join(', ')} — members earned nothing on those days. Running the job fills a missed
              date in; it is idempotent, so a day that already paid stays untouched.
            </p>
          </div>
        </div>
      )}

      <Card className="mt-3.5">
        <CardHead
          title="Last 14 days"
          action={
            <div className="flex items-center gap-2">
              <span className="hidden text-[11.5px] text-ink-2 sm:inline">
                Trading days: {(data?.tradingDays ?? []).map((d) => DAY_NAME[d]).join(' ')}
              </span>
              <Button size="sm" onClick={() => setConfirm(true)}><Play size={13} /> Run now</Button>
            </div>
          }
        />
        {isLoading ? (
          <div className="space-y-2 px-5 pb-5">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9" />)}</div>
        ) : (
          <ul className="border-t border-line">
            {(data?.timeline ?? []).map((d) => {
              /* A day before the first package existed had nothing to pay — it
                 is idle, not missed. Only the backend knows that date, and the
                 row has to agree with the count in the KPI above it. */
              const nothingToDo = !data?.accruableFrom || d.date < data.accruableFrom;
              const state = !d.tradingDay ? 'rest' : d.ran ? 'ran' : nothingToDo ? 'idle' : 'missed';
              return (
                <li key={d.date}
                    className={clsx('flex flex-wrap items-center gap-3 border-b border-line-soft px-5 py-2.5 last:border-b-0',
                      state === 'missed' && 'bg-bad-soft')}>
                  <span className="w-24 shrink-0 text-[13px] font-medium tabular-nums text-ink">{d.date}</span>
                  <span className="w-24 shrink-0">
                    {state === 'rest' ? <Badge tone="neutral">rest day</Badge>
                      : state === 'ran' ? <Badge tone="good">accrued</Badge>
                      : state === 'idle' ? <Badge tone="neutral">no packages</Badge>
                      : <Badge tone="bad">missed</Badge>}
                  </span>
                  <span className="w-6 shrink-0">
                    {state === 'ran' ? <CheckCircle2 size={15} className="text-good" />
                      : state === 'missed' ? <AlertTriangle size={15} className="text-bad" />
                      : <MinusCircle size={15} className="text-ink-3" />}
                  </span>
                  <span className="flex-1 text-[12.5px] tabular-nums text-ink-2">
                    {d.ran ? `${num(d.investments)} package${d.investments === 1 ? '' : 's'}`
                      : state === 'idle' ? 'nothing to accrue' : '—'}
                  </span>
                  <span className="w-28 text-right text-[13px] font-medium tabular-nums text-ink">
                    {d.ran ? usd(d.paid) : '—'}
                  </span>
                  <span className="w-32 text-right text-[12px] tabular-nums text-ink-3" title="Withheld by the earnings cap">
                    {Number(d.withheld) > 0 ? `${usd(d.withheld)} capped` : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {data?.lastRun && <p className="mt-2 text-[12px] text-ink-3">Last accrual written {ago(data.lastRun.at)}.</p>}

      <ActionDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        pending={run.isPending}
        title="Run the daily payout now?"
        body="Accrues today's trade bonus for every active package and pays the generation bonus on top. It is idempotent per package per day, so if today has already accrued this changes nothing. On a non-trading day it does nothing at all."
        confirmLabel="Run daily payout"
        onConfirm={() => run.mutate()}
      />
    </>
  );
}
