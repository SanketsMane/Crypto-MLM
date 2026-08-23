'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMoneyMutation } from '@/lib/money-mutation';
import { toast } from 'sonner';
import { toastError } from '@/lib/toast';
import { adminGet, adminPost, adminError } from '@/lib/admin-api';
import { Card, CardHead, PageHeader, Table, Badge, toneFor, Button, Select } from '@/components/ui/primitives';
import { ExportButton } from '@/components/admin/export-button';
import { ActionDialog } from '@/components/ui/dialog';
import { Pagination } from '@/components/ui/pagination';
import { usd, shortDate, num } from '@/lib/format';
import { useAdmin } from '@/features/admin/use-admin';

interface Row {
  id: string; userCode: string; email: string; amount: string; network: string;
  txHash: string | null; reference: string; status: string; createdAt: string;
}
type Pending = { row: Row; action: 'confirm' | 'reject' } | null;

export default function DepositsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('PENDING');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(50);
  const [pending, setPending] = useState<Pending>(null);

  const { data } = useQuery({
    queryKey: ['admin', 'deposits', status, page, size],
    queryFn: () => adminGet<{ total: number; rows: Row[] }>('/admin/deposits', {
      take: size, skip: page * size, status: status || undefined,
    }),
  });

  const { can } = useAdmin();


  const act = useMoneyMutation({
    mutationFn: ({ id, action, values }: { id: string; action: 'confirm' | 'reject'; values: Record<string, string> }, key) =>
      adminPost(`/admin/deposits/${id}/${action}`, action === 'reject' ? { reason: values.reason } : {}, key),
    onSuccess: (_d, v) => {
      toast.success(v.action === 'confirm' ? 'Deposit confirmed — funds credited' : 'Deposit rejected');
      setPending(null);
      qc.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e) => toastError(e),
  });

  return (
    <>
      <PageHeader title="Deposits" subtitle="Incoming USDT BEP-20 funding, awaiting confirmation." />
      <Card>
        <CardHead title={`${num(data?.total ?? 0)} deposits`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Select label="Filter by deposit status" value={status} onChange={(v) => { setStatus(v); setPage(0); }} className="h-9 text-[12.5px]"
                            options={[{ value: '', label: 'All' }, ...['PENDING','PROCESSED','REJECTED'].map((s) => ({ value: s, label: s }))]} />
              <ExportButton resource="deposits" filters={{ status: status || undefined }} />
            </div>
          } />
        <Table
          head={['Date', 'User', 'Amount', 'Network', 'Tx hash', 'Status', '']}
          empty="No deposits in this view."
          rows={(data?.rows ?? []).map((d) => [
            <span key="a" className="text-ink-2">{shortDate(d.createdAt)}</span>,
            <span key="b" className="font-medium">{d.userCode}</span>,
            <span key="c" className="font-medium tabular-nums">{usd(d.amount)}</span>,
            d.network,
            <span key="e" className="text-ink-2" title={d.txHash ?? undefined}>{d.txHash ? `${d.txHash.slice(0, 12)}…` : '—'}</span>,
            <Badge key="f" tone={toneFor(d.status)}>{d.status}</Badge>,
            d.status === 'PENDING' ? (
              <div key="g" className="flex gap-2">
                {can('deposits.approve') && (
                  <Button size="sm" onClick={() => setPending({ row: d, action: 'confirm' })}>Confirm</Button>
                )}
                {can('deposits.reject') && (
                  <Button size="sm" variant="outline" onClick={() => setPending({ row: d, action: 'reject' })}>Reject</Button>
                )}
                {!can('deposits.approve') && !can('deposits.reject') && (
                  <span className="text-[11.5px] text-ink-3">View only</span>
                )}
              </div>
            ) : <span key="h" className="text-ink-3">—</span>,
          ])}
        />
        <Pagination total={data?.total ?? 0} page={page} pageSize={size} onPage={setPage} onPageSize={setSize} />
      </Card>

      <ActionDialog
        open={pending?.action === 'confirm'}
        onClose={() => setPending(null)}
        pending={act.isPending}
        title={`Credit ${pending ? usd(pending.row.amount) : ''} to ${pending?.row.userCode}?`}
        body={pending
          ? `This posts a ledger entry against ${pending.row.userCode}'s FUND wallet, which is the balance that buys packages. Confirm only once you have seen the funds on chain — crediting cannot be undone, only offset by a manual adjustment.`
          : undefined}
        confirmLabel="Confirm deposit"
        onConfirm={() => pending && act.mutate({ id: pending.row.id, action: 'confirm', values: {} })}
      />

      <ActionDialog
        open={pending?.action === 'reject'}
        onClose={() => setPending(null)}
        pending={act.isPending}
        tone="danger"
        title="Reject this deposit?"
        body={pending ? `No funds are credited to ${pending.row.userCode}. The reason is written to the audit log.` : undefined}
        confirmLabel="Reject deposit"
        fields={[{
          name: 'reason', label: 'Reason for rejection', required: true, minLength: 3, multiline: true,
          placeholder: 'e.g. no matching transaction on chain',
          help: 'This is what the audit trail will show against your name.',
        }]}
        onConfirm={(values) => pending && act.mutate({ id: pending.row.id, action: 'reject', values })}
      />
    </>
  );
}
