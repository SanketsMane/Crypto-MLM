'use client';

import { clsx } from 'clsx';
import type { ReactNode } from 'react';

/**
 * The member console's shared vocabulary.
 *
 * Every page in `(dashboard)` imports from this file, so it is the one place
 * that decides how the signed-in product reads. It has been brought onto the
 * terminal register already established by `components/member/terminal` —
 * same hairlines, same small-caps labels, same tabular figures, same density.
 *
 * The change is deliberate and it is structural, not cosmetic. What was here
 * before was a generic admin template: 25px page titles, 16px card titles,
 * 51px table rows, 118px stat tiles with pastel icon chips. A member opening
 * Wallet or Team met a different product from the one they met on the
 * dashboard — bigger type, more air, less information, and a palette of tinted
 * chips that predates the current token system.
 *
 * Density here is not about fitting more in for its own sake. It is what lets
 * a figure sit next to the thing it should be compared against. A 51px row
 * shows six ledger entries in a panel; a 32px row shows eleven, and eleven is
 * where a column of amounts becomes something you can read DOWN.
 */

/* ── Card ─────────────────────────────────────────────────────────────── */
export function Card(
  // `id` so a card can be a deep-link target — /security#notifications.
  { children, className, hover = false, id }:
  { children: ReactNode; className?: string; hover?: boolean; id?: string },
) {
  return (
    <section id={id} className={clsx(
      'rounded-[5px] border border-line bg-card',
      /* Kept for call sites that opt in, but reduced to a border lift. The
         raised shadow made every card look like it was waiting to be clicked,
         including the ones that are not interactive. */
      hover && 'transition-colors duration-140 hover:border-line-strong',
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
    /**
     * A header rail, not a header block.
     *
     * Without a subtitle this is a fixed 32px rule that matches the terminal's
     * `Panel`, so a page can mix the two without a visible seam. A subtitle
     * makes it grow rather than forcing every header to reserve the space.
     */
    <header className={clsx(
      'flex items-start justify-between gap-3 border-b border-line px-3.5',
      subtitle ? 'py-2.5' : 'min-h-[32px] items-center py-0',
      className,
    )}>
      <div className="min-w-0">
        <h2 className="truncate text-[12px] font-semibold leading-tight tracking-[-0.005em] text-ink">{title}</h2>
        {subtitle && (
          <p className="mt-1 text-[11px] leading-relaxed text-ink-3">{subtitle}</p>
        )}
      </div>
      {/* Deliberately NOT `shrink-0`. Several headers carry a filter row wider
          than a phone — two selects and an export button — and pinning it at
          its natural width pushed the whole page 15px past the viewport
          instead of letting the row wrap. The title truncates first because
          its own box is `min-w-0`. */}
      {(action ?? right) && <div className="min-w-0">{action ?? right}</div>}
    </header>
  );
}

/* ── Page header ──────────────────────────────────────────────────────── */
export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    /**
     * One line, not a masthead.
     *
     * This used to open every page with a 25px title, a 13.5px subtitle and
     * 20px of margin — roughly 70px of chrome restating the nav item the
     * member just clicked, on a page whose first real figure then started
     * below the fold on a laptop. The title now sits on the same baseline as
     * its subtitle and the whole rail is under 30px.
     */
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
        <h1 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</h1>
        {subtitle && <p className="text-[11.5px] text-ink-3">{subtitle}</p>}
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
  const accent = 'bg-gold text-gold-on hover:bg-gold-hi active:bg-gold-dark';
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-[4px] font-semibold transition-colors duration-140',
        'disabled:cursor-not-allowed disabled:opacity-55',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/25',
        size === 'sm' ? 'h-7 px-2.5 text-[11.5px]' : 'h-8 px-3.5 text-[12.5px]',
        (variant === 'primary' || variant === 'gold') && accent,
        /* `secondary` was a filled violet, which read as a second, competing
           primary. It is now a quiet filled surface — still a real button,
           but it no longer argues with the accent next to it. */
        variant === 'secondary' && 'bg-card-2 text-ink ring-1 ring-line-strong hover:bg-row-hover',
        variant === 'outline' && 'border border-line-strong bg-transparent text-ink hover:border-gold hover:text-gold',
        variant === 'ghost' && 'text-ink-2 hover:bg-card-2 hover:text-ink',
        variant === 'danger' && 'bg-bad text-white hover:brightness-110 focus-visible:ring-bad/25',
        className,
      )}
    >
      {loading && <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

/* ── Status badge ─────────────────────────────────────────────────────── */
const TONE = {
  good:    'bg-good-soft text-good-on',
  warn:    'bg-warn-soft text-warn-on',
  bad:     'bg-bad-soft text-bad-on',
  info:    'bg-info-soft text-info-on',
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
    /**
     * A tag, not a pill.
     *
     * The pill shape belonged to the old rounded card language. Square-ish
     * corners at 3px match the panels the badges sit inside, and dropping the
     * capsule padding stops a one-word status from being the widest thing in
     * its table column.
     */
    <span className={clsx(
      'inline-flex items-center rounded-[3px] px-1.5 py-[2px] text-[10px] font-semibold uppercase tracking-[0.05em]',
      TONE[tone],
    )}>
      {children}
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
      className="overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
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
              <th key={i} className="whitespace-nowrap border-b border-line px-3 py-[7px] text-left text-[9.5px] font-semibold uppercase tracking-[0.09em] text-ink-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={head.length} className="px-3 py-10 text-center text-[11.5px] text-ink-3">{empty ?? 'Nothing to show yet.'}</td></tr>
          ) : rows.map((cells, i) => (
            <tr key={i} className="transition-colors hover:bg-row-hover">
              {cells.map((c, j) => (
                <td key={j} className={clsx(
                  'whitespace-nowrap border-b border-line-soft px-3 text-[12px] text-ink-2 last:border-b-0',
                  /* First column is the row's identity — a code, a date, a
                     name. Giving it the full ink separates it from the
                     attributes that describe it. */
                  j === 0 && 'text-ink',
                  dense ? 'py-[7px]' : 'py-2.5',
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
  <div className={clsx('animate-pulse rounded-[3px] bg-line-soft', className)} />
);

/* ── Select / input controls ──────────────────────────────────────────── */
export const controlCls =
  'h-8 rounded-[4px] border border-field-line bg-field px-2.5 text-[12px] text-ink outline-none transition placeholder:text-field-ph focus:border-gold focus:ring-4 focus:ring-gold/15';

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

/** Small caps label. Matches the terminal's `Label` so the two can sit together. */
export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={clsx('block text-[9.5px] font-semibold uppercase tracking-[0.09em] text-ink-3', className)}>
      {children}
    </span>
  );
}

/**
 * Compact metric tile.
 *
 * Same shape as the dashboard's KPI tile: label, figure, one line of context.
 * No icon chip. A wallet glyph beside the word "Wallet balance" carried no
 * information and cost the 40px that the context line now uses to say
 * something true about the number.
 */
export function Metric({ label, value, hint, tone }: {
  label: string; value: ReactNode; hint?: string; tone?: 'good' | 'warn' | 'bad';
}) {
  return (
    <div className="min-w-0 rounded-[5px] border border-line bg-card px-3 py-2.5">
      <Label>{label}</Label>
      <p className={clsx('mt-1.5 truncate text-[19px] font-semibold leading-none tracking-[-0.02em] tabular-nums',
        tone === 'good' ? 'text-good' : tone === 'warn' ? 'text-warn' : tone === 'bad' ? 'text-bad' : 'text-ink')}>{value}</p>
      {hint && <p className="mt-1.5 truncate text-[10.5px] text-ink-3">{hint}</p>}
    </div>
  );
}
