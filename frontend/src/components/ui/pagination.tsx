'use client';

import { clsx } from 'clsx';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { num } from '@/lib/format';

/**
 * Pager for the admin lists.
 *
 * Every list used to request a fixed `take: 100` while printing the true total
 * in its header — so a page could claim "5,000 entries" and silently show the
 * first hundred, with nothing to say the rest existed. The range readout here
 * is the point as much as the buttons are.
 */
export function Pagination({
  total, page, pageSize, onPage, onPageSize, sizes = [25, 50, 100, 200],
}: {
  total: number;
  page: number;               // zero-based
  pageSize: number;
  onPage: (p: number) => void;
  onPageSize?: (n: number) => void;
  sizes?: number[];
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pages - 1);
  const from = total === 0 ? 0 : current * pageSize + 1;
  const to = Math.min(total, (current + 1) * pageSize);

  const btn = 'grid h-8 w-8 place-items-center rounded-[8px] border border-line bg-card text-ink-2 transition ' +
              'hover:border-line-strong hover:text-ink disabled:pointer-events-none disabled:opacity-40 ' +
              'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/20';

  return (
    <nav aria-label="Pagination"
         className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
      <p className="text-[12.5px] tabular-nums text-ink-2">
        {total === 0 ? 'Nothing to show' : <>Showing <span className="font-medium text-ink">{num(from)}–{num(to)}</span> of {num(total)}</>}
      </p>

      <div className="flex items-center gap-3">
        {onPageSize && (
          <label className="flex items-center gap-1.5 text-[12.5px] text-ink-2">
            <span className="hidden sm:inline">Rows</span>
            <select
              value={pageSize}
              onChange={(e) => { onPageSize(Number(e.target.value)); onPage(0); }}
              className="h-8 rounded-[8px] border border-field-line bg-field px-2 text-[12.5px] text-ink outline-none transition focus:border-gold focus:ring-4 focus:ring-gold/15"
            >
              {sizes.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )}

        <div className="flex items-center gap-1.5">
          <button className={btn} onClick={() => onPage(current - 1)} disabled={current <= 0} aria-label="Previous page">
            <ChevronLeft size={16} />
          </button>
          <span className={clsx('min-w-[86px] text-center text-[12.5px] tabular-nums text-ink-2')}>
            Page {num(current + 1)} of {num(pages)}
          </span>
          <button className={btn} onClick={() => onPage(current + 1)} disabled={current >= pages - 1} aria-label="Next page">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </nav>
  );
}
