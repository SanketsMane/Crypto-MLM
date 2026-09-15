'use client';

import { clsx } from 'clsx';
import type { ReactNode } from 'react';

/* Console-flavoured primitives (mono labels, dense rows) used by the
   operational admin screens. Palette comes from the design tokens, so these
   follow the theme exactly like the rest of the surface.                   */

export function Panel({ title, action, children, className }: {
  title?: string; action?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={clsx('rounded-[5px] border border-line bg-card shadow-card', className)}>
      {(title || action) && (
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          {title && <h2 className="font-mono text-[10px] uppercase tracking-widest text-ink-2">{title}</h2>}
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Metric({ label, value, hint, tone }: {
  label: string; value: ReactNode; hint?: string; tone?: 'good' | 'warn' | 'bad';
}) {
  return (
    <div className="rounded-[5px] border border-line bg-card p-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-ink-2">{label}</p>
      <p className={clsx('mt-1.5 font-mono text-xl font-semibold tabular-nums',
        tone === 'good' ? 'text-good' : tone === 'warn' ? 'text-warn' : tone === 'bad' ? 'text-bad' : 'text-ink')}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-ink-2">{hint}</p>}
    </div>
  );
}

export function Grid({ head, rows, empty }: { head: string[]; rows: ReactNode[][]; empty?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-line bg-thead">
            {head.map((h) => (
              <th key={h} className="whitespace-nowrap px-3 py-2 text-left font-mono text-[10px] uppercase tracking-widest text-ink-2">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={head.length} className="px-3 py-8 text-center text-ink-2">{empty ?? 'Nothing here.'}</td></tr>
          ) : rows.map((cells, i) => (
            <tr key={i} className="border-b border-line-soft transition-colors last:border-0 hover:bg-row-hover">
              {cells.map((c, j) => <td key={j} className="whitespace-nowrap px-3 py-2.5 text-ink">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'info' }) {
  return (
    <span className={clsx('rounded px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide',
      tone === 'neutral' && 'bg-mute-soft text-mute-on',
      tone === 'good' && 'bg-good-soft text-good-on',
      tone === 'warn' && 'bg-warn-soft text-warn-on',
      tone === 'bad' && 'bg-bad-soft text-bad-on',
      tone === 'info' && 'bg-violet-soft text-violet-on')}>
      {children}
    </span>
  );
}

export const statusTone = (s: string): 'neutral' | 'good' | 'warn' | 'bad' =>
  s === 'PROCESSED' || s === 'ACTIVE' ? 'good'
  : s === 'REJECTED' || s === 'BLOCKED' || s === 'FAILED' ? 'bad'
  : s === 'PENDING' || s === 'SUSPENDED' || s === 'CAPPED' ? 'warn'
  : 'neutral';
