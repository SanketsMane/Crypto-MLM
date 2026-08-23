'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Activity, AlertTriangle, Fuel, Link2, PlayCircle, RefreshCw, Wallet, CheckCircle2, PowerOff,
} from 'lucide-react';
import { clsx } from 'clsx';
import { adminGet, adminPost } from '@/lib/admin-api';
import { useMoneyMutation } from '@/lib/money-mutation';
import {
  Card, CardHead, PageHeader, Badge, Button, Table, Skeleton, Metric,
} from '@/components/ui/primitives';
import { toastError } from '@/lib/toast';
import { usd } from '@/lib/format';
import { useConfirmOk } from '@/components/ui/confirm';

interface Overview {
  watcher: {
    enabled: boolean; canWatch?: boolean; canPay?: boolean; reasons: string[];
    lastBlock: number | null; head: number | null; behind: number | null; confirmations?: number | null;
  };
  treasury:
    | { configured: true; address: string; tokenBalance: string; gasBalance: string; queuedCount: number; queuedAmount: string }
    | { configured: false; reasons: string[] };
  payouts: { status: string; count: number; amount: string }[];
  transfers: { status: string; count: number }[];
}

interface Stuck {
  id: string;
  withdrawal: { id: string; reference: string; user: { userCode: string; email: string } } | null;
  toAddress: string; amount: string; status: string; attempts: number;
  txHash: string | null; error: string | null; updatedAt: string;
}

const PAYOUT_TONE: Record<string, 'good' | 'warn' | 'bad' | 'info' | 'neutral'> = {
  CONFIRMED: 'good', BROADCAST: 'info', QUEUED: 'neutral', REVERTED: 'bad', FAILED: 'bad',
};

/** How far behind before it stops being normal lag and starts being a problem. */
const BEHIND_WARN = 200;
const LOW_GAS = 0.05;

export default function ChainPage() {
  const qc = useQueryClient();

  const overview = useQuery<Overview>({
    queryKey: ['admin', 'chain'],
    queryFn: () => adminGet('/admin/chain'),
    // Health, not history — it should be current when someone is looking.
    refetchInterval: 30_000,
  });

  const stuck = useQuery<Stuck[]>({
    queryKey: ['admin', 'chain', 'stuck'],
    queryFn: () => adminGet('/admin/chain/stuck'),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'chain'] });

  const askConfirm = useConfirmOk();


  const scan = useMoneyMutation({
    mutationFn: (_: void, key) => adminPost<{ credited: number; fromBlock: number; toBlock: number; skipped: boolean }>(
      '/admin/chain/scan', {}, key),
    onSuccess: (d) => {
      refresh();
      toast.success(
        d.skipped ? 'Nothing to scan — already up to date'
          : `Scanned blocks ${d.fromBlock}–${d.toBlock}, credited ${d.credited}`,
      );
    },
    onError: (e) => toastError(e),
  });

  const process = useMoneyMutation({
    mutationFn: (_: void, key) => adminPost<{ processed: number; confirmed: number; reconciled: number }>(
      '/admin/chain/process-payouts', {}, key),
    onSuccess: (d) => {
      refresh();
      toast.success(`${d.processed} processed, ${d.confirmed} confirmed, ${d.reconciled} reconciled`);
    },
    onError: (e) => toastError(e),
  });

  const w = overview.data?.watcher;
  const t = overview.data?.treasury;

  if (overview.isLoading) {
    return (
      <>
        <PageHeader title="On-chain settlement" subtitle="Deposit watching and outbound payouts." />
        <Skeleton className="h-56" />
      </>
    );
  }

  // Off is a configuration state, not a fault — say what is missing and stop.
  if (!w?.enabled) {
    return (
      <>
        <PageHeader title="On-chain settlement" subtitle="Deposit watching and outbound payouts." />
        <Card>
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-canvas text-ink-3">
              <PowerOff size={22} />
            </span>
            <h2 className="text-[17px] font-semibold text-ink">Automatic settlement is switched off</h2>
            <p className="max-w-md text-[13.5px] leading-relaxed text-ink-2">
              Deposits and payouts are being handled by hand, which works — an operator confirms each
              deposit and sends each payout. Nothing is broken.
            </p>
            {!!w?.reasons.length && (
              <ul className="mt-1 space-y-1 text-left">
                {w.reasons.map((r) => (
                  <li key={r} className="font-mono text-[11.5px] text-ink-3">· {r}</li>
                ))}
              </ul>
            )}
            <p className="max-w-md text-[12.5px] leading-relaxed text-ink-3">
              Set these in the API environment to turn it on. See <code>backend/.env.example</code>.
            </p>
          </div>
        </Card>
      </>
    );
  }

  const behind = w.behind ?? 0;
  const gas = t?.configured ? Number(t.gasBalance) : null;

  return (
    <>
      <PageHeader
        title="On-chain settlement"
        subtitle="Deposit watching and outbound payouts on BNB Smart Chain."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" loading={scan.isPending} onClick={() => scan.mutate()}>
              <RefreshCw size={14} /> Scan now
            </Button>
            <Button loading={process.isPending} onClick={async () => {
              if (!(await askConfirm({
                title: 'Process on-chain payouts?',
                body: 'Queued payouts are signed and broadcast to the network. A broadcast transaction cannot be recalled.',
                confirmLabel: 'Process payouts',
              }))) return;
              process.mutate();
            }}>
              <PlayCircle size={14} /> Run payout queue
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHead title="Deposit watcher" right={
            <Badge tone={behind > BEHIND_WARN ? 'warn' : 'good'}>
              {behind > BEHIND_WARN ? 'Behind' : 'Keeping up'}
            </Badge>
          } />
          <div className="grid gap-3 px-5 pb-5 sm:grid-cols-3 lg:grid-cols-1">
            <Metric label="Last block read" value={w.lastBlock?.toLocaleString() ?? '—'} />
            <Metric label="Chain head" value={w.head?.toLocaleString() ?? 'unreachable'} />
            <Metric
              label="Blocks behind"
              value={behind.toLocaleString()}
              tone={behind > BEHIND_WARN ? 'warn' : undefined}
            />
            {w.confirmations != null && (
              <p className="text-[11.5px] leading-relaxed text-ink-3 sm:col-span-3 lg:col-span-1">
                Deposits are credited after {w.confirmations} confirmations, so the watcher
                deliberately reads behind the head.
              </p>
            )}
          </div>
        </Card>

        <Card>
          <CardHead title="Hot wallet" right={
            <Badge tone={!t?.configured ? 'neutral' : gas !== null && gas < LOW_GAS ? 'bad' : 'good'}>
              {!t?.configured ? 'Not configured' : gas !== null && gas < LOW_GAS ? 'Low gas' : 'Funded'}
            </Badge>
          } />
          <div className="px-5 pb-5">
            {t?.configured ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <Metric label="USDT available" value={usd(Number(t.tokenBalance))} />
                <Metric
                  label="BNB for gas"
                  value={t.gasBalance}
                  tone={gas !== null && gas < LOW_GAS ? 'bad' : undefined}
                />
                <Metric label="Queued against it" value={`${usd(Number(t.queuedAmount))} · ${t.queuedCount}`} />
                <p className="break-all font-mono text-[11px] text-ink-3 sm:col-span-2 lg:col-span-1">
                  {t.address}
                </p>
                {gas !== null && gas < LOW_GAS && (
                  <p className="flex gap-1.5 text-[11.5px] leading-relaxed text-bad sm:col-span-2 lg:col-span-1">
                    <Fuel size={13} className="mt-0.5 shrink-0" />
                    Running out of gas stops payouts just as completely as running out of USDT.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-[13px] leading-relaxed text-ink-2">
                No payout key configured, so payouts stay manual. Deposits are still being watched.
              </p>
            )}
          </div>
        </Card>

        <Card>
          <CardHead title="Throughput" />
          <div className="space-y-3 px-5 pb-5">
            <div>
              <p className="mb-1.5 text-[11px] uppercase tracking-[0.04em] text-ink-3">Payouts</p>
              {overview.data?.payouts.length ? (
                <ul className="space-y-1">
                  {overview.data.payouts.map((p) => (
                    <li key={p.status} className="flex items-center justify-between gap-2 text-[13px]">
                      <Badge tone={PAYOUT_TONE[p.status] ?? 'neutral'}>{p.status}</Badge>
                      <span className="tabular-nums text-ink-2">
                        {p.count} · {usd(Number(p.amount))}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-[13px] text-ink-3">None yet.</p>}
            </div>
            <div>
              <p className="mb-1.5 text-[11px] uppercase tracking-[0.04em] text-ink-3">Transfers seen</p>
              {overview.data?.transfers.length ? (
                <ul className="space-y-1">
                  {overview.data.transfers.map((x) => (
                    <li key={x.status} className="flex items-center justify-between gap-2 text-[13px]">
                      <Badge tone={x.status === 'CREDITED' ? 'good' : x.status === 'IGNORED' ? 'neutral' : 'info'}>
                        {x.status}
                      </Badge>
                      <span className="tabular-nums text-ink-2">{x.count}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-[13px] text-ink-3">None yet.</p>}
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-4">
        <Card>
          <CardHead
            title={`Needs attention — ${stuck.data?.length ?? 0}`}
            subtitle="Payouts that were approved but could not be sent. The member has already been debited."
          />
          {stuck.isLoading ? (
            <div className="px-5 pb-5"><Skeleton className="h-24" /></div>
          ) : !stuck.data?.length ? (
            <div className="flex items-center gap-2.5 px-5 pb-5 text-[13.5px] text-ink-2">
              <CheckCircle2 size={16} className="text-good" />
              Nothing stuck. Every approved payout has been sent or is in flight.
            </div>
          ) : (
            <Table
              head={['Member', 'Amount', 'To', 'Status', 'Tries', 'Why it failed']}
              rows={stuck.data.map((s) => [
                <div key="who">
                  <p className="text-[13px] font-medium text-ink">{s.withdrawal?.user.userCode ?? '—'}</p>
                  <p className="font-mono text-[11px] text-ink-3">{s.withdrawal?.reference ?? ''}</p>
                </div>,
                <span key="amt" className="tabular-nums">{usd(Number(s.amount))}</span>,
                <span key="to" className="font-mono text-[11.5px] text-ink-2">
                  {s.toAddress.slice(0, 8)}…{s.toAddress.slice(-6)}
                </span>,
                <Badge key="st" tone={PAYOUT_TONE[s.status] ?? 'neutral'}>{s.status}</Badge>,
                <span key="tries" className="tabular-nums">{s.attempts}</span>,
                <div key="why">
                  <p className="max-w-md text-[12.5px] leading-relaxed text-ink-2">{s.error ?? '—'}</p>
                  {s.txHash && (
                    <p className="mt-1 flex items-center gap-1 font-mono text-[11px] text-ink-3">
                      <Link2 size={11} /> {s.txHash.slice(0, 18)}…
                    </p>
                  )}
                </div>,
              ])}
            />
          )}
          {!!stuck.data?.length && (
            <p className="flex gap-2 border-t border-line px-5 py-3 text-[12.5px] leading-relaxed text-warn">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              A payout already broadcast is never re-sent — its transaction is checked instead. Only
              ones that provably never left are retried, which is what stops a member being paid twice.
            </p>
          )}
        </Card>
      </div>
    </>
  );
}
