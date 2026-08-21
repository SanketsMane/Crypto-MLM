'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle, FlaskConical, Loader2, Play, Trash2, TrendingDown, TrendingUp,
} from 'lucide-react';
import { clsx } from 'clsx';
import { adminGet, adminPost, adminDelete } from '@/lib/admin-api';
import { useMoneyMutation } from '@/lib/money-mutation';
import {
  Card, CardHead, PageHeader, Badge, Button, Skeleton, Table, controlCls, type Tone,
} from '@/components/ui/primitives';
import { ActionDialog } from '@/components/ui/dialog';
import { toastError } from '@/lib/toast';
import { usd, num } from '@/lib/format';

type JoinPattern = 'STEADY' | 'GROWTH' | 'VIRAL' | 'DECLINE';
type Status = 'DRAFT' | 'RUNNING' | 'COMPLETE' | 'FAILED' | 'ERASED';

interface Params {
  months: number; initialMembers: number; joinsPerMonth: number; joinPattern: JoinPattern;
  intakeVariance: number;
  minInvestment: number; maxInvestment: number;
  reinvestRate: number; withdrawRate: number; activeAffiliateRate: number;
  avgDirectsPerRecruiter: number; recruiterRate: number; startDate: string;
}

interface MonthRow {
  month: number; label: string; joined: number; totalMembers: number;
  capitalIn: string; roiPaid: string; directBonusPaid: string; generationBonusPaid: string;
  rankRewardsPaid: string; otherPaid: string; totalPaidOut: string;
  withdrawn: string; feesCollected: string; taxWithheld: string;
  netPosition: string; cumulativeNet: string;
  cappedMembers: number; outstandingLiability: string;
}

interface Summary {
  members: number; capitalIn: string; totalPaidOut: string;
  byStream: { stream: string; amount: string }[];
  feesCollected: string; taxWithheld: string; withdrawn: string;
  memberBalances: string; outstandingLiability: string;
  netPosition: string; netPositionWithLiability: string;
  payoutRatio: number; cappedMembers: number;
  breakEvenMonth: number | null; runtimeSeconds: number;
}

interface Run {
  id: string; name: string; status: Status; seed: string; params: Params;
  progress: number; progressLabel: string | null;
  summary: Summary | null; monthly: MonthRow[] | null;
  memberCount: number; error: string | null;
  liveMembers?: number;
  startedAt: string | null; completedAt: string | null; erasedAt: string | null;
  createdAt: string;
}

const STATUS_TONE: Record<Status, Tone> = {
  DRAFT: 'neutral', RUNNING: 'info', COMPLETE: 'good', FAILED: 'bad', ERASED: 'neutral',
};

const PATTERNS: { value: JoinPattern; label: string; hint: string }[] = [
  { value: 'STEADY',  label: 'Steady',  hint: 'The same intake every month' },
  { value: 'GROWTH',  label: 'Growth',  hint: 'Compounding 25% a month — the shape an MLM is sold on' },
  { value: 'VIRAL',   label: 'Viral',   hint: 'Fast early, flattening as the market thins' },
  { value: 'DECLINE', label: 'Decline', hint: 'Intake falling away, as it does once early members cap out' },
];

export default function DryRunPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [erasing, setErasing] = useState<Run | null>(null);

  const defaults = useQuery<Params>({
    queryKey: ['admin', 'sim', 'defaults'],
    queryFn: () => adminGet('/admin/simulations/defaults'),
  });

  const runs = useQuery<Run[]>({
    queryKey: ['admin', 'sim', 'list'],
    queryFn: () => adminGet('/admin/simulations'),
    // Refresh while anything is mid-run.
    refetchInterval: (q) =>
      (q.state.data ?? []).some((r) => r.status === 'RUNNING') ? 4000 : false,
  });

  const footprint = useQuery<{ members: number; runs: number; clean: boolean }>({
    queryKey: ['admin', 'sim', 'footprint'],
    queryFn: () => adminGet('/admin/simulations/footprint'),
    refetchInterval: 10_000,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'sim'] });

  const erase = useMutation({
    mutationFn: (id: string) => adminDelete<{ erased: number }>(`/admin/simulations/${id}`),
    onSuccess: (d) => {
      refresh();
      setErasing(null);
      toast.success(`Erased ${num(d.erased)} modelled members and everything they created`);
    },
    onError: (e) => toastError(e),
  });

  const active = runs.data?.find((r) => r.status === 'RUNNING');

  return (
    <>
      <PageHeader
        title="Dry run"
        subtitle="Models a member base against the live compensation plan and reports what it costs. It drives the real engine — the same ROI job, commission walk and earnings ceiling — so the figures are the platform's, not a spreadsheet's."
      />

      {/* Modelled data sitting in the database is the thing to never lose track
          of, so it is stated at the top rather than buried in a list. */}
      {footprint.data && !footprint.data.clean && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[12px] border border-warn/30 bg-warn-soft px-4 py-3">
          <FlaskConical size={17} className="shrink-0 text-warn" />
          <p className="min-w-0 flex-1 text-[13px] leading-snug text-ink">
            <strong className="font-semibold">{num(footprint.data.members)} modelled members</strong>{' '}
            are in the database. They are excluded from nothing automatically — erase the run when
            you are done reading it.
          </p>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[400px_1fr]">
        <NewRunCard defaults={defaults.data} disabled={Boolean(active)} onStarted={refresh} />

        <div className="space-y-4">
          {runs.isLoading ? (
            <Card><div className="p-5"><Skeleton className="h-40" /></div></Card>
          ) : !runs.data?.length ? (
            <Card>
              <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-canvas text-ink-3">
                  <FlaskConical size={22} />
                </span>
                <p className="text-[15px] font-medium text-ink">No runs yet</p>
                <p className="max-w-md text-[13px] leading-relaxed text-ink-2">
                  Set the parameters on the left and start one. A ten-month run with a few hundred
                  members takes a handful of minutes, because it plays every trading day through the
                  real payout engine rather than approximating it.
                </p>
              </div>
            </Card>
          ) : (
            <Card>
              <CardHead title={`Runs — ${runs.data.length}`} />
              <ul className="divide-y divide-line">
                {runs.data.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(selected === r.id ? null : r.id)}
                      className="flex w-full flex-wrap items-center gap-3 px-5 py-3.5 text-left transition hover:bg-canvas"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[13.5px] font-semibold text-ink">{r.name}</span>
                          <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
                          {r.status === 'RUNNING' && (
                            <Loader2 size={13} className="animate-spin text-ink-3" />
                          )}
                        </div>
                        <p className="mt-0.5 text-[11.5px] text-ink-3">
                          {r.params.months} months · {r.params.joinPattern.toLowerCase()} intake ·
                          seed <code className="font-mono">{r.seed}</code>
                          {r.status !== 'ERASED' && r.memberCount > 0 && ` · ${num(r.memberCount)} members`}
                        </p>
                        {r.status === 'RUNNING' && (
                          <div className="mt-2 max-w-sm">
                            <div className="h-1.5 overflow-hidden rounded-full bg-line">
                              <div className="h-full rounded-full bg-violet transition-[width] duration-500"
                                   style={{ width: `${r.progress}%` }} />
                            </div>
                            <p className="mt-1 text-[11px] text-ink-3">{r.progressLabel}</p>
                          </div>
                        )}
                        {r.status === 'FAILED' && r.error && (
                          <p className="mt-1 max-w-lg text-[12px] leading-relaxed text-bad">{r.error}</p>
                        )}
                      </div>

                      {r.summary && (
                        <div className="shrink-0 text-right">
                          <p className={clsx(
                            'text-[15px] font-semibold tabular-nums',
                            Number(r.summary.netPositionWithLiability) < 0 ? 'text-bad' : 'text-good',
                          )}>
                            {usd(Number(r.summary.netPositionWithLiability))}
                          </p>
                          <p className="text-[10.5px] text-ink-3">net, incl. liability</p>
                        </div>
                      )}

                      {r.status !== 'ERASED' && r.status !== 'RUNNING' && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => { e.stopPropagation(); setErasing(r); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setErasing(r); } }}
                          title="Erase this run's data"
                          className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-[9px] border border-line text-ink-3 transition hover:border-bad/40 hover:text-bad"
                        >
                          <Trash2 size={14} />
                        </span>
                      )}
                    </button>

                    {selected === r.id && r.summary && r.monthly && (
                      <Results run={r} />
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <ActionDialog
        open={erasing !== null}
        onClose={() => setErasing(null)}
        pending={erase.isPending}
        title={erasing ? `Erase "${erasing.name}"?` : ''}
        body={
          erasing
            ? `Deletes ${num(erasing.memberCount)} modelled members and everything they created — investments, ledger entries, commissions, accruals. Real members are untouched, and the results below are kept for reference.`
            : undefined
        }
        confirmLabel="Erase the data"
        onConfirm={() => erasing && erase.mutate(erasing.id)}
      />
    </>
  );
}

// ── parameters ──────────────────────────────────────────────────────────────

function NewRunCard({
  defaults, disabled, onStarted,
}: {
  defaults: Params | undefined;
  disabled: boolean;
  onStarted: () => void;
}) {
  const [form, setForm] = useState<Params | null>(null);
  const [name, setName] = useState('');
  const [seed, setSeed] = useState('');

  useEffect(() => { if (defaults && !form) setForm(defaults); }, [defaults, form]);

  const start = useMoneyMutation({
    mutationFn: (_: void, key) => adminPost('/admin/simulations', { name, seed, params: form }, key),
    onSuccess: () => {
      onStarted();
      setName('');
      toast.success('Run started', { description: 'Progress appears on the right as it works.' });
    },
    onError: (e) => toastError(e),
  });

  if (!form) {
    return <Card><div className="p-5"><Skeleton className="h-96" /></div></Card>;
  }

  const set = <K extends keyof Params>(k: K, v: Params[K]) => setForm({ ...form, [k]: v });

  /**
   * The projection has to apply the same curve the engine will.
   *
   * A flat months × joins figure is badly wrong under GROWTH — 45 a month
   * compounding at 25% reaches roughly 1,900 over ten months, not 450 — and a
   * number that understates the run by four times is worse than none.
   */
  const MULTIPLIER: Record<JoinPattern, (m: number) => number> = {
    STEADY: () => 1,
    GROWTH: (m) => Math.pow(1.25, m),
    VIRAL: (m) => 1 + 3 * (1 - Math.exp(-m / 2.5)),
    DECLINE: (m) => Math.pow(0.8, m),
  };

  const projected = form.initialMembers + Array.from(
    { length: form.months },
    (_, m) => Math.round(form.joinsPerMonth * MULTIPLIER[form.joinPattern](m)),
  ).reduce((a, b) => a + b, 0);

  // Roughly a second per member-month of accrual, measured.
  const estimatedMinutes = Math.max(1, Math.round((projected * form.months) / 900));

  return (
    <Card>
      <CardHead title="New run" subtitle="Everything here is a guess about behaviour. The plan itself comes from Settings." />
      <form
        className="space-y-4 px-5 pb-5"
        onSubmit={(e) => { e.preventDefault(); start.mutate(); }}
      >
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)}
                 placeholder="Ten months, growth intake"
                 className={`${controlCls} h-9 w-full text-[13px]`} />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Months">
            <NumberInput value={form.months} min={1} max={36} onChange={(v) => set('months', v)} />
          </Field>
          <Field label="Starting from">
            <input type="date" value={form.startDate}
                   onChange={(e) => set('startDate', e.target.value)}
                   className={`${controlCls} h-9 w-full text-[13px]`} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Members at the start" hint="Already on the platform">
            <NumberInput value={form.initialMembers} min={0} max={2000} onChange={(v) => set('initialMembers', v)} />
          </Field>
          <Field label="Joins in month one">
            <NumberInput value={form.joinsPerMonth} min={0} max={2000} onChange={(v) => set('joinsPerMonth', v)} />
          </Field>
        </div>

        <Field label="How intake changes">
          <div className="grid grid-cols-2 gap-1.5">
            {PATTERNS.map((p) => (
              <button key={p.value} type="button" title={p.hint}
                      onClick={() => set('joinPattern', p.value)}
                      className={clsx(
                        'rounded-[9px] border px-2 py-2 text-[12px] font-medium transition',
                        form.joinPattern === p.value
                          ? 'border-violet bg-violet text-white'
                          : 'border-line bg-card text-ink-2 hover:border-violet/40 hover:text-ink',
                      )}>
                {p.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-3">
            {PATTERNS.find((p) => p.value === form.joinPattern)?.hint}
          </p>
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Smallest package" hint="Tiers are picked in this range">
            <NumberInput value={form.minInvestment} min={1} onChange={(v) => set('minInvestment', v)} prefix="$" />
          </Field>
          <Field label="Largest package">
            <NumberInput value={form.maxInvestment} min={1} onChange={(v) => set('maxInvestment', v)} prefix="$" />
          </Field>
        </div>

        <Percent label="Month-to-month swing" value={form.intakeVariance}
                 hint="How far a month's intake lands either side of plan — real intake is never the same number twice"
                 onChange={(v) => set('intakeVariance', v)} />
        <Percent label="Reinvest each year" value={form.reinvestRate}
                 hint="Share who buy another package"
                 onChange={(v) => set('reinvestRate', v)} />
        <Percent label="Withdraw each year" value={form.withdrawRate}
                 hint="Share who take money out rather than leaving it"
                 onChange={(v) => set('withdrawRate', v)} />
        <Percent label="On the higher ceiling" value={form.activeAffiliateRate}
                 hint="Active affiliates earn to 300% rather than 250%"
                 onChange={(v) => set('activeAffiliateRate', v)} />
        <Percent label="Who recruit at all" value={form.recruiterRate}
                 hint="Most members never introduce anyone"
                 onChange={(v) => set('recruiterRate', v)} />

        <Field label="Directs per recruiter" hint="Average, for those who do recruit">
          <NumberInput value={form.avgDirectsPerRecruiter} min={1} max={40}
                       onChange={(v) => set('avgDirectsPerRecruiter', v)} />
        </Field>

        <Field label="Seed" hint="Same seed and parameters gives the same result">
          <input value={seed} onChange={(e) => setSeed(e.target.value)}
                 placeholder="left blank for a random one"
                 className={`${controlCls} h-9 w-full font-mono text-[12.5px]`} />
        </Field>

        <div className="rounded-[10px] border border-line bg-canvas px-3 py-2.5">
          <p className="text-[12px] leading-relaxed text-ink-2">
            Between{' '}
            <strong className="text-ink">
              {num(Math.round(form.initialMembers + (projected - form.initialMembers) * (1 - form.intakeVariance)))}
            </strong>{' '}and{' '}
            <strong className="text-ink">
              {num(Math.round(form.initialMembers + (projected - form.initialMembers) * (1 + form.intakeVariance)))}
            </strong>{' '}members over{' '}
            {form.months} months, taking somewhere near{' '}
            <strong className="text-ink">{estimatedMinutes} minute{estimatedMinutes === 1 ? '' : 's'}</strong>.
            This writes them to the live database and plays every trading day through the real
            engine, which is what makes the figures trustworthy and also why it is not instant.
          </p>
        </div>

        <Button type="submit" className="w-full" loading={start.isPending} disabled={disabled}>
          <Play size={14} /> {disabled ? 'A run is already going' : 'Start the run'}
        </Button>
      </form>
    </Card>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-ink-3">{hint}</span>}
    </label>
  );
}

function NumberInput({
  value, min, max, onChange, prefix,
}: {
  value: number; min?: number; max?: number; onChange: (v: number) => void; prefix?: string;
}) {
  return (
    <span className="relative flex items-center">
      {prefix && <span className="pointer-events-none absolute left-3 text-[12.5px] text-ink-3">{prefix}</span>}
      <input
        type="number" value={value} min={min} max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className={clsx(controlCls, 'h-9 w-full text-[13px] tabular-nums', prefix && 'pl-6')}
      />
    </span>
  );
}

/** A rate stored 0–1 but shown as a percentage, because nobody thinks in 0.35. */
function Percent({
  label, hint, value, onChange,
}: {
  label: string; hint: string; value: number; onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-medium text-ink-2">{label}</span>
        <span className="text-[12px] font-semibold tabular-nums text-ink">
          {Math.round(value * 100)}%
        </span>
      </div>
      <input
        type="range" min={0} max={100} value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-line accent-violet"
      />
      <p className="mt-0.5 text-[11px] text-ink-3">{hint}</p>
    </div>
  );
}

// ── results ─────────────────────────────────────────────────────────────────

function Results({ run }: { run: Run }) {
  const s = run.summary!;
  const monthly = run.monthly!;
  const underwater = Number(s.netPositionWithLiability) < 0;

  return (
    <div className="border-t border-line bg-canvas/50 px-5 py-4">
      {/* The headline is the position including what is still owed. The
          in-month figure looks healthy long before the liability lands. */}
      <div className="grid gap-px overflow-hidden rounded-[10px] border border-line bg-line sm:grid-cols-4">
        <Cell label="Capital in" value={usd(Number(s.capitalIn))} />
        <Cell label="Paid out" value={usd(Number(s.totalPaidOut))} tone="warn" />
        <Cell label="Still owed on caps" value={usd(Number(s.outstandingLiability))} tone="warn"
              hint="If every active package runs to its ceiling" />
        <Cell
          label="Net, incl. liability"
          value={usd(Number(s.netPositionWithLiability))}
          tone={underwater ? 'bad' : 'good'}
          hint={`${s.payoutRatio}× paid out per unit in`}
        />
      </div>

      {underwater && (
        <div className="mt-3 flex items-start gap-2.5 rounded-[10px] border border-bad/30 bg-bad-soft px-4 py-3">
          <TrendingDown size={16} className="mt-0.5 shrink-0 text-bad" />
          <p className="min-w-0 text-[12.5px] leading-relaxed text-ink">
            Counting what is still owed to active packages, this run ends{' '}
            <strong className="font-semibold">{usd(Math.abs(Number(s.netPositionWithLiability)))} short</strong>.
            {s.breakEvenMonth
              ? ` Month ${s.breakEvenMonth} is where the running total first goes negative.`
              : ' The month-by-month figures stay positive because the ceiling has not been reached yet — the shortfall arrives later.'}
          </p>
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_260px]">
        <div className="min-w-0">
          <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-3">
            Month by month
          </h3>
          <div className="overflow-x-auto">
            <Table
              head={['Month', 'Joined', 'Members', 'In', 'Returns', 'Commissions', 'Out', 'Net', 'Running', 'Owed']}
              rows={monthly.map((m) => [
                <span key="l" className="whitespace-nowrap font-medium">{m.label}</span>,
                <span key="j" className="tabular-nums text-ink-2">+{m.joined}</span>,
                <span key="t" className="tabular-nums">{num(m.totalMembers)}</span>,
                <span key="i" className="tabular-nums text-good">{usd(Number(m.capitalIn))}</span>,
                <span key="r" className="tabular-nums text-ink-2">{usd(Number(m.roiPaid))}</span>,
                <span key="c" className="tabular-nums text-ink-2">
                  {usd(Number(m.directBonusPaid) + Number(m.generationBonusPaid) + Number(m.rankRewardsPaid))}
                </span>,
                <span key="o" className="tabular-nums text-warn">{usd(Number(m.totalPaidOut))}</span>,
                <span key="n" className={clsx('tabular-nums', Number(m.netPosition) < 0 ? 'text-bad' : 'text-ink')}>
                  {usd(Number(m.netPosition))}
                </span>,
                <span key="cu" className={clsx('tabular-nums font-medium', Number(m.cumulativeNet) < 0 ? 'text-bad' : 'text-ink')}>
                  {usd(Number(m.cumulativeNet))}
                </span>,
                <span key="li" className="tabular-nums text-ink-3">{usd(Number(m.outstandingLiability))}</span>,
              ])}
            />
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-3">
              Where it went
            </h3>
            <ul className="space-y-1.5">
              {s.byStream.map((x) => {
                const share = Number(s.totalPaidOut) > 0
                  ? (Number(x.amount) / Number(s.totalPaidOut)) * 100 : 0;
                return (
                  <li key={x.stream}>
                    <div className="flex items-baseline justify-between gap-2 text-[12px]">
                      <span className="truncate text-ink-2">{x.stream}</span>
                      <span className="shrink-0 tabular-nums text-ink">{usd(Number(x.amount))}</span>
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-line">
                      <div className="h-full rounded-full bg-violet" style={{ width: `${share}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-3">
              At the end
            </h3>
            <dl className="space-y-1.5 text-[12px]">
              {[
                ['Members', num(s.members)],
                ['Packages matured', num(s.cappedMembers)],
                ['Member balances', usd(Number(s.memberBalances))],
                ['Withdrawn', usd(Number(s.withdrawn))],
                ['Fees kept', usd(Number(s.feesCollected))],
                ['Tax withheld', usd(Number(s.taxWithheld))],
                ['Ran in', `${s.runtimeSeconds}s`],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2">
                  <dt className="text-ink-2">{k}</dt>
                  <dd className="tabular-nums text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}

function Cell({
  label, value, hint, tone,
}: {
  label: string; value: string; hint?: string; tone?: 'good' | 'warn' | 'bad';
}) {
  return (
    <div className="bg-card px-4 py-3">
      <p className="text-[10.5px] uppercase tracking-[0.04em] text-ink-3">{label}</p>
      <p className={clsx(
        'mt-1 text-[17px] font-semibold tabular-nums',
        tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : tone === 'good' ? 'text-good' : 'text-ink',
      )}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[10.5px] leading-snug text-ink-3">{hint}</p>}
    </div>
  );
}
