import { ArrowUpRight } from 'lucide-react';
import { usd } from '@/lib/format';
import { metaFor } from './wallet-meta';

/**
 * One balance, as a navy brand tile. Presentation only — the figure and the
 * locked amount come straight from `/wallet`.
 */
export function WalletSummaryCard({ type, balance, locked }: {
  type: string;
  balance: string;
  locked?: string;
}) {
  const m = metaFor(type);
  const held = Number(locked ?? 0) > 0;

  return (
    <article
      className="wallet-tile flex flex-col p-5 sm:p-6"
      style={{ '--tile-accent': m.accent } as React.CSSProperties}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className="grid size-11 shrink-0 place-items-center rounded-[14px] border"
          style={{
            borderColor: `color-mix(in srgb, ${m.accent} 38%, transparent)`,
            background: `color-mix(in srgb, ${m.accent} 14%, transparent)`,
            color: m.accent,
          }}
        >
          <m.icon size={19} strokeWidth={2} />
        </span>
        {/* Decorative: the whole tile is not a link, so this must not read as
            one to a screen reader. */}
        <span
          aria-hidden
          className="grid size-8 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-white/60"
        >
          <ArrowUpRight size={15} strokeWidth={2.2} />
        </span>
      </div>

      <p className="mt-5 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-white/60">
        <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: m.accent }} />
        {m.label}
      </p>

      <p className="mt-2 truncate text-[30px] font-bold leading-none tracking-[-0.03em] text-[#F8FAFC] tabular-nums sm:text-[34px]">
        {usd(balance)}
      </p>

      <p className="mt-2 text-[12.5px] text-[#94A3B8]">{m.role}</p>

      {held && (
        <p className="mt-2.5 inline-flex w-fit items-center rounded-full border border-warn/25 bg-warn/10 px-2.5 py-1 text-[11px] font-medium tabular-nums text-warn">
          {usd(locked)} locked
        </p>
      )}
    </article>
  );
}

/** Matches the card above so the layout does not jump when data lands. */
export function WalletSummarySkeleton() {
  return (
    <article className="wallet-tile flex flex-col p-5 sm:p-6" style={{ '--tile-accent': '#8B5CF6' } as React.CSSProperties}>
      <div className="flex items-start justify-between">
        <span className="size-11 rounded-[14px] bg-white/[0.07]" />
        <span className="size-8 rounded-full bg-white/[0.05]" />
      </div>
      <span className="mt-5 block h-3 w-24 rounded bg-white/[0.07]" />
      <span className="mt-3 block h-8 w-32 rounded bg-white/[0.09]" />
      <span className="mt-3 block h-3 w-40 rounded bg-white/[0.05]" />
    </article>
  );
}
