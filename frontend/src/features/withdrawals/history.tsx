'use client';

import { useState } from 'react';
import { ChevronDown, Copy, ExternalLink } from 'lucide-react';
import { clsx } from 'clsx';
import { toast } from 'sonner';
import { Card, CardHead, Badge, toneFor, Skeleton } from '@/components/ui/primitives';
import { usd, shortDate, UNKNOWN } from '@/lib/format';

/**
 * A member's own withdrawals, with the detail they need to answer their own
 * questions.
 *
 * The list used to show four columns — date, amount, net, status — and nothing
 * else. A member whose payout was refused saw a bare "rejected" badge: the
 * reason was written to the record, sent to them in a notification, and shown
 * to operators, but the one screen they would open to find it did not render
 * it. Nor did it carry the reference, the destination or the transaction hash,
 * so there was no way to check where money went or to quote anything to
 * support.
 */

export interface Row {
  id: string;
  amount: string;
  fee: string;
  tax?: string;
  netAmount: string;
  walletAddress: string;
  network?: string;
  reference: string;
  status: string;
  txHash: string | null;
  rejectReason: string | null;
  slaDueAt: string;
  processedAt?: string | null;
  createdAt: string;
}

/** BscScan is where a BEP-20 payment can actually be verified. */
const explorer = (txHash: string) => `https://bscscan.com/tx/${txHash}`;

/**
 * Status in the member's language.
 *
 * `PROCESSED` is what the database calls a paid withdrawal, and showing a
 * member the enum is showing them our schema. The tone still comes from
 * `toneFor`, so colour and wording stay consistent with every other screen.
 */
const LABEL: Record<string, string> = {
  PENDING: 'In review',
  APPROVED: 'Approved',
  PROCESSED: 'Paid',
  REJECTED: 'Rejected',
  FAILED: 'Could not be sent',
};

export function WithdrawalHistory({ rows, loading }: { rows: Row[]; loading?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <Card>
      <CardHead title={`History — ${rows.length}`} />

      {loading ? (
        <div className="space-y-2 px-5 pb-5" aria-busy="true" aria-label="Loading your withdrawals">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[52px] rounded-[5px]" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="px-5 pb-8 pt-2 text-center">
          <p className="text-[13px] font-medium text-ink">No withdrawals yet</p>
          <p className="mx-auto mt-1 max-w-[38ch] text-[12px] leading-relaxed text-ink-2">
            When you request one it appears here, with its reference and the address it was sent to.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-line-soft border-t border-line-soft">
          {rows.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setOpen(open === r.id ? null : r.id)}
                aria-expanded={open === r.id}
                className="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-canvas-2 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/25"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold tabular-nums text-ink">{usd(r.amount)}</p>
                  <p className="mt-0.5 text-[11.5px] text-ink-2">{shortDate(r.createdAt)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[12.5px] tabular-nums text-good">{usd(r.netAmount)}</p>
                  <p className="mt-0.5 text-[10.5px] text-ink-3">received</p>
                </div>
                <Badge tone={toneFor(r.status)}>{LABEL[r.status] ?? r.status}</Badge>
                <ChevronDown
                  size={15}
                  aria-hidden
                  className={clsx('shrink-0 text-ink-3 transition-transform', open === r.id && 'rotate-180')}
                />
              </button>

              {open === r.id && <Detail row={r} />}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Detail({ row }: { row: Row }) {
  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error('Could not copy — select it and copy manually');
    }
  };

  return (
    <div className="space-y-3 border-t border-line-soft bg-canvas-2 px-5 py-4">
      {/* The reason first: it is why the member opened this row. */}
      {row.rejectReason && (
        <div className="rounded-[4px] border border-bad/25 bg-bad-soft px-3 py-2.5">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-bad">
            {row.status === 'FAILED' ? 'Why it could not be sent' : 'Why it was rejected'}
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink">{row.rejectReason}</p>
          <p className="mt-1.5 text-[11.5px] text-ink-2">
            The full {usd(row.amount)} was returned to your Main wallet.
          </p>
        </div>
      )}

      <dl className="space-y-2 text-[12.5px]">
        <Field label="Sent to">
          <span className="break-all font-mono text-[12px] text-ink">{row.walletAddress}</span>
          <CopyButton onClick={() => copy('Address', row.walletAddress)} label="Copy payout address" />
        </Field>

        <Field label="Reference">
          <span className="font-mono text-[12px] text-ink">{row.reference}</span>
          <CopyButton onClick={() => copy('Reference', row.reference)} label="Copy reference" />
        </Field>

        {row.txHash && (
          <Field label="Transaction">
            <a
              href={explorer(row.txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 break-all font-mono text-[12px] text-violet hover:underline"
            >
              {row.txHash.slice(0, 18)}…{row.txHash.slice(-6)}
              <ExternalLink size={11} aria-hidden className="shrink-0" />
            </a>
            <CopyButton onClick={() => copy('Transaction hash', row.txHash!)} label="Copy transaction hash" />
          </Field>
        )}

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-2.5">
          <Amount label="Requested" value={usd(row.amount)} />
          <Amount label="Fee" value={`−${usd(row.fee)}`} tone="bad" />
          {row.tax && Number(row.tax) > 0 && <Amount label="Withholding" value={`−${usd(row.tax)}`} tone="bad" />}
          <Amount label="You received" value={usd(row.netAmount)} tone="good" />
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-2.5">
          <Amount label="Requested on" value={shortDate(row.createdAt)} />
          <Amount
            label={row.status === 'PENDING' ? 'Due by' : 'Completed'}
            value={row.status === 'PENDING'
              ? shortDate(row.slaDueAt)
              : row.processedAt ? shortDate(row.processedAt) : UNKNOWN}
          />
        </div>
      </dl>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3">{label}</dt>
      <dd className="mt-0.5 flex items-start gap-1.5">{children}</dd>
    </div>
  );
}

function CopyButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="mt-[1px] shrink-0 rounded p-0.5 text-ink-3 transition hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/25"
    >
      <Copy size={12} aria-hidden />
    </button>
  );
}

function Amount({ label, value, tone }: { label: string; value: string; tone?: 'bad' | 'good' }) {
  return (
    <div>
      <dt className="text-[11px] text-ink-3">{label}</dt>
      <dd className={clsx(
        'mt-0.5 tabular-nums',
        tone === 'bad' ? 'text-bad' : tone === 'good' ? 'font-medium text-good' : 'text-ink',
      )}>
        {value}
      </dd>
    </div>
  );
}
