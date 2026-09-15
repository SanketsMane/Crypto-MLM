'use client';

import { CalendarDays, ChevronDown } from 'lucide-react';

const PRESETS = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
];

/**
 * Range picker for the dashboard.
 *
 * It used to be a styled `<button>` with no handler sitting next to a chart
 * that responded to a different control — it showed a date range it could not
 * change. It now drives the same `days` value the chart query uses, so the
 * dates on it are always the dates being shown.
 */
export function DateRangeControl({ days, onDays }: { days: number; onDays: (d: number) => void }) {
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 86_400_000);
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <label className="relative inline-flex h-10 items-center gap-2.5 rounded-[4px] border border-line bg-card px-3.5 text-[13px] text-ink transition focus-within:border-gold focus-within:ring-4 focus-within:ring-gold/15 hover:border-line-strong">
      <CalendarDays size={16} className="pointer-events-none text-ink-2" />
      <span className="pointer-events-none tabular-nums">{fmt(from)} – {fmt(to)}</span>
      <ChevronDown size={15} className="pointer-events-none text-ink-3" />
      {/* the native control carries the interaction and the accessible name */}
      <select
        aria-label="Date range"
        value={days}
        onChange={(e) => onDays(Number(e.target.value))}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {PRESETS.map((p) => <option key={p.days} value={p.days}>{p.label}</option>)}
      </select>
    </label>
  );
}
