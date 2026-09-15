import { clsx } from 'clsx';
import type { ReactNode } from 'react';

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('rounded-[5px] border border-line bg-card p-5', className)}>
      {children}
    </div>
  );
}

export function Stat({ label, value, hint, tone = 'default' }: {
  label: string; value: ReactNode; hint?: string;
  tone?: 'default' | 'positive' | 'warning';
}) {
  return (
    <Card>
      <p className="font-mono text-[10px] uppercase tracking-widest text-ink-2">{label}</p>
      <p className={clsx('mt-2 text-2xl font-semibold tabular-nums',
        tone === 'default' && 'text-ink',
        tone === 'positive' && 'text-good',
        tone === 'warning' && 'text-warn')}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-ink-2">{hint}</p>}
    </Card>
  );
}
