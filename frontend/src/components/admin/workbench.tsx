'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { num } from '@/lib/format';

/**
 * Layout primitives for the queue-and-detail admin screens.
 *
 * These pages are workbenches: an operator works a queue, and the thing being
 * worked on deserves the room. Three decisions drive the shape —
 *
 *   - Two columns from `lg`, not `xl`. A 1280px laptop is the common operator
 *     screen, and stacking the queue on top of the detail there turns a
 *     side-by-side review into an endless scroll.
 *   - One scrollbar. The queue rail sticks and scrolls itself; the detail flows
 *     in the page. Nesting a scrolling pane inside a scrolling page — which is
 *     what a `max-h-[46vh]` list produces — means neither wheel does what you
 *     expect.
 *   - Actions stay reachable. The decision bar sticks to the top of the detail
 *     and the composer to the bottom, so neither is ever a scroll away.
 */

/** Height of the admin chrome above the workbench — header plus main padding. */
const CHROME = '150px';

export function Workbench({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-12">{children}</div>;
}

export function Rail({ children }: { children: ReactNode }) {
  return (
    <section
      style={{ maxHeight: `calc(100dvh - ${CHROME})` }}
      className="flex flex-col overflow-hidden rounded-[5px] border border-line bg-card shadow-card lg:sticky lg:top-[86px] lg:col-span-5 xl:col-span-4"
    >
      {children}
    </section>
  );
}

export function Detail({ children }: { children: ReactNode }) {
  return (
    // `overflow-clip` rather than `overflow-hidden`: hidden makes this a scroll
    // container, which silently defeats the sticky DetailBar inside it — the bar
    // can only stick within a box that never scrolls, so it scrolled away with
    // the page. `clip` clips to the rounded corner without becoming one.
    <section className="overflow-clip rounded-[5px] border border-line bg-card shadow-card lg:col-span-7 xl:col-span-8">
      {children}
    </section>
  );
}

/** Sticky decision bar at the top of the detail pane. */
export function DetailBar({ title, subtitle, children }: {
  title: string; subtitle?: ReactNode; children?: ReactNode;
}) {
  return (
    <header className="sticky top-[72px] z-20 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-card/95 px-5 py-3.5 backdrop-blur">
      <div className="min-w-0">
        <h2 className="truncate text-[16px] font-semibold leading-tight tracking-[-0.01em] text-ink">{title}</h2>
        {subtitle && <div className="mt-0.5 text-[12px] text-ink-2">{subtitle}</div>}
      </div>
      {children && <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

/** Status filter as tabs with live counts, rather than a select you have to open. */
export function QueueTabs<T extends string>({ tabs, value, onChange }: {
  tabs: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="tablist" aria-label="Filter by status" className="flex gap-1 overflow-x-auto px-3 pb-2.5 fx-scrollbar-hide">
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value || 'all'}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={clsx(
              'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition',
              'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/25',
              active ? 'bg-gold text-gold-on' : 'text-ink-2 hover:bg-canvas hover:text-ink',
            )}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className={clsx('tabular-nums', active ? 'text-gold-on/75' : 'text-ink-3')}>
                {num(t.count)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Keyboard navigation for the queue.
 *
 * These screens get worked in bulk, and reaching for the mouse for every row
 * is what makes a review tool feel slow. Arrow keys and j/k step through the
 * list; anything typed into a field is left alone.
 */
export function useQueueKeys(ids: string[], openId: string | null, open: (id: string) => void) {
  const ref = useRef({ ids, openId, open });
  ref.current = { ids, openId, open };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const dir = e.key === 'ArrowDown' || e.key === 'j' ? 1
        : e.key === 'ArrowUp' || e.key === 'k' ? -1 : 0;
      if (!dir) return;

      const { ids: list, openId: current, open: go } = ref.current;
      if (list.length === 0) return;
      e.preventDefault();

      const at = current ? list.indexOf(current) : -1;
      const next = at === -1 ? 0 : Math.min(list.length - 1, Math.max(0, at + dir));
      go(list[next]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** A queue row. Scrolls itself into view when selected by keyboard. */
export function QueueRow({ selected, onSelect, children }: {
  selected: boolean; onSelect: () => void; children: ReactNode;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      className={clsx(
        'relative w-full border-b border-line-soft px-5 py-3 text-left transition',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold',
        selected
          ? 'bg-gold-soft before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-gold'
          : 'hover:bg-row-hover',
      )}
    >
      {children}
    </button>
  );
}

/** Placeholder for the detail pane before anything is selected. */
export function EmptyDetail({ icon, title, hint }: { icon: ReactNode; title: string; hint: string }) {
  return (
    <div className="grid place-items-center px-5 py-24 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-[5px] bg-canvas text-ink-3">{icon}</span>
      <p className="mt-4 text-[14px] font-medium text-ink">{title}</p>
      <p className="mt-1 max-w-[38ch] text-[12.5px] leading-relaxed text-ink-2">{hint}</p>
      <p className="mt-4 text-[11.5px] text-ink-3">
        Use <kbd className="rounded border border-line bg-canvas px-1.5 py-0.5 font-sans">↑</kbd>{' '}
        <kbd className="rounded border border-line bg-canvas px-1.5 py-0.5 font-sans">↓</kbd> to move through the queue
      </p>
    </div>
  );
}

/** Labelled facts in a tight grid. `strong` pulls a value out of the noise. */
export function FactGrid({ facts, cols = 4 }: {
  facts: { k: string; v: ReactNode; strong?: boolean; tone?: 'good' | 'bad' | 'warn' }[];
  cols?: 2 | 3 | 4;
}) {
  return (
    <dl className={clsx('grid gap-px border-y border-line bg-line',
      cols === 2 ? 'grid-cols-2' : cols === 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-4')}>
      {facts.map((f) => (
        <div key={f.k} className="bg-card px-4 py-2.5">
          <dt className="text-[10.5px] uppercase tracking-[0.04em] text-ink-2">{f.k}</dt>
          <dd className={clsx('mt-0.5 truncate text-[13px] tabular-nums',
            f.strong ? 'font-semibold' : 'font-medium',
            f.tone === 'good' ? 'text-good' : f.tone === 'bad' ? 'text-bad' : f.tone === 'warn' ? 'text-warn' : 'text-ink')}>
            {f.v}
          </dd>
        </div>
      ))}
    </dl>
  );
}
