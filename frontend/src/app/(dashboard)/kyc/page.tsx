'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { toastError } from '@/lib/toast';
import { clsx } from 'clsx';
import { CheckCircle2, Clock, ShieldCheck, Upload, X, XCircle } from 'lucide-react';
import { get, post, apiErrorMessage } from '@/lib/api';
import { Card, CardHead, Badge, Button, controlCls } from '@/components/ui/primitives';
import { shortDate } from '@/lib/format';

interface Submission {
  id: string; status: string; fullName: string; documentNo: string; countryCode: string;
  rejectionReason: string | null; reviewedAt: string | null; createdAt: string;
  documents: { id: string; type: string; mimeType: string; sizeBytes: number }[];
}
interface Current { status: string; submission: Submission | null }

const SLOTS = [
  { type: 'ID_FRONT', label: 'ID — front', required: true, hint: 'Passport, driving licence or national ID' },
  { type: 'ID_BACK', label: 'ID — back', required: false, hint: 'Only if your document has one' },
  { type: 'SELFIE', label: 'Selfie holding your ID', required: true, hint: 'Your face and the document both readable' },
  { type: 'PROOF_OF_ADDRESS', label: 'Proof of address', required: false, hint: 'Utility bill or statement, last 3 months' },
] as const;

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';

/** Strip the `data:*;base64,` prefix — the API wants the payload only. */
const toBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('Could not read that file'));
    reader.readAsDataURL(file);
  });

export default function KycPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ fullName: '', documentNo: '', countryCode: '', dateOfBirth: '' });
  const [files, setFiles] = useState<Record<string, File>>({});

  const { data, isLoading } = useQuery({ queryKey: ['member', 'kyc'], queryFn: () => get<Current>('/kyc') });

  const submit = useMutation({
    mutationFn: async () => {
      const documents = await Promise.all(
        Object.entries(files).map(async ([type, file]) => ({
          type, mimeType: file.type, data: await toBase64(file),
        })),
      );
      return post('/kyc', { ...form, dateOfBirth: form.dateOfBirth || undefined, documents });
    },
    onSuccess: () => {
      toast.success('Submitted — we will review it shortly');
      setFiles({});
      qc.invalidateQueries({ queryKey: ['member', 'kyc'] });
    },
    onError: (e) => toastError(e),
  });

  const pick = (type: string, file: File | undefined) => {
    if (!file) { setFiles((s) => { const n = { ...s }; delete n[type]; return n; }); return; }
    if (file.size > MAX_BYTES) { toast.error('Files must be 8MB or smaller'); return; }
    if (!ACCEPT.split(',').includes(file.type)) { toast.error('Use a JPEG, PNG, WebP or PDF'); return; }
    setFiles((s) => ({ ...s, [type]: file }));
  };

  const sub = data?.submission;
  const status = data?.status ?? 'NOT_STARTED';
  const locked = status === 'PENDING' || status === 'APPROVED';
  const ready =
    form.fullName.trim().length >= 2 &&
    form.documentNo.trim().length >= 3 &&
    form.countryCode.trim().length === 2 &&
    !!files.ID_FRONT && !!files.SELFIE;

  return (
    <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-12">
      <div className="lg:col-span-5">
        <Card>
          <CardHead title="Verification status" />
          <div className="px-5 pb-5">
            {isLoading ? (
              <p className="py-6 text-center text-[13px] text-ink-2">Loading…</p>
            ) : status === 'APPROVED' ? (
              <div className="flex items-start gap-3 rounded-[5px] border border-good/30 bg-good-soft px-4 py-3">
                <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-good" />
                <div>
                  <p className="text-[13.5px] font-medium text-good-on">Your identity is verified</p>
                  <p className="mt-0.5 text-[12px] text-ink-2">
                    Approved{sub?.reviewedAt ? ` on ${shortDate(sub.reviewedAt)}` : ''}. Nothing further is needed.
                  </p>
                </div>
              </div>
            ) : status === 'PENDING' ? (
              <div className="flex items-start gap-3 rounded-[5px] border border-warn/30 bg-warn-soft px-4 py-3">
                <Clock size={18} className="mt-0.5 shrink-0 text-warn" />
                <div>
                  <p className="text-[13.5px] font-medium text-warn-on">Under review</p>
                  <p className="mt-0.5 text-[12px] text-ink-2">
                    Submitted {sub ? shortDate(sub.createdAt) : ''} with {sub?.documents.length ?? 0} document
                    {sub?.documents.length === 1 ? '' : 's'}. Most reviews finish within one business day.
                  </p>
                </div>
              </div>
            ) : status === 'REJECTED' ? (
              <div className="flex items-start gap-3 rounded-[5px] border border-bad/30 bg-bad-soft px-4 py-3">
                <XCircle size={18} className="mt-0.5 shrink-0 text-bad" />
                <div>
                  <p className="text-[13.5px] font-medium text-bad-on">Not accepted</p>
                  <p className="mt-0.5 text-[12px] text-ink-2">{sub?.rejectionReason}</p>
                  <p className="mt-1 text-[12px] text-ink-2">Correct the problem and submit again below.</p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3 rounded-[5px] border border-line bg-canvas px-4 py-3">
                <ShieldCheck size={18} className="mt-0.5 shrink-0 text-ink-3" />
                <div>
                  <p className="text-[13.5px] font-medium text-ink">Not started</p>
                  <p className="mt-0.5 text-[12px] text-ink-2">
                    Verifying your identity keeps withdrawals flowing without manual checks.
                  </p>
                </div>
              </div>
            )}

            {sub && (
              <dl className="mt-4 space-y-2 text-[12.5px]">
                {[['Name', sub.fullName], ['Document', sub.documentNo], ['Country', sub.countryCode]].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3">
                    <dt className="text-ink-2">{k}</dt>
                    <dd className="truncate font-medium text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </Card>
      </div>

      <div className="lg:col-span-7">
        <Card>
          <CardHead
            title={status === 'REJECTED' ? 'Submit again' : 'Verify your identity'}
            action={locked ? <Badge tone={status === 'APPROVED' ? 'good' : 'warn'}>{status.toLowerCase()}</Badge> : undefined}
          />
          <div className="px-5 pb-5">
            {locked ? (
              <p className="py-8 text-center text-[13px] text-ink-2">
                {status === 'APPROVED'
                  ? 'Your documents have been accepted — there is nothing to submit.'
                  : 'Your submission is with our team. We will email you when it has been reviewed.'}
              </p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  {([
                    ['fullName', 'Full name, exactly as on your ID', 'text', 'Priya Sharma'],
                    ['documentNo', 'Document number', 'text', 'X1234567'],
                    ['countryCode', 'Issuing country (2 letters)', 'text', 'IN'],
                    ['dateOfBirth', 'Date of birth', 'date', ''],
                  ] as const).map(([key, label, type, placeholder]) => (
                    <label key={key} className="block">
                      <span className="mb-1 block text-[12px] font-medium text-ink-2">{label}</span>
                      <input
                        type={type} value={form[key]} placeholder={placeholder}
                        maxLength={key === 'countryCode' ? 2 : undefined}
                        onChange={(e) => setForm((s) => ({
                          ...s,
                          [key]: key === 'countryCode' ? e.target.value.toUpperCase() : e.target.value,
                        }))}
                        className={`${controlCls} w-full`}
                      />
                    </label>
                  ))}
                </div>

                <p className="mb-2 mt-4 text-[12px] font-medium text-ink-2">Documents</p>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {SLOTS.map((slot) => {
                    const file = files[slot.type];
                    return (
                      <div key={slot.type}
                           className={clsx('rounded-[5px] border px-3 py-2.5 transition',
                             file ? 'border-gold bg-gold-soft' : 'border-line bg-canvas')}>
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">
                            {slot.label}{slot.required && <span className="text-bad"> *</span>}
                          </span>
                          {file && (
                            <button onClick={() => pick(slot.type, undefined)} aria-label={`Remove ${slot.label}`}
                                    className="rounded p-1 text-ink-3 transition hover:text-bad">
                              <X size={13} />
                            </button>
                          )}
                        </div>
                        {file ? (
                          <p className="mt-1 truncate text-[11.5px] text-ink-2">
                            {file.name} · {Math.max(1, Math.round(file.size / 1024))} KB
                          </p>
                        ) : (
                          <>
                            <p className="mt-0.5 text-[11.5px] text-ink-3">{slot.hint}</p>
                            <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-[4px] border border-line bg-card px-2.5 py-1.5 text-[12px] font-medium text-ink transition hover:border-line-strong">
                              <Upload size={12} /> Choose file
                              <input type="file" accept={ACCEPT} className="hidden"
                                     onChange={(e) => pick(slot.type, e.target.files?.[0])} />
                            </label>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[11.5px] text-ink-3">
                    JPEG, PNG, WebP or PDF, up to 8MB each. Your documents are stored privately and are only
                    ever seen by the reviewer.
                  </p>
                  <Button loading={submit.isPending} disabled={!ready} onClick={() => submit.mutate()}>
                    <ShieldCheck size={14} /> Submit for review
                  </Button>
                </div>
              </>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
