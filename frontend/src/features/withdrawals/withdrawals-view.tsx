'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMoneyMutation } from '@/lib/money-mutation';
import { toast } from 'sonner';
import { toastError } from '@/lib/toast';
import { adminGet, adminPost, adminError } from '@/lib/admin-api';
import { Card, CardHead, PageHeader, Table, Badge, toneFor, Button, Select } from '@/components/ui/primitives';
import { ActionDialog } from '@/components/ui/dialog';
import { Pagination } from '@/components/ui/pagination';
import { usd, shortDate, num } from '@/lib/format';
import { useAdmin } from '@/features/admin/use-admin';

interface Row {
  id: string; userCode: string; email: string; amount: string; fee: string; netAmount: string;
  walletAddress: string; status: string; overdue: boolean; hoursRemaining: number | null;
  txHash: string | null; rejectReason: string | null; createdAt: string;
}

type Pending = { row: Row; action: 'approve' | 'reject' } | null;

export function WithdrawalsView({ title, subtitle }: { title: string; subtitle: string }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState('PENDING');
  const [overdue, setOverdue] = useState(false);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(50);
  const [pending, setPending] = useState<Pending>(null);

  const filter = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(0); };

  const { data } = useQuery({
    queryKey: ['admin', 'withdrawals', status, overdue, page, size],
    queryFn: () => adminGet<{ total: number; rows: Row[] }>('/admin/withdrawals', {
      take: size, skip: page * size,
      status: overdue ? undefined : (status || undefined),
      overdue: overdue || undefined,
    }),
  });

  const { can } = useAdmin();


  const act = useMoneyMutation({
    mutationFn: ({ id, action, values }: { id: string; action: 'approve' | 'reject'; values: Record<string, string> }, key) =>
      adminPost(`/admin/withdrawals/${id}/${action}`,
        action === 'reject'
          ? { reason: values.reason }
          : { txHash: values.txHash?.trim() || undefined },
        key),
    onSuccess: (_d, v) => {
      toast.success(v.action === 'approve' ? 'Payout approved' : 'Rejected — the full amount was refunded');
      setPending(null);
      qc.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e) => toastError(e),
  });

  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <Card>
        <CardHead title={`${num(data?.total ?? 0)} requests`}
          action={
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-[12.5px] text-ink-2">
                <input type="checkbox" checked={overdue} onChange={(e) => filter(setOverdue)(e.target.checked)} className="accent-gold" />
                Past SLA only
              </label>
              <Select label="Filter by withdrawal status" value={status} onChange={filter(setStatus)} className="h-9 text-[12.5px]"
                      options={[{ value: '', label: 'All' }, ...['PENDING','PROCESSED','REJECTED'].map((s) => ({ value: s, label: s }))]} />
            </div>
          } />
        <Table
          head={['Requested', 'User', 'Amount', 'Fee', 'Net', 'Address', 'SLA', 'Status', '']}
          empty="No withdrawal requests in this view."
          rows={(data?.rows ?? []).map((w) => [
            <span key="a" className="text-ink-2">{shortDate(w.createdAt)}</span>,
            <span key="b" className="font-medium">{w.userCode}</span>,
            <span key="c" className="font-medium tabular-nums">{usd(w.amount)}</span>,
            <span key="d" className="tabular-nums text-ink-2">{usd(w.fee)}</span>,
            <span key="e" className="tabular-nums">{usd(w.netAmount)}</span>,
            <span key="f" className="text-ink-2">{w.walletAddress.slice(0, 8)}…{w.walletAddress.slice(-4)}</span>,
            w.status !== 'PENDING' ? <span key="g" className="text-ink-3">—</span>
              : w.overdue ? <Badge key="g" tone="bad">overdue</Badge>
              : <span key="g" className="tabular-nums text-ink-2">{w.hoursRemaining}h left</span>,
            <span key="h" className="inline-flex items-center gap-1.5">
              <Badge tone={toneFor(w.status)}>{w.status}</Badge>
              {/* the operator's own words and the on-chain proof, where they exist */}
              {w.txHash && <span title={w.txHash} className="text-[11px] tabular-nums text-ink-3">{w.txHash.slice(0, 8)}…</span>}
              {w.rejectReason && <span title={w.rejectReason} className="max-w-[140px] truncate text-[11px] text-ink-3">{w.rejectReason}</span>}
            </span>,
            w.status === 'PENDING' ? (
              <div key="i" className="flex gap-2">
                {/* Gated on the same keys the API gates on. A support agent can
                    read this queue but not decide it, and showing them a button
                    that 403s is worse than not showing it. */}
                {can('withdrawals.approve') && (
                  <Button size="sm" onClick={() => setPending({ row: w, action: 'approve' })}>Approve</Button>
                )}
                {can('withdrawals.reject') && (
                  <Button size="sm" variant="outline" onClick={() => setPending({ row: w, action: 'reject' })}>Reject</Button>
                )}
                {!can('withdrawals.approve') && !can('withdrawals.reject') && (
                  <span className="text-[11.5px] text-ink-3">View only</span>
                )}
              </div>
            ) : <span key="j" className="text-ink-3">—</span>,
          ])}
        />
        <Pagination total={data?.total ?? 0} page={page} pageSize={size} onPage={setPage} onPageSize={setSize} />
      </Card>

      <ActionDialog
        open={pending?.action === 'approve'}
        onClose={() => setPending(null)}
        pending={act.isPending}
        tone="primary"
        title={`Approve payout of ${pending ? usd(pending.row.netAmount) : ''}?`}
        body={pending
          ? `${pending.row.userCode} receives ${usd(pending.row.netAmount)} net of a ${usd(pending.row.fee)} fee, sent to ${pending.row.walletAddress}. The balance was already debited when the request was made, so approving does not move funds again.`
          : undefined}
        confirmLabel="Approve payout"
        fields={[{
          name: 'txHash', label: 'Transaction hash',
          placeholder: '0x… (optional)',
          help: 'Recorded against the withdrawal as proof of the on-chain transfer. Leave empty if you are sending it later.',
        }]}
        onConfirm={(values) => pending && act.mutate({ id: pending.row.id, action: 'approve', values })}
      />

      <ActionDialog
        open={pending?.action === 'reject'}
        onClose={() => setPending(null)}
        pending={act.isPending}
        tone="danger"
        title="Reject this withdrawal?"
        body={pending
          ? `${usd(pending.row.amount)} will be refunded to ${pending.row.userCode} in full, fee included. The reason is stored on the request and written to the audit log.`
          : undefined}
        confirmLabel="Reject and refund"
        fields={[{
          name: 'reason', label: 'Reason for rejection', required: true, minLength: 3, multiline: true,
          placeholder: 'e.g. wallet address failed verification',
          help: 'The member sees this, and it is what the audit trail will show.',
        }]}
        onConfirm={(values) => pending && act.mutate({ id: pending.row.id, action: 'reject', values })}
      />
    </>
  );
}
