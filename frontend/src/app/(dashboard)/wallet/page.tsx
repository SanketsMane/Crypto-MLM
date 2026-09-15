'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMoneyMutation } from '../../../lib/money-mutation';
import { toast } from 'sonner';
import { toastError } from '@/lib/toast';
import { AlertTriangle } from 'lucide-react';
import { get, post, apiErrorMessage } from '@/lib/api';
import { Button, Label } from '@/components/ui/primitives';
import { WalletSummaryCard, WalletSummarySkeleton } from '@/components/wallet/wallet-summary-card';
import { MoveFundsCard } from '@/components/wallet/move-funds-card';
import { WalletActivity, type LedgerEntry } from '@/components/wallet/wallet-activity';
import { WalletFeatureStrip } from '@/components/wallet/wallet-feature-strip';
import { byWalletOrder } from '@/components/wallet/wallet-meta';
import { usd, pct } from '@/lib/format';

/**
 * Wallet.
 *
 * Rebuilt, not restyled. What the page used to do: open with a 150px navy
 * masthead repeating the nav item the member had just clicked, then three
 * gradient tiles, then a transfer form in a four-column well beside an
 * eight-column ledger — which left roughly 900px of empty card under the form
 * on any real screen, because the form is short and the ledger is long.
 *
 * Three changes:
 *
 * 1. The masthead states the one figure it was not stating: the total across
 *    all three balances. "How much do I have" is the question the page is
 *    opened to answer, and it was the one number that had to be worked out by
 *    adding up three tiles.
 * 2. Cap headroom appears here. `/wallet` has always returned it and the page
 *    has always thrown it away — but the ceiling is what decides how much more
 *    can ever arrive in Main, which makes it a fact about this page.
 * 3. The form no longer stretches. It sits at its natural height with the
 *    terms strip beneath it, so the column carries two real things instead of
 *    one thing and a void.
 */

interface Wallets {
  wallets: { type: string; balance: string; locked: string; available: string }[];
  capping: { limit: string; earned: string; remaining: string; isCapped: boolean; usedPercent: number };
}
interface Ledger { total: number; entries: LedgerEntry[] }

export default function WalletPage() {
  const qc = useQueryClient();
  const [from, setFrom] = useState('FUND');
  const [to, setTo] = useState('MAIN');
  const [amount, setAmount] = useState('');

  const w = useQuery({ queryKey: ['member', 'wallet'], queryFn: () => get<Wallets>('/wallet') });
  const l = useQuery({ queryKey: ['member', 'wallet-ledger'], queryFn: () => get<Ledger>('/wallet/ledger', { take: 25 }) });

  const transfer = useMoneyMutation({
    mutationFn: (_: void, key) => post('/wallet/transfer', { from, to, amount }, key),
    onSuccess: () => { toast.success('Transfer complete'); setAmount(''); qc.invalidateQueries({ queryKey: ['member'] }); },
    onError: (e) => toastError(e),
  });

  const wallets = byWalletOrder(w.data?.wallets ?? []);
  const combined = wallets.reduce((sum, x) => sum + Number(x.balance ?? 0), 0);

  const cap = w.data?.capping;
  /* A ceiling of zero is not a ceiling that has been reached — it is a member
     who has not bought a package yet. Same distinction the dashboard draws. */
  const hasCeiling = Number(cap?.limit ?? 0) > 0;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <Label>Combined balance · USDT</Label>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="text-[30px] font-semibold leading-none tracking-[-0.03em] text-ink tabular-nums">
              {w.isLoading ? '—' : usd(combined)}
            </span>
            <span className="text-[11.5px] text-ink-3">across your three wallets</span>
          </div>
        </div>

        {/* The bound on everything that can still arrive in Main. */}
        {hasCeiling && (
          <div className="shrink-0 text-right">
            <Label>Earnings headroom</Label>
            <div className="mt-1.5 flex items-baseline justify-end gap-2">
              <span className="text-[19px] font-semibold leading-none tracking-[-0.02em] text-ink tabular-nums">
                {usd(cap?.remaining)}
              </span>
              <span className="text-[10.5px] text-ink-3 tabular-nums">
                {pct(cap?.usedPercent ?? 0)} of {usd(cap?.limit)} used
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {w.isLoading
          ? Array.from({ length: 3 }, (_, i) => <WalletSummarySkeleton key={i} />)
          : wallets.map((x) => (
              <WalletSummaryCard key={x.type} type={x.type} balance={x.balance} locked={x.locked} />
            ))}
      </div>

      {/* §29: a failed balances call must not leave the page blank. */}
      {w.isError && (
        <div role="alert" className="mt-2.5 flex flex-wrap items-center justify-between gap-3 rounded-[5px] border border-line bg-card p-3.5">
          <div className="flex min-w-0 items-start gap-2.5">
            <AlertTriangle size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-bad" />
            <div className="min-w-0">
              <p className="text-[12.5px] font-semibold text-ink">Could not load your balances</p>
              <p className="mt-0.5 text-[11.5px] text-ink-3">{apiErrorMessage(w.error)}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => w.refetch()} loading={w.isFetching}>Try again</Button>
        </div>
      )}

      {/* `items-start` is the fix for the dead column: without it the grid
          stretches the short form to the height of the long ledger. */}
      <div className="mt-2.5 grid grid-cols-1 items-start gap-2.5 lg:grid-cols-12">
        <div className="flex flex-col gap-2.5 lg:col-span-4">
          <MoveFundsCard
            from={from} to={to} amount={amount}
            onFrom={setFrom} onTo={setTo} onAmount={setAmount}
            onSubmit={() => transfer.mutate()}
            pending={transfer.isPending}
          />
          <WalletFeatureStrip />
        </div>
        <div className="lg:col-span-8">
          <WalletActivity entries={l.data?.entries ?? []} loading={l.isLoading} />
        </div>
      </div>
    </>
  );
}
