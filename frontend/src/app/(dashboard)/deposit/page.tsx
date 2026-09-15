'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMoneyMutation } from '../../../lib/money-mutation';
import { toast } from 'sonner';
import { toastError } from '@/lib/toast';
import { AlertCircle, ArrowDownToLine, Check, Copy, CreditCard, ExternalLink } from 'lucide-react';
import { get, post } from '@/lib/api';
import { usePlatformConfig } from '@/features/config/use-config';
import { Card, CardHead, Table, Badge, toneFor, Button, Skeleton, controlCls } from '@/components/ui/primitives';
import { usd, shortDate } from '@/lib/format';

interface Deposit {
  id: string; amount: string; network: string; txHash: string | null;
  reference: string; status: string; createdAt: string;
  /** Present only on gateway deposits, and only while they are still payable. */
  paymentUrl?: string | null;
  gatewayStatus?: string | null;
}

const QUICK = [110, 270, 530, 1100, 2650];

interface DepositTarget {
  configured: boolean;
  address: string | null;
  network: string;
  token: string;
  minimum: number | null;
  confirmations: number | null;
}

interface GatewayOption {
  id: string;
  label: string;
  sandbox: boolean;
}

/** What the server will actually accept right now, and through which provider. */
interface GatewayStatus {
  /** Every gateway that can take money at this moment. */
  providers: GatewayOption[];
  /** An operator pin, which removes the choice entirely. */
  pinned: string | null;
  chooseable: boolean;
  canCharge: boolean;
  provider: string | null;
  canPay: boolean;
  sandbox: boolean;
}

export default function DepositPage() {
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');
  const [txHash, setTxHash] = useState('');
  const [copied, setCopied] = useState(false);
  /**
   * Recording a transfer you already made is a different job from paying now,
   * and showing both forms at once invites someone to fill the wrong one. The
   * manual path stays one click away rather than on screen by default.
   */
  const [manualMode, setManualMode] = useState(false);
  /**
   * Nothing is pre-selected while more than one gateway is open.
   *
   * A default would decide for the member where their money goes, and the two
   * providers do not carry the same coins — choosing for them would land some
   * people on a checkout that cannot take what they actually hold.
   */
  const [provider, setProvider] = useState<string | null>(null);

  const gateway = useQuery<GatewayStatus>({
    queryKey: ['gateway-status'],
    queryFn: () => get('/gateway/status'),
  });

  /** The member's own on-chain address, or a clear "not configured" when off. */
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

  const canCharge = gateway.data?.canCharge === true;
  const providers = gateway.data?.providers ?? [];
  const chooseable = gateway.data?.chooseable === true;
  /**
   * The provider this deposit will actually go through.
   *
   * An operator pin beats anything the page could offer, and a lone gateway
   * needs no choosing — so the member's selection only counts when there is
   * genuinely something to select.
   */
  const chosen = gateway.data?.pinned ?? (providers.length === 1 ? providers[0]!.id : provider);
  const chosenOption = providers.find((p) => p.id === chosen) ?? null;

  /**
   * Raise a checkout invoice and send the member to pay it.
   *
   * The idempotency key comes from useMoneyMutation, so a double-submit or a
   * retry after a dropped connection reuses the same intent rather than leaving
   * a second unpaid invoice behind for an operator to explain.
   */
  const checkout = useMoneyMutation({
    mutationFn: (_: void, key) =>
      post<{ id: string; paymentUrl: string | null }>(
        '/gateway/deposit',
        { amount, ...(chosen ? { provider: chosen } : {}) },
        key,
      ),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['member'] });
      if (!d.paymentUrl) {
        // An invoice with no URL is nothing anyone can pay. Saying so beats a
        // blank tab and a deposit row that never resolves.
        toast.error('The checkout link did not come back. Please try again.');
        return;
      }
      setAmount('');
      window.location.href = d.paymentUrl;
    },
    onError: (e) => toastError(e),
  });

  const recordManual = useMoneyMutation({
    mutationFn: (_: void, key) => post('/deposits', { amount, ...(txHash ? { txHash } : {}) }, key),
    onSuccess: () => {
      toast.success('Deposit recorded — it will credit once confirmed');
      setAmount(''); setTxHash('');
      qc.invalidateQueries({ queryKey: ['member'] });
    },
    onError: (e) => toastError(e),
  });

  /* Submitting an amount with no provider is a 400 from the server, so the
     button stays down until the choice has been made rather than failing on
     submit and leaving the member to guess why. */
  const needsChoice = canCharge && !manualMode && chooseable && !chosen;
  const amountTooSmall = !amount || Number(amount) < (minimum || 0.01);
  const busy = checkout.isPending || recordManual.isPending;

  return (
    <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-12">
      <div className="lg:col-span-7">
        <Card>
          <CardHead title="New deposit" />
          <form
            className="space-y-4 px-3.5 pb-3.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (manualMode || !canCharge) recordManual.mutate();
              else checkout.mutate();
            }}
          >
            <div>
              <label className="mb-1.5 block text-[12.5px] font-medium text-ink">Amount (USDT)</label>
              <input type="number" min={minimum || 1} step="0.01" required value={amount}
                     onChange={(e) => setAmount(e.target.value)} placeholder="0.00"
                     className={`${controlCls} h-12 w-full text-[16px]`} />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {QUICK.map((q) => (
                  <button key={q} type="button" onClick={() => setAmount(String(q))}
                          className="rounded-full border border-line px-3 py-1 text-[12px] text-ink-2 transition hover:border-gold/40 hover:text-gold">
                    {usd(q, 0)}
                  </button>
                ))}
              </div>
            </div>

            {/* Two gateways, so the member picks. Rendered only when the choice
                is real — one provider, or an operator pin, leaves nothing to
                decide and a single-option radio group is just noise. */}
            {canCharge && !manualMode && chooseable && (
              <div>
                <label className="mb-1.5 block text-[12.5px] font-medium text-ink">Payment method</label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {providers.map((p) => {
                    const active = chosen === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setProvider(p.id)}
                        className={`rounded-[5px] border px-3 py-2.5 text-left transition ${
                          active
                            ? 'border-gold bg-gold/[0.06] ring-1 ring-gold/30'
                            : 'border-line hover:border-gold/40'
                        }`}
                      >
                        <span className="flex items-center justify-between gap-2 text-[13px] font-semibold text-ink">
                          {p.label}
                          {active && <Check size={14} className="shrink-0 text-gold" />}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-ink-2">
                          {p.sandbox ? 'Sandbox mode' : 'Pay in any supported coin'}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {needsChoice && (
                  <p className="mt-1.5 text-[11.5px] text-ink-2">
                    Choose a payment method to continue.
                  </p>
                )}
              </div>
            )}

            {/* The transaction hash only means anything when recording a transfer
                that has already happened. On the checkout path there is nothing
                to paste yet. */}
            {(manualMode || !canCharge) && (
              <div>
                <label className="mb-1.5 block text-[12.5px] font-medium text-ink">
                  Transaction hash <span className="font-normal text-ink-3">(optional — speeds up confirmation)</span>
                </label>
                <input value={txHash} onChange={(e) => setTxHash(e.target.value)} placeholder="0x…"
                       className={`${controlCls} h-11 w-full`} />
              </div>
            )}

            {gateway.isLoading ? (
              <Skeleton className="h-12" />
            ) : (
              <Button type="submit" className="h-12 w-full text-[14px]" loading={busy}
                      disabled={amountTooSmall || needsChoice}>
                {manualMode || !canCharge
                  ? (<><ArrowDownToLine size={16} /> Record deposit</>)
                  : (<><CreditCard size={16} /> Continue to payment</>)}
              </Button>
            )}

            {canCharge && (
              <button type="button" onClick={() => setManualMode((v) => !v)}
                      className="w-full text-center text-[12px] text-ink-2 underline-offset-2 hover:underline">
                {manualMode
                  ? 'Pay with the checkout instead'
                  : 'Already sent USDT yourself? Record it manually'}
              </button>
            )}
          </form>
        </Card>
      </div>

      <div className="space-y-3.5 lg:col-span-5">
        <Card>
          <CardHead title="How to fund" />
          <div className="space-y-3 px-3.5 pb-3.5">
            {canCharge && !manualMode ? (
              <>
                <p className="text-[12.5px] leading-relaxed text-ink-2">
                  Enter an amount and you will be taken to our payment provider, where you can pay in{' '}
                  <span className="font-semibold text-ink">any supported coin</span>. Your Fund wallet is
                  credited automatically once the payment confirms on the network.
                </p>
                <div className="rounded-[5px] border border-line bg-canvas px-3 py-2.5">
                  <p className="text-[10.5px] uppercase tracking-[0.04em] text-ink-2">Payment is handled by</p>
                  {/* Named only once it is settled. Before that it reads as the
                      pending choice, not as a provider already decided on. */}
                  <p className="mt-0.5 text-[13px] font-semibold text-ink">
                    {chosenOption
                      ? `${chosenOption.label}${chosenOption.sandbox ? ' (sandbox)' : ''}`
                      : 'Your selected payment provider'}
                  </p>
                </div>
                <p className="flex gap-2 rounded-[5px] bg-warn-soft px-3 py-2.5 text-[12px] leading-relaxed text-warn">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  Pay the exact amount shown at the checkout. An underpayment is held for review rather
                  than credited automatically.
                </p>
              </>
            ) : (
              <>
                <p className="text-[12.5px] leading-relaxed text-ink-2">
                  Send <span className="font-semibold text-ink">USDT on the BEP-20 network</span> to the platform
                  address, then record the amount here. Funds land in your Fund wallet once an operator confirms
                  the transaction on-chain.
                </p>

                <div className="rounded-[5px] border border-line bg-canvas px-3 py-2.5">
                  <p className="text-[10.5px] uppercase tracking-[0.04em] text-ink-2">Network</p>
                  <p className="mt-0.5 text-[13px] font-semibold text-ink">BEP-20 (Binance Smart Chain)</p>
                </div>

                {deposit.isLoading ? (
                  <Skeleton className="h-[70px]" />
                ) : deposit.data?.configured ? (
                  <div className="flex items-center gap-2 rounded-[5px] border border-line bg-canvas px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10.5px] uppercase tracking-[0.04em] text-ink-2">
                        Your deposit address
                      </p>
                      <p className="mt-0.5 break-all font-mono text-[12.5px] text-ink">
                        {deposit.data.address}
                      </p>
                    </div>
                    <button type="button" onClick={copyAddress}
                            className="shrink-0 rounded-[3px] p-1.5 text-ink-2 transition hover:bg-line/40 hover:text-ink"
                            title="Copy address">
                      {copied ? <Check size={15} className="text-good" /> : <Copy size={15} />}
                    </button>
                  </div>
                ) : (
                  /* No address is shown rather than a placeholder that looks like
                     one — funds sent to a fake address are gone for good. */
                  <div className="rounded-[5px] border border-line bg-canvas px-3 py-2.5">
                    <p className="text-[10.5px] uppercase tracking-[0.04em] text-ink-2">Deposit address</p>
                    <p className="mt-0.5 text-[12.5px] text-ink-2">
                      {canCharge
                        ? 'On-chain deposits are not switched on. Use the checkout instead.'
                        : 'Automatic deposits are not switched on yet. Contact support to fund your account.'}
                    </p>
                  </div>
                )}

                <p className="flex gap-2 rounded-[5px] bg-warn-soft px-3 py-2.5 text-[12px] leading-relaxed text-warn">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  Only send USDT on BEP-20. Funds sent on another network cannot be recovered.
                  {deposit.data?.configured && deposit.data.confirmations
                    ? ` Deposits are credited automatically after ${deposit.data.confirmations} confirmations.`
                    : ''}
                </p>
              </>
            )}
          </div>
        </Card>
      </div>

      <div className="lg:col-span-12">
        <Card>
          <CardHead title={`Deposit history — ${list.data?.length ?? 0}`} />
          <Table
            head={['Date', 'Amount', 'Network', 'Transaction', 'Status', '']}
            empty="You have not made a deposit yet."
            rows={(list.data ?? []).map((d) => [
              <span key="a" className="text-ink-2">{shortDate(d.createdAt)}</span>,
              <span key="b" className="font-semibold tabular-nums">{usd(d.amount)}</span>,
              d.network,
              <span key="d" className="text-ink-2">{d.txHash ? `${d.txHash.slice(0, 14)}…` : '—'}</span>,
              <Badge key="e" tone={toneFor(d.status)}>{d.status}</Badge>,
              /* A pending invoice keeps its checkout link, so someone who closed
                 the tab can finish paying instead of starting again and leaving
                 a second unpaid row behind. */
              d.status === 'PENDING' && d.paymentUrl ? (
                <a key="f" href={d.paymentUrl} target="_blank" rel="noopener noreferrer"
                   className="inline-flex items-center gap-1 font-medium text-gold hover:underline">
                  Pay <ExternalLink size={12} />
                </a>
              ) : <span key="f" />,
            ])}
          />
        </Card>
      </div>
    </div>
  );
}
