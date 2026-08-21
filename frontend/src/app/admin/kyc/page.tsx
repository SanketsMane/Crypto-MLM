'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { toastError } from '@/lib/toast';
import { clsx } from 'clsx';
import { Search, ShieldCheck } from 'lucide-react';
import { adminGet, adminPost, adminError } from '@/lib/admin-api';
import { Card, CardHead, PageHeader, Badge, Button, Select, Skeleton, controlCls, type Tone } from '@/components/ui/primitives';
import { ActionDialog } from '@/components/ui/dialog';
import { Pagination } from '@/components/ui/pagination';
import { DocumentViewer } from '@/components/admin/document-viewer';
import { usd, num, shortDate, ago } from '@/lib/format';

interface Row {
  id: string; status: string; fullName: string; documentNo: string; countryCode: string;
  documentCount: number; rejectionReason: string | null; reviewedAt: string | null; createdAt: string;
  user: { id: string; userCode: string; email: string; status: string };
}
interface Doc { id: string; type: string; mimeType: string; sizeBytes: number; createdAt: string }
interface Detail {
  id: string; status: string; fullName: string; documentNo: string; countryCode: string;
  dateOfBirth: string | null; rejectionReason: string | null;
  reviewedAt: string | null; reviewedByName: string | null; createdAt: string;
  user: {
    id: string; userCode: string; email: string; phone: string | null; name: string;
    status: string; totalInvested: string; walletAddress: string | null; createdAt: string;
  };
  documents: Doc[];
  history: { id: string; status: string; rejectionReason: string | null; createdAt: string; reviewedAt: string | null }[];
}

const tone = (s: string): Tone => (s === 'APPROVED' ? 'good' : s === 'REJECTED' ? 'bad' : 'warn');
const DOC_LABEL: Record<string, string> = {
  ID_FRONT: 'ID — front', ID_BACK: 'ID — back',
  PROOF_OF_ADDRESS: 'Proof of address', SELFIE: 'Selfie',
};

export default function KycPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('PENDING');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(25);
  const [openId, setOpenId] = useState<string | null>(null);
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null);

  const on = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(0); };

  const list = useQuery({
    queryKey: ['admin', 'kyc', status, q, page, size],
    queryFn: () => adminGet<{ total: number; pending: number; rows: Row[] }>('/admin/kyc', {
      take: size, skip: page * size, status: status || undefined, q: q || undefined,
    }),
    refetchInterval: 60_000,
  });

  const detail = useQuery({
    queryKey: ['admin', 'kyc', 'detail', openId],
    queryFn: () => adminGet<Detail>(`/admin/kyc/${openId}`),
    enabled: !!openId,
  });

  const decide = useMutation({
    mutationFn: ({ action, reason }: { action: 'approve' | 'reject'; reason?: string }) =>
      adminPost(`/admin/kyc/${openId}/${action}`, action === 'reject' ? { reason } : {}),
    onSuccess: (_d, v) => {
      toast.success(v.action === 'approve' ? 'Identity verified' : 'Submission rejected');
      setDecision(null);
      qc.invalidateQueries({ queryKey: ['admin', 'kyc'] });
    },
    onError: (e) => toastError(e),
  });

  const d = detail.data;

  return (
    <>
      <PageHeader
        title="KYC Verification"
        subtitle="Identity submissions awaiting review. Documents are streamed to you on demand — they are never given a public URL or cached by the browser."
      />

      <div className="grid grid-cols-1 items-start gap-3.5 xl:grid-cols-12">
        <Card className="xl:col-span-5">
          <CardHead
            title={`${num(list.data?.total ?? 0)} submissions`}
            action={list.data?.pending
              ? <Badge tone="warn">{num(list.data.pending)} awaiting review</Badge>
              : undefined}
          />
          <div className="flex flex-wrap items-center gap-2 px-5 pb-3">
            <Select value={status} onChange={on(setStatus)} className="h-9 text-[12.5px]"
                    options={[{ value: '', label: 'All' },
                              ...['PENDING', 'APPROVED', 'REJECTED'].map((s) => ({ value: s, label: s }))]} />
            <label className="relative flex flex-1 items-center">
              <Search size={15} className="pointer-events-none absolute left-3 text-ink-3" />
              <input value={q} onChange={(e) => on(setQ)(e.target.value)} placeholder="Name, document no. or member"
                     className={`${controlCls} h-9 w-full pl-9 text-[12.5px]`} />
            </label>
          </div>

          {list.isLoading ? (
            <div className="space-y-2 px-5 pb-5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
          ) : (list.data?.rows.length ?? 0) === 0 ? (
            <p className="px-5 py-14 text-center text-[13.5px] text-ink-2">
              {status === 'PENDING' ? 'Nothing is waiting for review.' : 'No submissions match these filters.'}
            </p>
          ) : (
            <ul className="border-t border-line">
              {(list.data?.rows ?? []).map((row) => (
                <li key={row.id}>
                  <button onClick={() => setOpenId(row.id)}
                          className={clsx('w-full border-b border-line-soft px-5 py-3 text-left transition',
                            openId === row.id ? 'bg-gold-soft' : 'hover:bg-row-hover')}>
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">{row.fullName}</span>
                      <Badge tone={tone(row.status)}>{row.status}</Badge>
                    </div>
                    <p className="mt-1 truncate text-[12px] text-ink-2">
                      <span className="font-medium">{row.user.userCode}</span> · {row.countryCode} · {row.documentCount} document{row.documentCount === 1 ? '' : 's'}
                    </p>
                    <p className="mt-0.5 text-[11px] text-ink-3">submitted {ago(row.createdAt)}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Pagination total={list.data?.total ?? 0} page={page} pageSize={size} onPage={setPage} onPageSize={setSize} sizes={[10, 25, 50]} />
        </Card>

        <Card className="xl:col-span-7">
          {!openId ? (
            <p className="px-5 py-20 text-center text-[13.5px] text-ink-2">Select a submission to review its documents.</p>
          ) : detail.isLoading || !d ? (
            <div className="space-y-3 p-5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
          ) : (
            <>
              <CardHead
                title={d.fullName}
                action={
                  <div className="flex items-center gap-2">
                    <Badge tone={tone(d.status)}>{d.status}</Badge>
                    {d.status === 'PENDING' && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setDecision('reject')}>Reject</Button>
                        <Button size="sm" onClick={() => setDecision('approve')}><ShieldCheck size={14} /> Approve</Button>
                      </>
                    )}
                  </div>
                }
              />

              <dl className="grid grid-cols-2 gap-px border-y border-line bg-line sm:grid-cols-4">
                {[
                  { k: 'Member', v: d.user.userCode },
                  { k: 'Document no.', v: d.documentNo },
                  { k: 'Country', v: d.countryCode },
                  { k: 'Invested', v: usd(d.user.totalInvested) },
                ].map((s) => (
                  <div key={s.k} className="bg-card px-4 py-2.5">
                    <dt className="text-[10.5px] uppercase tracking-[0.04em] text-ink-2">{s.k}</dt>
                    <dd className="mt-0.5 truncate text-[13px] font-medium tabular-nums text-ink">{s.v}</dd>
                  </div>
                ))}
              </dl>

              {d.status !== 'PENDING' && (
                <p className="border-b border-line bg-canvas px-5 py-2.5 text-[12px] text-ink-2">
                  {d.status === 'APPROVED' ? 'Approved' : 'Rejected'}
                  {d.reviewedByName && <> by <span className="font-medium text-ink">{d.reviewedByName}</span></>}
                  {d.reviewedAt && <> on {shortDate(d.reviewedAt)}</>}
                  {d.rejectionReason && <> — {d.rejectionReason}</>}
                </p>
              )}

              <div className="grid gap-3 p-5 sm:grid-cols-2">
                {d.documents.map((doc) => (
                  <DocumentViewer key={doc.id} id={doc.id} label={DOC_LABEL[doc.type] ?? doc.type}
                                  mimeType={doc.mimeType} sizeBytes={doc.sizeBytes} />
                ))}
                {d.documents.length === 0 && (
                  <p className="col-span-full py-8 text-center text-[13px] text-ink-2">This submission has no documents attached.</p>
                )}
              </div>

              {d.history.length > 0 && (
                <div className="border-t border-line px-5 py-4">
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.04em] text-ink-2">Earlier attempts</p>
                  <ul className="space-y-1.5">
                    {d.history.map((h) => (
                      <li key={h.id} className="flex items-center gap-2 text-[12px] text-ink-2">
                        <Badge tone={tone(h.status)}>{h.status}</Badge>
                        <span>{shortDate(h.createdAt)}</span>
                        {h.rejectionReason && <span className="truncate text-ink-3">— {h.rejectionReason}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      <ActionDialog
        open={decision === 'approve'}
        onClose={() => setDecision(null)}
        pending={decide.isPending}
        title={d ? `Verify ${d.fullName}?` : ''}
        body={d ? `Marks ${d.user.userCode} as identity-verified. If the account is still awaiting verification it becomes active. Confirm only once you have read every document.` : undefined}
        confirmLabel="Approve verification"
        onConfirm={() => decide.mutate({ action: 'approve' })}
      />

      <ActionDialog
        open={decision === 'reject'}
        onClose={() => setDecision(null)}
        pending={decide.isPending}
        tone="danger"
        title="Reject this submission?"
        body={d ? `${d.user.userCode} can submit again. The reason is shown to them and written to the audit log.` : undefined}
        confirmLabel="Reject submission"
        fields={[{
          name: 'reason', label: 'Reason for rejection', required: true, minLength: 3, multiline: true,
          placeholder: 'e.g. document is expired / name does not match the account',
          help: 'Be specific — this is what the member has to act on.',
        }]}
        onConfirm={(v) => decide.mutate({ action: 'reject', reason: v.reason })}
      />
    </>
  );
}
