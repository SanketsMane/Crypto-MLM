'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMoneyMutation } from '../../../lib/money-mutation';
import { useWithdrawalTerms } from '@/features/config/use-config';
import { toast } from 'sonner';
import { toastError } from '@/lib/toast';
import Link from 'next/link';
import { AlertCircle, ArrowUpFromLine, Clock, ShieldAlert } from 'lucide-react';
import { get, post, apiErrorMessage } from '@/lib/api';
import { Card, CardHead, Table, Badge, toneFor, Button, controlCls } from '@/components/ui/primitives';
import { usd, shortDate } from '@/lib/format';

interface Row {
  id: string; amount: string; fee: string; netAmount: string; walletAddress: string;
  status: string; slaDueAt: string; rejectReason: string | null; createdAt: string;
}
interface Wallets { wallets: { type: string; available: string }[] }
interface KycState { status: string }

export default function WithdrawalsPage() {
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');
  const [walletAddress, setWalletAddress] = useState('');

  const w = useQuery({ queryKey: ['member', 'wallet'], queryFn: () => get<Wallets>('/wallet') });
  const list = useQuery({ queryKey: ['member', 'withdrawals'], queryFn: () => get<Row[]>('/withdrawals') });

  // Withdrawals are gated on verified identity. Saying so up front beats letting
  // a member fill in the form and then rejecting it.
  const kyc = useQuery({ queryKey: ['member', 'kyc'], queryFn: () => get<KycState>('/kyc') });
  const verified = kyc.data?.status === 'APPROVED';
  const underReview = kyc.data?.status === 'PENDING';

  const create = useMoneyMutation({
    mutationFn: (_: void, key) => post('/withdrawals', { amount, walletAddress }, key),
    onSuccess: () => {
      toast.success(`Request submitted — processed within ${terms.slaHours} hours`);
      setAmount(''); qc.invalidateQueries({ queryKey: ['member'] });
    },
    onError: (e) => toastError(e),
  });

  /**
   * The terms come from the platform, not from a constant in this file.
   *
   * They used to be hardcoded here, which meant an operator changing the fee
   * left this form quoting the old one — and then the server charged the new
   * one. The member saw a number that never arrived.
   */
  const terms = useWithdrawalTerms();

  const available = Number(w.data?.wallets.find((x) => x.type === 'MAIN')?.available ?? 0);
  const n = Number(amount || 0);
  const fee = (n * terms.feePercent) / 100;
  // Withholding applies after the fee, exactly as the server computes it.
  const tax = terms.taxPercent > 0 ? ((n - fee) * terms.taxPercent) / 100 : 0;
  const net = n - fee - tax;

  const tooMuch = n > available;
  const valid = n >= terms.minimum && n <= terms.maximum && !tooMuch && net > 0
    && /^0x[a-fA-F0-9]{40}$/.test(walletAddress);

  return (
    <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-12">
      <div className="lg:col-span-7">
        <Card>
          <CardHead title="Request a withdrawal" />
          <form className="space-y-4 px-5 pb-5" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
            {!terms.open && (
              <div className="flex items-start gap-2.5 rounded-[10px] border border-warn/30 bg-warn-soft px-3.5 py-3">
                <AlertCircle size={15} className="mt-0.5 shrink-0 text-warn" />
                <div className="min-w-0">
                  <p className="text-[12.5px] font-medium text-ink">Withdrawals are paused</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-ink-2">
                    New requests are not being accepted right now. Anything already in the queue is
                    unaffected and will still be paid.
                  </p>
                </div>
              </div>
            )}

            {!kyc.isLoading && !verified && (
              <div className="flex items-start gap-2.5 rounded-[10px] border border-warn/30 bg-warn-soft px-3.5 py-3">
                <ShieldAlert size={15} className="mt-0.5 shrink-0 text-warn" />
                <div className="min-w-0">
                  <p className="text-[12.5px] font-medium text-ink">
                    {underReview ? 'Verification in review' : 'Verify your identity first'}
                  </p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-ink-2">
                    {underReview
                      ? 'Your documents are being checked. Withdrawals open as soon as they are approved.'
                      : 'Withdrawals need a verified identity. It takes a few minutes and only needs doing once.'}
                  </p>
                  {!underReview && (
                    <Link href="/kyc"
                          className="mt-1.5 inline-block text-[12px] font-medium text-violet hover:underline">
                      Verify now →
                    </Link>
                  )}
                </div>
              </div>
            )}

            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <label className="text-[12.5px] font-medium text-ink">Amount (USDT)</label>
                <button type="button" onClick={() => setAmount(String(Math.min(available, terms.maximum)))}
                        className="text-[11.5px] font-medium text-violet hover:underline">
                  Available {usd(available)}
                </button>
              </div>
              <input type="number" min={terms.minimum} max={terms.maximum} step="0.01" required value={amount}
                     onChange={(e) => setAmount(e.target.value)} placeholder="0.00"
                     className={`${controlCls} h-12 w-full text-[16px]`} />
              <p className="mt-1.5 text-[11.5px] text-ink-2">
                Minimum {usd(terms.minimum, 0)} · maximum {usd(terms.maximum, 0)} per request
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-[12.5px] font-medium text-ink">BEP-20 payout address</label>
              <input required value={walletAddress} onChange={(e) => setWalletAddress(e.target.value)}
                     placeholder="0x…" pattern="^0x[a-fA-F0-9]{40}$"
                     className={`${controlCls} h-11 w-full`} />
            </div>

            {n > 0 && (
              <dl className="space-y-1.5 rounded-[10px] border border-line bg-canvas px-3.5 py-3 text-[12.5px]">
                <div className="flex justify-between"><dt className="text-ink-2">Requested</dt><dd className="tabular-nums text-ink">{usd(n)}</dd></div>
                <div className="flex justify-between">
                  <dt className="text-ink-2">Fee ({terms.feePercent}%)</dt>
                  <dd className="tabular-nums text-bad">−{usd(fee)}</dd>
                </div>
                {/* Only shown when a rate is set — a permanent "Tax 0%" line is
                    noise on every payout in a jurisdiction that does not withhold. */}
                {terms.taxPercent > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-ink-2">Withholding ({terms.taxPercent}%)</dt>
                    <dd className="tabular-nums text-bad">−{usd(tax)}</dd>
                  </div>
                )}
                <div className="flex justify-between border-t border-line pt-1.5">
                  <dt className="font-medium text-ink">You receive</dt>
                  <dd className="font-semibold tabular-nums text-good">{usd(net)}</dd>
                </div>
              </dl>
            )}

            {tooMuch && (
              <p className="flex gap-2 rounded-[10px] bg-bad-soft px-3 py-2.5 text-[12px] text-bad">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                That is more than your available balance of {usd(available)}.
              </p>
            )}

            <Button type="submit" className="h-12 w-full text-[14px]" loading={create.isPending}
                    disabled={!valid || !verified || !terms.open}>
              <ArrowUpFromLine size={16} /> Request withdrawal
            </Button>

            <p className="flex gap-2 text-[11.5px] leading-relaxed text-ink-2">
              <Clock size={14} className="mt-0.5 shrink-0" />
              Requests are reviewed and paid within {terms.slaHours} hours, in {terms.network}. The amount
              leaves your Main wallet immediately and is returned in full if the request is rejected.
            </p>
          </form>
        </Card>
      </div>

      <div className="lg:col-span-5">
        <Card>
          <CardHead title={`History — ${list.data?.length ?? 0}`} />
          <Table
            head={['Date', 'Amount', 'You receive', 'Status']}
            empty="No withdrawals yet."
            rows={(list.data ?? []).map((r) => [
              <span key="a" className="text-ink-2">{shortDate(r.createdAt)}</span>,
              <span key="b" className="font-semibold tabular-nums">{usd(r.amount)}</span>,
              <span key="c" className="tabular-nums text-good">{usd(r.netAmount)}</span>,
              <Badge key="d" tone={toneFor(r.status)}>{r.status}</Badge>,
            ])}
          />
        </Card>
      </div>
    </div>
  );
}
