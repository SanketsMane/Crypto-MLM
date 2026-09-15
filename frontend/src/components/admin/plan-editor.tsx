'use client';

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button, Skeleton } from '@/components/ui/primitives';
import { adminError } from '@/lib/admin-api';

/* ── draft state ──────────────────────────────────────────────────────── */

export type Draft = Record<string, string>;

/**
 * Edits held until they are saved.
 *
 * The screen this replaces kept each figure in an uncontrolled input and gave
 * every row its own Save button, so editing five rows and saving one silently
 * discarded the other four the moment the table refetched. Every pending edit
 * now lives in one place, the count is on screen, and Save writes all of them.
 */
export function useDraft() {
  const [draft, setDraft] = useState<Draft>({});
  const set = useCallback((k: string, v: string) => setDraft((d) => ({ ...d, [k]: v })), []);
  const reset = useCallback(() => setDraft({}), []);
  return { draft, set, reset };
}

/**
 * `"0.50"` and `"0.5"` are the same rate.
 *
 * Compared as text, every reformat looks like a pending change and Save lights
 * up for an edit that would write nothing. Numeric comparison applies only when
 * both sides actually parse — otherwise a half-typed field would read as equal
 * to the stored value and quietly drop out of the batch.
 */
export const sameValue = (a: string, b: string): boolean => {
  const x = Number(a);
  const y = Number(b);
  return a.trim() !== '' && b.trim() !== '' && Number.isFinite(x) && Number.isFinite(y)
    ? x === y
    : a.trim() === b.trim();
};

/**
 * Mirrors the server's `decimalString` exactly: non-negative, at most eight
 * decimal places, under a ceiling. The server stays the authority — this only
 * stops a typo becoming a request, and marks the field before Save is pressed.
 */
export const PLAN_NUMBER = /^\d{1,12}(\.\d{1,8})?$/;
export const isValidPlanNumber = (v: string, max: number): boolean =>
  PLAN_NUMBER.test(v.trim()) && Number(v) <= max;

export const MONEY_MAX = 1_000_000_000_000;

/* ── numeric field ────────────────────────────────────────────────────── */

/**
 * One editable figure.
 *
 * The currency or percent sign sits inside the border rather than in the column
 * header, because a bare `5000` in an editable cell is the exact ambiguity this
 * screen used to ship: dollars, percent and a count all rendered identically.
 */
export function NumField({
  label, value, onChange, dirty, invalid, prefix, suffix, width = 'w-[108px]',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  dirty?: boolean;
  invalid?: boolean;
  prefix?: string;
  suffix?: string;
  width?: string;
}) {
  const [focused, setFocused] = useState(false);

  /**
   * Grouped when idle, raw while being typed into.
   *
   * `5000000` and `500000` are one keystroke and one zero apart in an editable
   * cell, and this column holds a rank's team-business requirement — the exact
   * place a misread costs money. Separators are added only on blur because
   * reformatting under the cursor moves it mid-word; on focus the field returns
   * to the plain value the server will receive.
   */
  const grouped = Boolean(prefix) && !focused && value.trim() !== '' && PLAN_NUMBER.test(value.trim());
  const shown = grouped ? Number(value).toLocaleString('en-US', { maximumFractionDigits: 8 }) : value;

  return (
    <span
      title={invalid ? `${label} must be a positive number` : undefined}
      className={clsx(
        'inline-flex h-9 items-center gap-1 rounded-[4px] border bg-field px-2 transition',
        'focus-within:ring-4 focus-within:ring-gold/15',
        invalid
          ? 'border-bad ring-2 ring-bad/25'
          : dirty
            ? 'border-gold ring-2 ring-gold/20'
            : 'border-field-line focus-within:border-gold',
        width,
      )}
    >
      {prefix && <span aria-hidden className="shrink-0 text-[12px] text-ink-3">{prefix}</span>}
      <input
        aria-label={label}
        aria-invalid={invalid || undefined}
        inputMode="decimal"
        value={shown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        // Pasting a grouped figure is normal; strip the separators rather than
        // failing validation on a value the operator reasonably typed.
        onChange={(e) => onChange(e.target.value.replace(/,/g, ''))}
        className="w-full min-w-0 bg-transparent text-right text-[12.5px] tabular-nums text-ink outline-none"
      />
      {suffix && <span aria-hidden className="shrink-0 text-[12px] text-ink-3">{suffix}</span>}
    </span>
  );
}

/* ── toggle ───────────────────────────────────────────────────────────── */

export function Toggle({ on, onChange, label, busy }: {
  on: boolean; onChange: (v: boolean) => void; label: string; busy?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={busy}
      onClick={() => onChange(!on)}
      className={clsx(
        'relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/25',
        on ? 'bg-gold' : 'bg-line-strong',
      )}
    >
      <span className={clsx(
        'absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
        on && 'translate-x-4',
      )} />
    </button>
  );
}

/* ── save bar ─────────────────────────────────────────────────────────── */

/**
 * Sticky, so it stays reachable in a table taller than the viewport, and absent
 * entirely until something is actually pending — a permanently enabled Save on
 * a payout rule invites a confirmation for a change nobody made.
 */
export function SaveBar({
  dirtyCount, invalidCount, saving, onSave, onDiscard, note, noun = 'change',
}: {
  dirtyCount: number;
  invalidCount: number;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  note?: string;
  /** What is being counted — "change", "level", "rank". Pluralised with an s. */
  noun?: string;
}) {
  if (dirtyCount === 0) return null;
  const blocked = invalidCount > 0;

  return (
    <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-card/95 px-5 py-3 backdrop-blur-sm">
      <p className="text-[12.5px]" role="status">
        {blocked ? (
          <span className="font-medium text-bad">
            {invalidCount} {invalidCount === 1 ? 'value is not a number' : 'values are not numbers'} — fix before saving
          </span>
        ) : (
          <>
            <span className="font-medium text-ink">
              {dirtyCount} unsaved {noun}{dirtyCount === 1 ? '' : 's'}
            </span>
            {note && <span className="text-ink-2"> · {note}</span>}
          </>
        )}
      </p>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onDiscard} disabled={saving}>Discard</Button>
        <Button size="sm" onClick={onSave} loading={saving} disabled={blocked}>
          Save {dirtyCount} {noun}{dirtyCount === 1 ? '' : 's'}
        </Button>
      </div>
    </div>
  );
}

/* ── load states ──────────────────────────────────────────────────────── */

/**
 * A failure to read the plan is not an empty plan.
 *
 * Rendering `data ?? []` into a table meant a dead API and a genuinely
 * unconfigured platform produced the identical screen — "No packages
 * configured" under an outage, which is the worst possible thing to tell an
 * operator about a live compensation plan.
 */
export function LoadFailed({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 px-5 py-12 text-center">
      <span className="grid h-9 w-9 place-items-center rounded-[4px] bg-bad-soft text-bad">
        <AlertTriangle size={17} />
      </span>
      <p className="text-[13.5px] font-medium text-ink">Could not load this section</p>
      <p className="max-w-[48ch] text-[12.5px] leading-relaxed text-ink-2">{adminError(error)}</p>
      <p className="max-w-[48ch] text-[12px] leading-relaxed text-ink-3">
        The plan itself is unchanged. This is a problem reading the configuration, not a
        problem with it.
      </p>
      {retry && (
        <Button size="sm" variant="outline" onClick={retry} className="mt-1">
          <RotateCcw size={13} /> Try again
        </Button>
      )}
    </div>
  );
}

export function LoadingRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 px-5 pb-5" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-10" />)}
    </div>
  );
}

/**
 * Loading, failed, or loaded — the three a data surface must handle. Empty is
 * left to the table underneath, which is the only thing that knows what an
 * empty version of itself should say.
 */
export function SectionBody({ q, rows, children }: {
  q: { isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown };
  rows?: number;
  children: ReactNode;
}) {
  if (q.isLoading) return <LoadingRows rows={rows} />;
  if (q.isError) return <LoadFailed error={q.error} retry={() => q.refetch()} />;
  return <>{children}</>;
}

/* ── counting helper ──────────────────────────────────────────────────── */

/** Pending edits and, of those, how many could not be sent. */
export function useDirtyStats(
  draft: Draft,
  resolve: (key: string) => { server: string; max: number } | null,
) {
  return useMemo(() => {
    let dirty = 0;
    let invalid = 0;
    for (const [k, v] of Object.entries(draft)) {
      const f = resolve(k);
      if (!f || sameValue(v, f.server)) continue;
      dirty += 1;
      if (!isValidPlanNumber(v, f.max)) invalid += 1;
    }
    return { dirty, invalid };
  }, [draft, resolve]);
}
