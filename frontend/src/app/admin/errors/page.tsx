'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Check, ChevronDown, RotateCcw } from 'lucide-react';
import { clsx } from 'clsx';
import { adminGet, adminPost } from '@/lib/admin-api';
import { toastError } from '@/lib/toast';
import { ago, num, titleCase } from '@/lib/format';
import {
  Badge, Button, Card, CardHead, PageHeader, Skeleton, type Tone,
} from '@/components/ui/primitives';

/**
 * Faults the platform has thrown.
 *
 * One row per fault, not per occurrence — a broken endpoint hit a thousand
 * times is one problem, and a list with a thousand copies of it is a list
 * nobody opens. Handled failures (a validation error, a rejected duplicate, an
 * insufficient balance) are deliberately absent: those are members making
 * ordinary mistakes, and filing them would bury the row that means something.
 *
 * A fault marked resolved reopens by itself if it happens again. That is the
 * single most useful thing this can tell an operator — the fix did not hold.
 */

type Source = 'REQUEST' | 'JOB' | 'UNCAUGHT' | 'UNHANDLED_REJECTION';

interface Fault {
  id: string;
  fingerprint: string;
  source: Source;
  name: string;
  message: string;
  stack: string | null;
  route: string | null;
  method: string | null;
  statusCode: number | null;
  requestId: string | null;
  actorType: string | null;
  actorId: string | null;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

const SOURCE_TONE: Record<Source, Tone> = {
  REQUEST: 'warn',
  JOB: 'bad',
  // Nothing that reaches these two was expected by anybody.
  UNCAUGHT: 'bad',
  UNHANDLED_REJECTION: 'bad',
};

const SOURCE_LABEL: Record<Source, string> = {
  REQUEST: 'Request',
  JOB: 'Background job',
  UNCAUGHT: 'Crash',
  UNHANDLED_REJECTION: 'Unhandled promise',
};

export default function ErrorsPage() {
  const qc = useQueryClient();
  const [showResolved, setShowResolved] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const faults = useQuery<{ unresolved: number; rows: Fault[] }>({
    queryKey: ['admin', 'errors', showResolved],
    queryFn: () => adminGet(`/admin/errors?resolved=${showResolved}&take=100`),
    // Short, because this is the screen somebody watches during an incident.
    refetchInterval: 15_000,
  });

  const resolve = useMutation({
    mutationFn: (id: string) => adminPost(`/admin/errors/${id}/resolve`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'errors'] });
      toast.success('Marked resolved', {
        description: 'It will reopen by itself if it happens again.',
      });
    },
    onError: (e) => toastError(e),
  });

  const rows = faults.data?.rows ?? [];

  return (
    <>
      <PageHeader
        title="Faults"
        subtitle="Errors the platform has thrown, grouped so one problem is one row. Handled refusals are not recorded — only failures nobody expected."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          variant={showResolved ? 'ghost' : 'secondary'}
          size="sm"
          onClick={() => setShowResolved(false)}
        >
          Open{faults.data ? ` — ${num(faults.data.unresolved)}` : ''}
        </Button>
        <Button
          variant={showResolved ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setShowResolved(true)}
        >
          Resolved
        </Button>
      </div>

      {faults.isLoading ? (
        <Card><div className="p-5"><Skeleton className="h-40" /></div></Card>
      ) : !rows.length ? (
        <Card>
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-good-soft text-good">
              <Check size={22} />
            </span>
            <p className="text-[15px] font-medium text-ink">
              {showResolved ? 'Nothing has been resolved yet' : 'Nothing is failing'}
            </p>
            <p className="max-w-md text-[13px] leading-relaxed text-ink-2">
              {showResolved
                ? 'Faults you mark resolved appear here, and move back to Open if they recur.'
                : 'Every unhandled failure is recorded here with the request that caused it. An empty list means the platform has not thrown since the last one was cleared.'}
            </p>
          </div>
        </Card>
      ) : (
        <Card>
          <CardHead title={`${showResolved ? 'Resolved' : 'Open'} — ${rows.length}`} />
          <ul className="divide-y divide-line">
            {rows.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => setOpen(open === f.id ? null : f.id)}
                  aria-expanded={open === f.id}
                  className="flex w-full items-start gap-3 px-5 py-3.5 text-left transition hover:bg-canvas"
                >
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-bad-soft text-bad">
                    <AlertTriangle size={15} />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[13.5px] font-semibold text-ink">{f.name}</span>
                      <Badge tone={SOURCE_TONE[f.source]}>{SOURCE_LABEL[f.source]}</Badge>
                      {f.count > 1 && <Badge tone="neutral">{num(f.count)}x</Badge>}
                      {f.resolvedAt && <Badge tone="good">Resolved</Badge>}
                    </span>
                    <span className="mt-0.5 block truncate text-[12.5px] text-ink-2">
                      {f.message}
                    </span>
                    <span className="mt-0.5 block text-[11.5px] text-ink-3">
                      {[f.method, f.route].filter(Boolean).join(' ') || 'no route'}
                      {' · last seen '}{ago(f.lastSeenAt)}
                      {f.count > 1 && <> · first {ago(f.firstSeenAt)}</>}
                    </span>
                  </span>

                  <ChevronDown
                    size={16}
                    className={clsx('mt-1 shrink-0 text-ink-3 transition', open === f.id && 'rotate-180')}
                  />
                </button>

                {open === f.id && (
                  <div className="border-t border-line bg-canvas/50 px-5 py-4">
                    <dl className="grid gap-x-6 gap-y-2 text-[12.5px] sm:grid-cols-2">
                      {[
                        ['Occurrences', num(f.count)],
                        ['Status code', f.statusCode ? String(f.statusCode) : '—'],
                        ['First seen', new Date(f.firstSeenAt).toLocaleString()],
                        ['Last seen', new Date(f.lastSeenAt).toLocaleString()],
                        ['Request id', f.requestId ?? '—'],
                        ['Actor', f.actorId ? `${titleCase(f.actorType ?? '')} ${f.actorId}` : '—'],
                      ].map(([label, value]) => (
                        <div key={label} className="flex justify-between gap-3 border-b border-line py-1.5">
                          <dt className="text-ink-2">{label}</dt>
                          <dd className="truncate text-right font-medium text-ink">{value}</dd>
                        </div>
                      ))}
                    </dl>

                    {f.stack && (
                      <>
                        <h3 className="mb-1.5 mt-4 text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-3">
                          Where it came from
                        </h3>
                        {/* Scrollable and focusable, so it is reachable without a mouse. */}
                        <pre
                          tabIndex={0}
                          role="region"
                          aria-label="Stack trace"
                          className="max-h-72 overflow-auto rounded-[10px] border border-line bg-card p-3 font-mono text-[11px] leading-relaxed text-ink-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet"
                        >
                          {f.stack}
                        </pre>
                      </>
                    )}

                    {!f.resolvedAt && (
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => resolve.mutate(f.id)}
                          loading={resolve.isPending && resolve.variables === f.id}
                        >
                          <Check size={14} /> Mark resolved
                        </Button>
                        <p className="text-[11.5px] text-ink-3">
                          It moves back here automatically if it happens again.
                        </p>
                      </div>
                    )}

                    {f.resolvedAt && (
                      <p className="mt-4 flex items-center gap-1.5 text-[12px] text-ink-2">
                        <RotateCcw size={13} className="text-ink-3" />
                        Resolved {ago(f.resolvedAt)}. It will reopen by itself if it recurs.
                      </p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
