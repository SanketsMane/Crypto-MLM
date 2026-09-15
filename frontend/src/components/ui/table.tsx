import type { ReactNode } from 'react';

export function Table({ head, children, empty }: { head: string[]; children: ReactNode; empty?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-[5px] border border-line bg-card">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-line bg-thead">
            {head.map((h) => (
              <th key={h} className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-widest text-ink-2">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {empty ? (
            <tr><td colSpan={head.length} className="px-4 py-10 text-center text-ink-2">Nothing here yet.</td></tr>
          ) : children}
        </tbody>
      </table>
    </div>
  );
}

export const Td = ({ children, mono }: { children: ReactNode; mono?: boolean }) => (
  <td className={`border-b border-line-soft px-4 py-3 text-ink last:border-b-0 ${mono ? 'font-mono tabular-nums text-xs' : ''}`}>{children}</td>
);
