'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMoneyMutation } from '../../../lib/money-mutation';
import { toast } from 'sonner';
import { toastError } from '@/lib/toast';
import { AlertCircle, ArrowDownToLine, Check, Copy } from 'lucide-react';
import { get, post, apiErrorMessage } from '@/lib/api';
import { usePlatformConfig } from '@/features/config/use-config';
import { Card, CardHead, Table, Badge, toneFor, Button, Skeleton, controlCls } from '@/components/ui/primitives';
import { usd, shortDate } from '@/lib/format';

interface Deposit { id: string; amount: string; network: string; txHash: string | null; reference: string; status: string; createdAt: string }

const QUICK = [110, 270, 530, 1100, 2650];

interface DepositTarget {
  configured: boolean;
  address: string | null;
  network: string;
  token: string;
  minimum: number | null;
  confirmations: number | null;
}

export default function DepositPage() {
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');
  const [txHash, setTxHash] = useState('');
  const [copied, setCopied] = useState(false);

  /** The member's own address, or a clear "not configured" when it is off. */
  const deposit = useQuery<DepositTarget>({
    queryKey: ['deposit-address'],
    queryFn: () => get('/deposits/address'),
  });

  const copyAddress = async () => {
    if (!deposit.data?.address) return;
    await navigator.clipboard.writeText(deposit.data.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const cfg = usePlatformConfig();
  const minimum = cfg.data?.investment.minimum ?? 0;

  const list = useQuery({ queryKey: ['member', 'deposits'], queryFn: () => get<Deposit[]>('/deposits') });

  const create = useMoneyMutation({
    mutationFn: (_: void, key) => post('/deposits', { amount, ...(txHash ? { txHash } : {}) }, key),
    onSuccess: () => {
      toast.success('Deposit submitted — it will credit once confirmed');
      setAmount(''); setTxHash('');
      qc.invalidateQueries({ queryKey: ['member'] });
    },
    onError: (e) => toastError(e),
  });

  return (
    <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-12">
      <div className="lg:col-span-7">
        <Card>
          <CardHead title="New deposit" />
          <form className="space-y-4 px-5 pb-5"
                onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
            <div>
              <label className="mb-1.5 block text-[12.5px] font-medium text-ink">Amount (USDT)</label>
              <input type="number" min={minimum || 1} step="0.01" required value={amount}
                     onChange={(e) => setAmount(e.target.value)} placeholder="0.00"
                     className={`${controlCls} h-12 w-full text-[16px]`} />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {QUICK.map((q) => (
                  <button key={q} type="button" onClick={() => setAmount(String(q))}
                          className="rounded-full border border-line px-3 py-1 text-[12px] text-ink-2 transition hover:border-violet/40 hover:text-violet">
                    {usd(q, 0)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-[12.5px] font-medium text-ink">
                Transaction hash <span className="font-normal text-ink-3">(optional — speeds up confirmation)</span>
              </label>
              <input value={txHash} onChange={(e) => setTxHash(e.target.value)} placeholder="0x…"
                     className={`${controlCls} h-11 w-full`} />
            </div>

            <Button type="submit" className="h-12 w-full text-[14px]" loading={create.isPending}
                    disabled={!amount || Number(amount) < (minimum || 0.01)}>
              <ArrowDownToLine size={16} /> Submit deposit
            </Button>
          </form>
        </Card>
      </div>

      <div className="space-y-3.5 lg:col-span-5">
        <Card>
          <CardHead title="How to fund" />
          <div className="space-y-3 px-5 pb-5">
            <p className="text-[12.5px] leading-relaxed text-ink-2">
              Send <span className="font-semibold text-ink">USDT on the BEP-20 network</span> to the platform
              address, then record the amount here. Funds land in your Fund wallet once an operator confirms
              the transaction on-chain.
            </p>

            <div className="rounded-[10px] border border-line bg-canvas px-3 py-2.5">
              <p className="text-[10.5px] uppercase tracking-[0.04em] text-ink-2">Network</p>
              <p className="mt-0.5 text-[13px] font-semibold text-ink">BEP-20 (Binance Smart Chain)</p>
            </div>

            {deposit.isLoading ? (
              <Skeleton className="h-[70px]" />
            ) : deposit.data?.configured ? (
              <div className="flex items-center gap-2 rounded-[10px] border border-line bg-canvas px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[10.5px] uppercase tracking-[0.04em] text-ink-2">
                    Your deposit address
                  </p>
                  <p className="mt-0.5 break-all font-mono text-[12.5px] text-ink">
                    {deposit.data.address}
                  </p>
                </div>
                <button type="button" onClick={copyAddress}
                        className="shrink-0 rounded-md p-1.5 text-ink-2 transition hover:bg-line/40 hover:text-ink"
                        title="Copy address">
                  {copied ? <Check size={15} className="text-good" /> : <Copy size={15} />}
                </button>
              </div>
            ) : (
              /* No address is shown rather than a placeholder that looks like
                 one — funds sent to a fake address are gone for good. */
              <div className="rounded-[10px] border border-line bg-canvas px-3 py-2.5">
                <p className="text-[10.5px] uppercase tracking-[0.04em] text-ink-2">Deposit address</p>
                <p className="mt-0.5 text-[12.5px] text-ink-2">
                  Automatic deposits are not switched on yet. Contact support to fund your account.
                </p>
              </div>
            )}

            <p className="flex gap-2 rounded-[10px] bg-warn-soft px-3 py-2.5 text-[12px] leading-relaxed text-warn">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              Only send USDT on BEP-20. Funds sent on another network cannot be recovered.
              {deposit.data?.configured && deposit.data.confirmations
                ? ` Deposits are credited automatically after ${deposit.data.confirmations} confirmations.`
                : ''}
            </p>
          </div>
        </Card>
      </div>

      <div className="lg:col-span-12">
        <Card>
          <CardHead title={`Deposit history — ${list.data?.length ?? 0}`} />
          <Table
            head={['Date', 'Amount', 'Network', 'Transaction', 'Status']}
            empty="You have not made a deposit yet."
            rows={(list.data ?? []).map((d) => [
              <span key="a" className="text-ink-2">{shortDate(d.createdAt)}</span>,
              <span key="b" className="font-semibold tabular-nums">{usd(d.amount)}</span>,
              d.network,
              <span key="d" className="text-ink-2">{d.txHash ? `${d.txHash.slice(0, 14)}…` : '—'}</span>,
              <Badge key="e" tone={toneFor(d.status)}>{d.status}</Badge>,
            ])}
          />
        </Card>
      </div>
    </div>
  );
}
