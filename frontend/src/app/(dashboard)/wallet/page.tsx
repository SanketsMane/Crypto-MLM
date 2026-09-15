'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMoneyMutation } from '../../../lib/money-mutation';
import { toast } from 'sonner';
import { toastError } from '@/lib/toast';
import { AlertTriangle } from 'lucide-react';
import { get, post, apiErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/primitives';
import { WalletSummaryCard, WalletSummarySkeleton } from '@/components/wallet/wallet-summary-card';
import { MoveFundsCard } from '@/components/wallet/move-funds-card';
import { WalletActivity, type LedgerEntry } from '@/components/wallet/wallet-activity';
import { WalletFeatureStrip } from '@/components/wallet/wallet-feature-strip';
import { byWalletOrder } from '@/components/wallet/wallet-meta';

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

  return (
    <>
      {/* The hero and the three balances are navy in both themes — they are
          brand objects, like the sidebar. The transfer form and the ledger
          below stay themed so the page still belongs to the app in light mode
          and the form matches every other form in the product. */}
      <section className="wallet-hero overflow-hidden px-5 py-7 sm:px-8 sm:py-9">
        <h1 className="text-[30px] font-bold leading-tight tracking-[-0.03em] text-[#F8FAFC] sm:text-[36px]">
          Wallet
        </h1>
        <p className="mt-2 max-w-[46ch] text-[14.5px] leading-relaxed text-[#94A3B8] sm:text-[15.5px]">
          Your three balances and how value moves between them.
        </p>
      </section>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {w.isLoading
          ? Array.from({ length: 3 }, (_, i) => <WalletSummarySkeleton key={i} />)
          : wallets.map((x) => (
              <WalletSummaryCard key={x.type} type={x.type} balance={x.balance} locked={x.locked} />
            ))}
      </div>

      {/* §29: a failed balances call must not leave the page blank. */}
      {w.isError && (
        <div role="alert" className="dash-card mt-4 flex flex-wrap items-center justify-between gap-3 p-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-[5px] bg-bad-soft text-bad">
              <AlertTriangle size={17} strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold text-ink">Could not load your balances</p>
              <p className="mt-0.5 text-[12.5px] text-ink-2">{apiErrorMessage(w.error)}</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => w.refetch()} loading={w.isFetching}>Try again</Button>
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <MoveFundsCard
            from={from} to={to} amount={amount}
            onFrom={setFrom} onTo={setTo} onAmount={setAmount}
            onSubmit={() => transfer.mutate()}
            pending={transfer.isPending}
          />
        </div>
        <div className="lg:col-span-8">
          <WalletActivity entries={l.data?.entries ?? []} loading={l.isLoading} />
        </div>
      </div>

      <div className="mt-5">
        <WalletFeatureStrip />
      </div>
    </>
  );
}
