'use client';

import { clsx } from 'clsx';
import type { ReactNode } from 'react';

/* ── Card ─────────────────────────────────────────────────────────────── */
export function Card(
  // `id` so a card can be a deep-link target — /security#notifications.
  { children, className, hover = false, id }:
  { children: ReactNode; className?: string; hover?: boolean; id?: string },
) {
  return (
    <section id={id} className={clsx(
      'rounded-[14px] border border-line bg-card shadow-card',
      hover && 'transition-shadow duration-200 hover:shadow-raise',
      className,
    )}>
      {children}
    </section>
  );
}

export function CardHead(
  { title, subtitle, action, right, className }:
  { title: string; subtitle?: string; action?: ReactNode; right?: ReactNode; className?: string },
) {
  return (
    <header className={clsx('flex items-start justify-between gap-3 px-5 pb-3 pt-4', className)}>
      <div className="min-w-0">
        <h2 className="text-[16px] font-semibold leading-tight tracking-[-0.01em] text-ink">{title}</h2>
        {subtitle && (
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{subtitle}</p>
        )}
      </div>
      {action ?? right}
    </header>
  );
}

/* ── Page header ──────────────────────────────────────────────────────── */
export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-[25px] font-semibold tracking-[-0.02em] text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-[13.5px] text-ink-2">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/* ── Buttons ──────────────────────────────────────────────────────────── */
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'gold';
  size?: 'sm' | 'md';
  loading?: boolean;
};

export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...rest }: BtnProps) {
  /* the one place the brand colour is allowed to fill a surface */
  const gold = 'bg-gold text-gold-on hover:bg-gold-hi active:bg-gold-dark active:scale-[0.985]';
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-[9px] font-medium transition-all duration-150',
        'disabled:cursor-not-allowed disabled:opacity-55',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/25',
        size === 'sm' ? 'h-8 px-3 text-[12.5px]' : 'h-10 px-4 text-[13.5px]',
        (variant === 'primary' || variant === 'gold') && gold,
        variant === 'secondary' && 'bg-violet text-white hover:bg-violet-hi active:scale-[0.985] focus-visible:ring-violet/25',
        variant === 'outline' && 'border border-line bg-card text-ink hover:border-line-strong hover:bg-canvas',
        variant === 'ghost' && 'text-ink-2 hover:bg-canvas hover:text-ink',
        variant === 'danger' && 'bg-bad text-white hover:brightness-110 focus-visible:ring-bad/25',
        className,
      )}
    >
      {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

/* ── Status badge ─────────────────────────────────────────────────────── */
const TONE = {
  good:    'bg-good-soft text-good-on',
  warn:    'bg-warn-soft text-warn-on',
  bad:     'bg-bad-soft text-bad-on',
  info:    'bg-violet-soft text-violet-on',
  gold:    'bg-gold-soft text-gold-on-soft',
  neutral: 'bg-mute-soft text-mute-on',
} as const;

export type Tone = keyof typeof TONE;

export const toneFor = (s: string): Tone =>
  ['PROCESSED', 'APPROVED', 'ACTIVE', 'CREDIT', 'COMPLETED'].includes(s) ? 'good'
  : ['PENDING', 'SUSPENDED', 'CAPPED'].includes(s) ? 'warn'
  : ['REJECTED', 'FAILED', 'BLOCKED', 'DEBIT'].includes(s) ? 'bad'
  : 'neutral';

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return (
    <span className={clsx('inline-flex items-center rounded-full px-2.5 py-[3px] text-[11px] font-medium capitalize', TONE[tone])}>
      {typeof children === 'string' ? children.toLowerCase() : children}
    </span>
  );
}

/* ── Table ────────────────────────────────────────────────────────────── */
export function Table({ head, rows, empty, dense }: {
  /** A header cell can be a control — a select-all checkbox, a sort button. */
  head: ReactNode[]; rows: ReactNode[][]; empty?: string; dense?: boolean;
}) {
  return (
    /**
     * Focusable, and named.
     *
     * A horizontally scrolling region that cannot be focused is unreachable
     * without a mouse — the columns past the fold simply do not exist for a
     * keyboard user. `tabIndex={0}` puts it in the tab order so the arrow keys
     * can scroll it, and the role and label explain what has just been focused.
     */
    <div
      className="overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet"
      tabIndex={0}
      role="region"
      aria-label="Table, scrolls horizontally"
    >
      <table className="w-full min-w-[520px] border-collapse">
        <thead>
          <tr className="bg-thead">
            {head.map((h, i) => (
              // Index as key: header cells are a fixed list that never reorders,
              // and a cell may now be an element rather than a string.
              <th key={i} className="whitespace-nowrap border-y border-line px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.04em] text-ink-2">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={head.length} className="px-5 py-12 text-center text-[13.5px] text-ink-2">{empty ?? 'Nothing to show yet.'}</td></tr>
          ) : rows.map((cells, i) => (
            <tr key={i} className="transition-colors hover:bg-row-hover">
              {cells.map((c, j) => (
                <td key={j} className={clsx(
                  'whitespace-nowrap border-b border-line-soft px-4 text-[13px] text-ink last:border-b-0',
                  dense ? 'py-2.5' : 'py-3.5',
                )}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Skeleton ─────────────────────────────────────────────────────────── */
export const Skeleton = ({ className }: { className?: string }) => (
  <div className={clsx('animate-pulse rounded-lg bg-line-soft', className)} />
);

/* ── Select / input controls ──────────────────────────────────────────── */
export const controlCls =
  'h-10 rounded-[9px] border border-field-line bg-field px-3 text-[13px] text-ink outline-none transition placeholder:text-field-ph focus:border-gold focus:ring-4 focus:ring-gold/15';

export function Select({ value, onChange, options, className, label }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; className?: string;
  /**
   * What this control is for.
   *
   * Required in practice even where a visible label sits beside it: a select
   * with no accessible name is announced as just "combo box", so somebody
   * using a screen reader hears the options without ever learning what they
   * are choosing. Axe rates it critical, and on a filter that changes which
   * transactions are shown, it is.
   */
  label: string;
}) {
  return (
    <select
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      className={clsx(controlCls, 'pr-8', className)}
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/* ── Panel ─────────────────────────────────────────────────────────────
   Card + optional header in one element. Keeps page code flat when a
   section is just "titled box with content".                          */
export function Panel({ title, action, children, className }: {
  title?: string; action?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <Card className={className}>
      {(title || action) && <CardHead title={title ?? ''} action={action} />}
      <div className={title || action ? '' : 'pt-1'}>{children}</div>
    </Card>
  );
}

/** Compact metric strip used inside panels. */
export function Metric({ label, value, hint, tone }: {
  label: string; value: ReactNode; hint?: string; tone?: 'good' | 'warn' | 'bad';
}) {
  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <p className="text-[10.5px] font-medium uppercase tracking-[0.04em] text-ink-2">{label}</p>
      <p className={clsx('mt-1.5 text-[20px] font-semibold tabular-nums',
        tone === 'good' ? 'text-good' : tone === 'warn' ? 'text-warn' : tone === 'bad' ? 'text-bad' : 'text-ink')}>{value}</p>
      {hint && <p className="mt-0.5 text-[11.5px] text-ink-2">{hint}</p>}
    </div>
  );
}
