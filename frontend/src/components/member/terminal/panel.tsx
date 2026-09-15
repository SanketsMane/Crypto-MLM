import { clsx } from 'clsx';

/**
 * The terminal's one container.
 *
 * The old dashboard had five different card treatments — `dash-card`,
 * `plan-card`, `balance-panel`, `wallet-tile` and a handful of bespoke divs,
 * each with its own radius, padding and shadow. That is why the page read as a
 * collection of widgets rather than one instrument.
 *
 * Everything here is one `Panel`: a rectangle, a hairline, a 30px header rail
 * and a body. Emphasis comes from what a panel CONTAINS, never from how its
 * container is decorated.
 */
export function Panel({
  title, meta, action, children, className, bodyClassName, flush,
}: {
  title?: React.ReactNode;
  /** Right-aligned label in the header rail — a unit, a count, a range. */
  meta?: React.ReactNode;
  /** Right-aligned control in the header rail. Wins over `meta`. */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Body with no padding, for tables and tapes that draw their own rows. */
  flush?: boolean;
}) {
  return (
    <section className={clsx('flex min-w-0 flex-col rounded-[5px] border border-line bg-card', className)}>
      {(title || meta || action) && (
        <header className="flex h-[30px] shrink-0 items-center justify-between gap-3 border-b border-line px-3">
          <span className="truncate text-[11.5px] font-semibold text-ink">{title}</span>
          {action ?? (meta ? <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.09em] text-ink-3">{meta}</span> : null)}
        </header>
      )}
      <div className={clsx('min-h-0 flex-1', !flush && 'p-3', bodyClassName)}>{children}</div>
    </section>
  );
}

/** Small caps label. The terminal's voice for anything that names a value. */
export function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={clsx('block text-[9.5px] font-semibold uppercase tracking-[0.09em] text-ink-3', className)}>
      {children}
    </span>
  );
}

/**
 * A figure.
 *
 * Money is never plain text in this product. Tone is carried by direction, not
 * by the caller remembering a colour class, and every figure is tabular so
 * columns hold still while values update.
 */
export function Figure({
  value, size = 'md', tone = 'plain', className,
}: {
  value: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  tone?: 'plain' | 'up' | 'down' | 'muted' | 'accent';
  className?: string;
}) {
  return (
    <span
      className={clsx(
        'tabular-nums font-semibold leading-none',
        size === 'sm' && 'text-[11.5px]',
        size === 'md' && 'text-[14px]',
        size === 'lg' && 'text-[19px] tracking-[-0.02em]',
        size === 'xl' && 'text-[30px] tracking-[-0.03em]',
        tone === 'plain' && 'text-ink',
        tone === 'up' && 'text-good',
        tone === 'down' && 'text-bad',
        tone === 'muted' && 'text-ink-3',
        tone === 'accent' && 'text-gold',
        className,
      )}
    >
      {value}
    </span>
  );
}
