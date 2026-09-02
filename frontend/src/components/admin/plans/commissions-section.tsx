'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { clsx } from 'clsx';
import { ChevronRight } from 'lucide-react';
import { adminGet, adminPut } from '@/lib/admin-api';
import { toastError } from '@/lib/toast';
import { Card, CardHead, Table, Button } from '@/components/ui/primitives';
import { useConfirmOk } from '@/components/ui/confirm';
import { usd, num, pct } from '@/lib/format';
import {
  SectionBody, SaveBar, NumField, Toggle, useDraft,
  sameValue, isValidPlanNumber, MONEY_MAX, type Draft,
} from '@/components/admin/plan-editor';
import type { Rule } from './types';

/** A rule as it will be written. */
interface Write {
  kind: 'DIRECT' | 'GENERATION';
  level: number;
  percent: string;
  requiredDirects: number;
  requiredTeamVolume: string;
  isActive: boolean;
}

/**
 * Contiguous levels that currently share every value.
 *
 * Derived from the data rather than hard-coded, which is what makes a per-level
 * override honest: change level 14 alone and the 11–20 band splits into 11–13,
 * 14, and 15–20 on the next load, because that is genuinely what the plan now
 * says. A hard-coded band list would keep claiming 11–20 were identical.
 */
interface Band {
  from: number; to: number;
  percent: string; requiredDirects: number; requiredTeamVolume: string;
  isActive: boolean; levels: Rule[];
}

function toBands(rules: Rule[]): Band[] {
  const sorted = [...rules].sort((a, b) => a.level - b.level);
  const bands: Band[] = [];
  for (const r of sorted) {
    const last = bands.length > 0 ? bands[bands.length - 1] : undefined;
    if (
      last && last.to === r.level - 1 &&
      sameValue(last.percent, r.percent) &&
      last.requiredDirects === r.requiredDirects &&
      sameValue(last.requiredTeamVolume, r.requiredTeamVolume) &&
      last.isActive === r.isActive
    ) {
      last.to = r.level;
      last.levels.push(r);
    } else {
      bands.push({
        from: r.level, to: r.level, percent: r.percent,
        requiredDirects: r.requiredDirects, requiredTeamVolume: r.requiredTeamVolume,
        isActive: r.isActive, levels: [r],
      });
    }
  }
  return bands;
}

const bandKey = (b: Band) => `b:${b.from}-${b.to}`;
const spanLabel = (b: Band) => (b.from === b.to ? `Level ${b.from}` : `Levels ${b.from} – ${b.to}`);

/**
 * Every level whose stored values the draft would change.
 *
 * A band edit fans out to each level it covers; a level edit overrides the band
 * for that one level. Levels that end up identical to what is stored are left
 * out, so a value typed and typed back does not generate a write.
 */
function buildWrites(bands: Band[], draft: Draft): Write[] {
  const out: Write[] = [];
  for (const band of bands) {
    const k = bandKey(band);
    for (const lv of band.levels) {
      const percent = draft[`l:${lv.level}:percent`] ?? draft[`${k}:percent`] ?? lv.percent;
      const directs = draft[`l:${lv.level}:directs`] ?? draft[`${k}:directs`] ?? String(lv.requiredDirects);
      const volume = draft[`l:${lv.level}:volume`] ?? draft[`${k}:volume`] ?? lv.requiredTeamVolume;
      const changed =
        !sameValue(percent, lv.percent) ||
        !sameValue(directs, String(lv.requiredDirects)) ||
        !sameValue(volume, lv.requiredTeamVolume);
      if (changed) {
        out.push({
          kind: lv.kind, level: lv.level,
          percent: percent.trim(), requiredDirects: Number(directs),
          requiredTeamVolume: volume.trim(), isActive: lv.isActive,
        });
      }
    }
  }
  return out;
}

const badWrites = (w: Write[]) => w.filter(
  (r) => !isValidPlanNumber(r.percent, 100) ||
         !Number.isInteger(r.requiredDirects) || r.requiredDirects < 0 ||
         !isValidPlanNumber(r.requiredTeamVolume, MONEY_MAX),
).length;

/* ── the section ──────────────────────────────────────────────────────── */

export function CommissionsSection() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'rules'], queryFn: () => adminGet<Rule[]>('/admin/commission-rules') });
  const rules = q.data ?? [];

  return (
    <div className="space-y-3.5">
      <DirectCard q={q} rules={rules.filter((r) => r.kind === 'DIRECT')} qc={qc} />
      <GenerationCard q={q} rules={rules.filter((r) => r.kind === 'GENERATION')} qc={qc} />
    </div>
  );
}

type Q = ReturnType<typeof useQuery<Rule[]>>;
type QC = ReturnType<typeof useQueryClient>;

/* ── direct sponsor ───────────────────────────────────────────────────── */

function DirectCard({ q, rules, qc }: { q: Q; rules: Rule[]; qc: QC }) {
  const { draft, set, reset } = useDraft();
  const askConfirm = useConfirmOk();
  const bands = useMemo(() => rules.map((r): Band => ({
    from: r.level, to: r.level, percent: r.percent,
    requiredDirects: r.requiredDirects, requiredTeamVolume: r.requiredTeamVolume,
    isActive: r.isActive, levels: [r],
  })), [rules]);

  const writes = useMemo(() => buildWrites(bands, draft), [bands, draft]);
  const save = useSaveRules(qc, reset, 'Direct sponsor bonus updated');
  const total = rules.filter((r) => r.isActive).reduce((s, r) => s + Number(r.percent || 0), 0);

  return (
    <Card>
      <CardHead
        title="Direct sponsor bonus"
        subtitle={
          q.isLoading || q.isError
            ? 'Paid to the sponsor when a member buys a plan.'
            : `Paid on the purchase itself, up to three levels up. Currently ${pct(total, 2)} of every purchase in total.`
        }
      />
      <SectionBody q={q} rows={3}>
        <Table
          head={['Level', 'Percent of purchase', 'Status']}
          empty="No direct sponsor levels configured. Sponsors earn nothing on a purchase until at least one exists."
          rows={bands.map((b) => {
            const r = b.levels[0];
            const key = `${bandKey(b)}:percent`;
            const value = draft[key] ?? r.percent;
            return [
              <span key="a" className="font-medium tabular-nums">Level {r.level}</span>,
              <NumField
                key="b"
                label={`Direct sponsor percent, level ${r.level}`}
                value={value}
                suffix="%"
                width="w-[92px]"
                dirty={!sameValue(value, r.percent)}
                invalid={!isValidPlanNumber(value, 100)}
                onChange={(v) => set(key, v)}
              />,
              <StatusCell
                key="c"
                on={r.isActive}
                label={`level ${r.level}`}
                onToggle={() => toggleLevels(askConfirm, save, [r], !r.isActive)}
                busy={save.isPending}
              />,
            ];
          })}
        />
      </SectionBody>
      <SaveBar
        dirtyCount={writes.length}
        invalidCount={badWrites(writes)}
        saving={save.isPending}
        noun="level"
        note="applies to purchases from the next payout run"
        onDiscard={reset}
        onSave={async () => {
          if (!(await askConfirm({
            title: `Change the direct sponsor bonus on ${writes.length} ${writes.length === 1 ? 'level' : 'levels'}?`,
            body: 'This is the percentage paid to a sponsor on every future qualifying purchase. Commissions already paid are not affected.',
            confirmLabel: 'Save commission rules',
            tone: 'primary',
          }))) return;
          save.mutate(writes);
        }}
      />
    </Card>
  );
}

/* ── generation bands ─────────────────────────────────────────────────── */

function GenerationCard({ q, rules, qc }: { q: Q; rules: Rule[]; qc: QC }) {
  const { draft, set, reset } = useDraft();
  const askConfirm = useConfirmOk();
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const bands = useMemo(() => toBands(rules), [rules]);
  const writes = useMemo(() => buildWrites(bands, draft), [bands, draft]);
  const save = useSaveRules(qc, reset, 'Generation bonus updated');

  const rows: React.ReactNode[][] = [];
  for (const b of bands) {
    const k = bandKey(b);
    const expandable = b.levels.length > 1;
    const expanded = !!open[k];
    const pv = draft[`${k}:percent`] ?? b.percent;
    const dv = draft[`${k}:directs`] ?? String(b.requiredDirects);
    const vv = draft[`${k}:volume`] ?? b.requiredTeamVolume;

    rows.push([
      <span key="a" className="inline-flex items-center gap-1.5">
        {expandable ? (
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${spanLabel(b)}`}
            onClick={() => setOpen((s) => ({ ...s, [k]: !s[k] }))}
            className="grid h-5 w-5 place-items-center rounded text-ink-3 transition hover:bg-canvas hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40"
          >
            <ChevronRight size={14} className={clsx('transition-transform', expanded && 'rotate-90')} />
          </button>
        ) : <span className="w-5" />}
        <span className="font-medium tabular-nums">{spanLabel(b)}</span>
        {expandable && (
          <span className="rounded-full bg-mute-soft px-1.5 py-px text-[10.5px] text-mute-on">{b.levels.length}</span>
        )}
      </span>,
      <NumField key="b" label={`Percent, ${spanLabel(b)}`} value={pv} suffix="%" width="w-[92px]"
                dirty={!sameValue(pv, b.percent)} invalid={!isValidPlanNumber(pv, 100)}
                onChange={(v) => set(`${k}:percent`, v)} />,
      <NumField key="c" label={`Directs required, ${spanLabel(b)}`} value={dv} width="w-[84px]"
                dirty={!sameValue(dv, String(b.requiredDirects))}
                invalid={!/^\d{1,5}$/.test(dv.trim())}
                onChange={(v) => set(`${k}:directs`, v)} />,
      <NumField key="d" label={`Team volume required, ${spanLabel(b)}`} value={vv} prefix="$" width="w-[128px]"
                dirty={!sameValue(vv, b.requiredTeamVolume)} invalid={!isValidPlanNumber(vv, MONEY_MAX)}
                onChange={(v) => set(`${k}:volume`, v)} />,
      <StatusCell key="e" on={b.isActive} label={spanLabel(b).toLowerCase()} busy={save.isPending}
                  onToggle={() => toggleLevels(askConfirm, save, b.levels, !b.isActive)} />,
    ]);

    if (expanded) {
      for (const lv of b.levels) {
        const lp = draft[`l:${lv.level}:percent`] ?? draft[`${k}:percent`] ?? lv.percent;
        const ld = draft[`l:${lv.level}:directs`] ?? draft[`${k}:directs`] ?? String(lv.requiredDirects);
        const lvv = draft[`l:${lv.level}:volume`] ?? draft[`${k}:volume`] ?? lv.requiredTeamVolume;
        rows.push([
          <span key="a" className="flex items-center gap-2 pl-7 text-ink-2">
            <span className="h-3 w-px bg-line-strong" aria-hidden />
            <span className="tabular-nums">Level {lv.level}</span>
          </span>,
          <NumField key="b" label={`Percent, level ${lv.level}`} value={lp} suffix="%" width="w-[92px]"
                    dirty={!sameValue(lp, lv.percent)} invalid={!isValidPlanNumber(lp, 100)}
                    onChange={(v) => set(`l:${lv.level}:percent`, v)} />,
          <NumField key="c" label={`Directs required, level ${lv.level}`} value={ld} width="w-[84px]"
                    dirty={!sameValue(ld, String(lv.requiredDirects))}
                    invalid={!/^\d{1,5}$/.test(ld.trim())}
                    onChange={(v) => set(`l:${lv.level}:directs`, v)} />,
          <NumField key="d" label={`Team volume required, level ${lv.level}`} value={lvv} prefix="$" width="w-[128px]"
                    dirty={!sameValue(lvv, lv.requiredTeamVolume)} invalid={!isValidPlanNumber(lvv, MONEY_MAX)}
                    onChange={(v) => set(`l:${lv.level}:volume`, v)} />,
          <StatusCell key="e" on={lv.isActive} label={`level ${lv.level}`} busy={save.isPending}
                      onToggle={() => toggleLevels(askConfirm, save, [lv], !lv.isActive)} />,
        ]);
      }
    }
  }

  const deepest = rules.reduce((m, r) => Math.max(m, r.level), 0);

  return (
    <Card>
      <CardHead
        title="Generation bonus"
        subtitle={
          q.isLoading || q.isError
            ? 'Paid on the daily trade bonus earned by your network.'
            : `${num(deepest)} levels deep, grouped into ${num(bands.length)} ${bands.length === 1 ? 'band' : 'bands'} that currently share the same terms. Editing a band writes every level in it as one change; expand a band to set a level on its own.`
        }
      />
      <SectionBody q={q} rows={6}>
        <Table
          head={['Levels', 'Percent of daily bonus', 'Directs required', 'Team volume required', 'Status']}
          empty="No generation levels configured. Nothing is paid on downline earnings until at least one exists."
          rows={rows}
        />
      </SectionBody>
      <SaveBar
        dirtyCount={writes.length}
        invalidCount={badWrites(writes)}
        saving={save.isPending}
        noun="level"
        note="written as one transaction"
        onDiscard={reset}
        onSave={async () => {
          const span = writes.map((w) => w.level).sort((a, b) => a - b);
          if (!(await askConfirm({
            title: `Change the generation bonus on ${writes.length} ${writes.length === 1 ? 'level' : 'levels'}?`,
            body: `Level${span.length === 1 ? '' : 's'} ${span.join(', ')} will be written together — all of them or none. This is the percentage paid on downline daily bonuses from the next payout run; commissions already paid are not affected.`,
            confirmLabel: 'Save commission rules',
            tone: 'primary',
          }))) return;
          save.mutate(writes);
        }}
      />
    </Card>
  );
}

/* ── shared bits ──────────────────────────────────────────────────────── */

function StatusCell({ on, label, onToggle, busy }: {
  on: boolean; label: string; onToggle: () => void; busy?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <Toggle on={on} busy={busy} label={`${on ? 'Pause' : 'Resume'} ${label}`} onChange={onToggle} />
      <span className={clsx('text-[12px]', on ? 'text-ink-2' : 'text-ink-3')}>{on ? 'Paying' : 'Paused'}</span>
    </span>
  );
}

/**
 * Writes go through the batch endpoint even when there is one of them, so a
 * band and a single level take the identical path — one transaction, so a span
 * of levels can never half-apply and leave the plan paying two different rates.
 */
function useSaveRules(qc: QC, reset: () => void, message: string) {
  return useMutation({
    mutationFn: (rules: Write[]) => adminPut('/admin/commission-rules/batch', { rules }),
    onSuccess: (_d, rules) => {
      toast.success(`${message} — ${rules.length} ${rules.length === 1 ? 'level' : 'levels'}`);
      reset();
      qc.invalidateQueries({ queryKey: ['admin', 'rules'] });
    },
    onError: (e) => toastError(e),
  });
}

async function toggleLevels(
  askConfirm: ReturnType<typeof useConfirmOk>,
  save: { mutate: (w: Write[]) => void },
  levels: Rule[],
  next: boolean,
) {
  const what = levels.length === 1
    ? `level ${levels[0].level}`
    : `levels ${levels[0].level} – ${levels[levels.length - 1].level}`;
  if (!next && !(await askConfirm({
    title: `Stop paying ${what}?`,
    body: `Nothing will be credited on ${what} from the next payout run until it is resumed. Commissions already paid are not affected.`,
    confirmLabel: 'Stop paying',
    tone: 'danger',
  }))) return;
  save.mutate(levels.map((l) => ({
    kind: l.kind, level: l.level, percent: l.percent,
    requiredDirects: l.requiredDirects, requiredTeamVolume: l.requiredTeamVolume,
    isActive: next,
  })));
}
