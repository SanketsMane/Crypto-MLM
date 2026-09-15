import { usd } from '@/lib/format';
import { Label } from '@/components/member/terminal/panel';
import { metaFor } from './wallet-meta';

/**
 * One balance.
 *
 * Rebuilt from the navy "brand tile" this used to be. That tile was a
 * 180px-tall gradient panel carrying a 44px icon chip, a decorative arrow that
 * pointed at nothing, a 34px figure and a tinted capsule — four decorated
 * elements around one number, in a colour scheme that stayed dark while the
 * rest of the page followed the theme.
 *
 * What replaces it is the same object the dashboard already uses for a
 * balance: an accent rule that identifies the wallet, the name, the figure,
 * and what the wallet is FOR. The role line is the only thing here a member
 * cannot work out for themselves, so it is the only prose that survived.
 */
export function WalletSummaryCard({ type, balance, locked }: {
  type: string;
  balance: string;
  locked?: string;
}) {
  const m = metaFor(type);
  const heldAmount = Number(locked ?? 0);
  const held = heldAmount > 0;

  return (
    <article className="flex min-w-0 items-stretch gap-3 rounded-[5px] border border-line bg-card px-3.5 py-3">
      {/* The wallet's identity, as a rule rather than a chip. It reads as part
          of the tile's structure instead of as an ornament sitting on it. */}
      <span aria-hidden className="w-[3px] shrink-0 rounded-[1px]" style={{ background: m.accent }} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <m.icon size={13} strokeWidth={2} className="shrink-0 text-ink-3" />
          <Label>{m.label}</Label>
        </div>

        <p className="mt-1.5 truncate text-[24px] font-semibold leading-none tracking-[-0.03em] text-ink tabular-nums">
          {usd(balance)}
        </p>

        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-[10.5px] text-ink-3">{m.role}</span>
          {held && (
            /* Stated inline rather than as a badge. A held balance is a fact
               about the figure above it, not a status the wallet is in. */
            <span className="text-[10.5px] tabular-nums text-warn">
              {usd(locked)} locked
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

/** Matches the card above so the layout does not jump when data lands. */
export function WalletSummarySkeleton() {
  return (
    <article className="flex min-w-0 items-stretch gap-3 rounded-[5px] border border-line bg-card px-3.5 py-3">
      <span className="w-[3px] shrink-0 rounded-[1px] bg-line-soft" />
      <div className="min-w-0 flex-1">
        <span className="block h-2.5 w-24 animate-pulse rounded-[2px] bg-line-soft" />
        <span className="mt-2 block h-6 w-32 animate-pulse rounded-[2px] bg-line-soft" />
        <span className="mt-2.5 block h-2.5 w-40 animate-pulse rounded-[2px] bg-line-soft" />
      </div>
    </article>
  );
}
