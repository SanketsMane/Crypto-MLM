'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { toastError } from '@/lib/toast';
import { clsx } from 'clsx';
import { FileCheck2, Search, ShieldCheck, ShieldX, UserRound } from 'lucide-react';
import { adminGet, adminPost } from '@/lib/admin-api';
import { PageHeader, Badge, Button, Skeleton, controlCls, type Tone } from '@/components/ui/primitives';
import { ActionDialog } from '@/components/ui/dialog';
import { Pagination } from '@/components/ui/pagination';
import { DocumentViewer } from '@/components/admin/document-viewer';
import { KycChecks, type ReviewCheck, type CheckLevel } from '@/components/admin/kyc-checks';
import {
  Workbench, Rail, Detail, DetailBar, QueueTabs, QueueRow, EmptyDetail, FactGrid, useQueueKeys,
} from '@/components/admin/workbench';
import { usd, num, shortDate, ago } from '@/lib/format';
import { useAdmin } from '@/features/admin/use-admin';

interface Row {
  id: string; status: string; fullName: string; documentNo: string; countryCode: string;
  documentCount: number; rejectionReason: string | null; reviewedAt: string | null; createdAt: string;
  user: { id: string; userCode: string; email: string; status: string };
}
interface Doc { id: string; type: string; mimeType: string; sizeBytes: number; createdAt: string }
interface Detail_ {
  id: string; status: string; fullName: string; documentNo: string; countryCode: string;
  dateOfBirth: string | null; rejectionReason: string | null;
  reviewedAt: string | null; reviewedByName: string | null; createdAt: string;
  user: {
    id: string; userCode: string; email: string; phone: string | null; name: string;
    status: string; totalInvested: string; walletAddress: string | null; createdAt: string;
  };
  documents: Doc[];
  history: { id: string; status: string; rejectionReason: string | null; createdAt: string; reviewedAt: string | null }[];
  checks: ReviewCheck[];
  checkLevel: CheckLevel;
}

const tone = (s: string): Tone => (s === 'APPROVED' ? 'good' : s === 'REJECTED' ? 'bad' : 'warn');
const DOC_LABEL: Record<string, string> = {
  ID_FRONT: 'ID — front', ID_BACK: 'ID — back',
  PROOF_OF_ADDRESS: 'Proof of address', SELFIE: 'Selfie',
};

/** Loose comparison for the name check — casing and spacing are not mismatches. */
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

export default function KycPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('PENDING');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(25);
  const [openId, setOpenId] = useState<string | null>(null);
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null);

  const on = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(0); };
  const { can } = useAdmin();

  const list = useQuery({
    queryKey: ['admin', 'kyc', status, q, page, size],
    queryFn: () => adminGet<{ total: number; pending: number; rows: Row[] }>('/admin/kyc', {
      take: size, skip: page * size, status: status || undefined, q: q || undefined,
    }),
    refetchInterval: 60_000,
  });

  const detail = useQuery({
    queryKey: ['admin', 'kyc', 'detail', openId],
    queryFn: () => adminGet<Detail_>(`/admin/kyc/${openId}`),
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

  const rows = list.data?.rows ?? [];
  useQueueKeys(rows.map((r) => r.id), openId, setOpenId);

  const d = detail.data;
  const nameMatches = d ? norm(d.user.name || '') === norm(d.fullName) : false;
  const reviewable = d?.status === 'PENDING' && can('kyc.review');

  return (
    <>
      <PageHeader
        title="KYC Verification"
        subtitle="Identity submissions awaiting review. Documents are streamed to you on demand — they are never given a public URL or cached by the browser."
      />

      <Workbench>
        {/* ── queue ─────────────────────────────────────────────────── */}
        <Rail>
          <div className="shrink-0 border-b border-line">
            <div className="flex items-center justify-between gap-3 px-5 pb-2.5 pt-4">
              <h2 className="text-[15px] font-semibold text-ink">{num(list.data?.total ?? 0)} submissions</h2>
              {!!list.data?.pending && <Badge tone="warn">{num(list.data.pending)} to review</Badge>}
            </div>

            <QueueTabs
              value={status}
              onChange={on(setStatus)}
              tabs={[
                { value: 'PENDING', label: 'Pending', count: list.data?.pending },
                { value: 'APPROVED', label: 'Approved' },
                { value: 'REJECTED', label: 'Rejected' },
                { value: '', label: 'All' },
              ]}
            />

            <div className="px-5 pb-3">
              <label className="relative flex items-center">
                <Search size={15} className="pointer-events-none absolute left-3 text-ink-3" />
                <span className="sr-only">Search submissions</span>
                <input value={q} onChange={(e) => on(setQ)(e.target.value)}
                       placeholder="Name, document no. or member"
                       className={`${controlCls} h-9 w-full pl-9 text-[12.5px]`} />
              </label>
            </div>
          </div>

          <div className="fx-scrollbar-hide min-h-0 flex-1 overflow-y-auto">
            {list.isLoading ? (
              <div className="space-y-2 p-5">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
            ) : rows.length === 0 ? (
              <p className="px-5 py-14 text-center text-[13.5px] text-ink-2">
                {status === 'PENDING' ? 'Nothing is waiting for review.' : 'No submissions match these filters.'}
              </p>
            ) : (
              <ul>
                {rows.map((row) => (
                  <li key={row.id}>
                    <QueueRow selected={openId === row.id} onSelect={() => setOpenId(row.id)}>
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">{row.fullName}</span>
                        <Badge tone={tone(row.status)}>{row.status}</Badge>
                      </div>
                      <p className="mt-1 truncate text-[12px] text-ink-2">
                        <span className="font-medium">{row.user.userCode}</span> · {row.countryCode} ·{' '}
                        {row.documentCount} document{row.documentCount === 1 ? '' : 's'}
                      </p>
                      <p className="mt-0.5 text-[11px] text-ink-3">submitted {ago(row.createdAt)}</p>
                    </QueueRow>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="shrink-0 border-t border-line">
            <Pagination total={list.data?.total ?? 0} page={page} pageSize={size}
                        onPage={setPage} onPageSize={setSize} sizes={[10, 25, 50]} />
          </div>
        </Rail>

        {/* ── review ────────────────────────────────────────────────── */}
        <Detail>
          {!openId ? (
            <EmptyDetail
              icon={<FileCheck2 size={22} />}
              title="No submission selected"
              hint="Pick someone from the queue to read their documents and decide."
            />
          ) : detail.isLoading || !d ? (
            <div className="space-y-3 p-5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
          ) : (
            <>
              <DetailBar
                title={d.fullName}
                subtitle={<>{d.user.userCode} · submitted {ago(d.createdAt)}</>}
              >
                <Badge tone={tone(d.status)}>{d.status}</Badge>
                {reviewable && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setDecision('reject')}>
                      <ShieldX size={14} /> Reject
                    </Button>
                    <Button
                      size="sm"
                      disabled={d.checkLevel === 'FAIL'}
                      onClick={() => setDecision('approve')}
                    >
                      <ShieldCheck size={14} /> Approve
                    </Button>
                  </>
                )}
              </DetailBar>

              {d.status === 'PENDING' && !can('kyc.review') && (
                <div className="flex items-start gap-2.5 border-b border-line bg-canvas px-5 py-3">
                  <ShieldCheck size={15} className="mt-[1px] shrink-0 text-ink-3" />
                  <p className="text-[12px] leading-relaxed text-ink-2">
                    Read-only. Deciding an identity check needs the “Approve or reject KYC” permission —
                    you can read the submission and its documents, but not rule on it.
                  </p>
                </div>
              )}

              {reviewable && d.checkLevel === 'FAIL' && (
                <div className="flex items-start gap-2.5 border-b border-line bg-bad-soft px-5 py-3">
                  <ShieldX size={15} className="mt-[1px] shrink-0 text-bad-on" />
                  <p className="text-[12px] leading-relaxed text-bad-on">
                    A verification check is failing, so approval is blocked. Read the checks below — if the
                    submission is genuinely wrong, reject it with a reason the member can act on.
                  </p>
                </div>
              )}

              {/* The comparison the whole review turns on, given its own row
                  rather than buried as two cells in an eight-cell grid. */}
              <div className="border-b border-line bg-canvas px-5 py-3.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-ink-2">Name check</span>
                  <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11px] font-medium',
                    nameMatches ? 'bg-good-soft text-good-on' : 'bg-warn-soft text-warn-on')}>
                    {nameMatches ? 'Matches the account' : 'Differs from the account'}
                  </span>
                </div>
                <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                  {[
                    { k: 'On the account', v: d.user.name || '—', Icon: UserRound },
                    { k: 'On the document', v: d.fullName, Icon: FileCheck2 },
                  ].map(({ k, v, Icon }) => (
                    <div key={k} className={clsx('flex items-center gap-2.5 rounded-[10px] border bg-card px-3.5 py-2.5',
                      nameMatches ? 'border-line' : 'border-warn/35')}>
                      <Icon size={15} className="shrink-0 text-ink-3" aria-hidden />
                      <div className="min-w-0">
                        <p className="text-[10.5px] uppercase tracking-[0.04em] text-ink-2">{k}</p>
                        <p className="truncate text-[13.5px] font-semibold text-ink">{v}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <FactGrid facts={[
                { k: 'Document no.', v: d.documentNo, strong: true },
                { k: 'Country', v: d.countryCode },
                { k: 'Date of birth', v: d.dateOfBirth ? shortDate(d.dateOfBirth) : 'Not supplied' },
                { k: 'Invested', v: usd(d.user.totalInvested) },
                { k: 'Member', v: d.user.userCode },
                { k: 'Email', v: d.user.email },
                { k: 'Account', v: d.user.status },
                { k: 'Joined', v: shortDate(d.user.createdAt) },
              ]} />

              {d.status !== 'PENDING' && (
                <p className="border-b border-line bg-canvas px-5 py-2.5 text-[12px] text-ink-2">
                  {d.status === 'APPROVED' ? 'Approved' : 'Rejected'}
                  {d.reviewedByName && <> by <span className="font-medium text-ink">{d.reviewedByName}</span></>}
                  {d.reviewedAt && <> on {shortDate(d.reviewedAt)}</>}
                  {d.rejectionReason && <> — {d.rejectionReason}</>}
                </p>
              )}

              <KycChecks checks={d.checks} />

              <div className="p-5">
                <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-2">
                  Documents ({d.documents.length})
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {d.documents.map((doc) => (
                    <DocumentViewer key={doc.id} id={doc.id} label={DOC_LABEL[doc.type] ?? doc.type}
                                    mimeType={doc.mimeType} sizeBytes={doc.sizeBytes} />
                  ))}
                  {d.documents.length === 0 && (
                    <p className="col-span-full rounded-[10px] border border-dashed border-line py-8 text-center text-[13px] text-ink-2">
                      This submission has no documents attached.
                    </p>
                  )}
                </div>
              </div>

              {d.history.length > 0 && (
                <div className="border-t border-line px-5 py-4">
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-2">Earlier attempts</p>
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
        </Detail>
      </Workbench>

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
