'use client';

import Link from 'next/link';
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine } from 'lucide-react';
import { Card, CardHead, Button, Select, controlCls } from '@/components/ui/primitives';
import { metaFor } from './wallet-meta';

const TYPES = ['MAIN', 'FUND', 'DIGITAL'] as const;

/* Secondary actions. Styled as links rather than a Button inside a Link: the
   latter nests two interactive elements, and `display:contents` on the anchor
   would leave the link with no box to click. */
const secondaryCls =
  'inline-flex h-11 w-full items-center justify-center gap-2 rounded-[12px] border border-line ' +
  'bg-card text-[13.5px] font-medium text-ink transition-colors duration-150 ' +
  'hover:border-line-strong hover:bg-canvas ' +
  'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/25';

/**
 * A native <select> with the wallet's accent shown beside the value.
 *
 * Deliberately still a native control: it keeps keyboard behaviour, the mobile
 * picker and the existing focus ring for free, which a hand-rolled dropdown
 * would have to re-earn. The dot is decoration layered on top, and the padding
 * that makes room for it is inline so it cannot lose to `controlCls`'s own.
 */
function WalletSelect({ value, onChange, label }: {
  value: string; onChange: (v: string) => void;
  /**
   * Which end of the transfer this is.
   *
   * One component renders both controls, and "From" / "To" is the only thing
   * distinguishing them — without it a screen reader announces two identical
   * combo boxes and moving money becomes guesswork.
   */
  label: string;
}) {
  const accent = metaFor(value).accent;
  return (
    <div className="wallet-select relative">
      <span
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 z-10 size-2.5 -translate-y-1/2 rounded-full"
        style={{ background: accent }}
      />
      <Select
        label={label}
        value={value}
        onChange={onChange}
        className="h-11 w-full"
        options={TYPES.map((t) => ({ value: t, label: metaFor(t).label }))}
      />
    </div>
  );
}

export function MoveFundsCard({
  from, to, amount, onFrom, onTo, onAmount, onSubmit, pending,
}: {
  from: string; to: string; amount: string;
  onFrom: (v: string) => void; onTo: (v: string) => void; onAmount: (v: string) => void;
  onSubmit: () => void; pending: boolean;
}) {
  // Unchanged from the panel this replaces.
  const sameWallet = from === to;
  const disabled = sameWallet || !amount || Number(amount) <= 0;

  return (
    <Card className="dash-card flex h-full flex-col">
      <CardHead title="Move funds" subtitle="Transfer money between your wallets." />

      <form
        className="space-y-4 px-5 pb-5"
        onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
      >
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3">From</span>
            <WalletSelect label="Transfer from" value={from} onChange={onFrom} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3">To</span>
            <WalletSelect label="Transfer to" value={to} onChange={onTo} />
          </label>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3">Amount</span>
          <div className="relative">
            <input
              type="number" min="0.01" step="0.01" required
              value={amount}
              onChange={(e) => onAmount(e.target.value)}
              placeholder="Enter amount"
              aria-invalid={sameWallet || undefined}
              className={`${controlCls} h-12 w-full tabular-nums`}
              style={{ paddingRight: '2rem' }}
            />
            <span aria-hidden className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[13px] font-medium text-ink-3">
              $
            </span>
          </div>
        </label>

        <Button
          type="submit"
          className="h-13 w-full rounded-[14px] text-[14.5px]"
          loading={pending}
          disabled={disabled}
        >
          <ArrowLeftRight size={16} strokeWidth={2.2} /> Transfer
        </Button>

        {sameWallet && (
          <p role="alert" className="text-[12px] text-warn">Choose two different wallets.</p>
        )}
      </form>

      <div className="mt-auto grid grid-cols-1 gap-3 border-t border-[var(--dash-border)] px-5 py-4 min-[420px]:grid-cols-2">
        <Link href="/deposit" className={secondaryCls}>
          <ArrowDownToLine size={15} className="text-[var(--color-gold-on-soft)]" /> Deposit
        </Link>
        <Link href="/withdrawals" className={secondaryCls}>
          <ArrowUpFromLine size={15} className="text-[var(--color-gold-on-soft)]" /> Withdraw
        </Link>
      </div>
    </Card>
  );
}
