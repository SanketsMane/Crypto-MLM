'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMoneyMutation } from '@/lib/money-mutation';
import { useWithdrawalTerms, payoutTiming, payoutScheduleLabel } from '@/features/config/use-config';
import { toast } from 'sonner';
import { toastError } from '@/lib/toast';
import Link from 'next/link';
import { AlertCircle, ArrowUpFromLine, Clock, ShieldAlert } from 'lucide-react';
import { get, post } from '@/lib/api';
import { Card, CardHead, Button, controlCls } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/modal';
import { usd, UNKNOWN } from '@/lib/format';
import { useStepUp, stepUpNeeded } from '@/features/auth/step-up';
import { WithdrawalHistory, type Row } from '@/features/withdrawals/history';

interface Wallets { wallets: { type: string; available: string }[] }
interface KycState { status: string }

/** Exactly what the server will charge — never recomputed here. */
interface Quote {
  amount: string; fee: string; feePercent: number;
  tax: string; taxPercent: number; net: string;
}

export default function WithdrawalsPage() {
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [review, setReview] = useState(false);

  const { confirm, dialog } = useStepUp();

  const w = useQuery({ queryKey: ['member', 'wallet'], queryFn: () => get<Wallets>('/wallet') });
  const list = useQuery({ queryKey: ['member', 'withdrawals'], queryFn: () => get<Row[]>('/withdrawals') });

  // Withdrawals are gated on verified identity. Saying so up front beats letting
  // a member fill in the form and then rejecting it.
  const kyc = useQuery({ queryKey: ['member', 'kyc'], queryFn: () => get<KycState>('/kyc') });
  const verified = kyc.data?.status === 'APPROVED';
  const underReview = kyc.data?.status === 'PENDING';

  const terms = useWithdrawalTerms();
  const available = Number(w.data?.wallets.find((x) => x.type === 'MAIN')?.available ?? 0);

  /**
   * The figures come from the server, not from arithmetic in this file.
   *
   * They used to be derived here in floating point and rounded half-up for
   * display, while the server derived them in exact decimal and rounded down.
   * Two implementations of one formula, and the member only ever saw this one —
   * so the number they agreed to was free to differ from the number that
   * settled. Debounced so it does not fire on every keystroke.
   */
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(amount), 250);
    return () => clearTimeout(t);
  }, [amount]);

  const n = Number(amount || 0);
  const quotable = Number(debounced) > 0;
  const quote = useQuery({
    queryKey: ['member', 'withdrawal-quote', debounced],
    queryFn: () => get<Quote>('/withdrawals/quote', { amount: debounced }),
    enabled: quotable,
    staleTime: 60_000,
  });

  // Only trust a quote that belongs to what is currently typed.
  const priced = quote.data && quote.data.amount === String(Number(debounced)) ? quote.data : null;
  const settled = priced !== null && debounced === amount;

  const create = useMoneyMutation({
    mutationFn: async (stepUpToken: string, key) =>
      post('/withdrawals', { amount, walletAddress }, key, stepUpToken),
    onSuccess: () => {
      toast.success(`Request submitted — paid ${payoutTiming(terms)}`);
      setAmount(''); setWalletAddress(''); setReview(false);
      qc.invalidateQueries({ queryKey: ['member'] });
    },
    onError: (e) => toastError(e),
  });

  const addressLooksRight = /^0x[a-fA-F0-9]{40}$/.test(walletAddress);
  const tooMuch = n > available;
  const valid =
    n >= terms.minimum && n <= terms.maximum && !tooMuch && addressLooksRight
    && settled && Number(priced?.net ?? 0) > 0;

  /**
   * Review, then re-authenticate, then send.
   *
   * The order matters. Showing the full destination address before asking for
   * the password means the member is confirming the thing they are about to
   * approve, rather than approving first and reading afterwards.
   */
  async function submit() {
    try {
      const token = await confirm({
        reason: `You are sending ${usd(priced!.net)} to ${walletAddress.slice(0, 10)}…${walletAddress.slice(-8)}.`,
      });
      create.mutate(token);
    } catch (err) {
      // Cancelling the dialog rejects — that is not an error worth a toast.
      if (err instanceof Error && err.message === 'cancelled') return;
      toastError(err);
    }
  }

  /** A retry when the server insists on the stronger factor for this amount. */
  useEffect(() => {
    const need = stepUpNeeded(create.error);
    if (!need || need !== 'totp') return;
    void (async () => {
      try {
        const token = await confirm({
          method: 'totp',
          reason: `${usd(n)} is above the limit a password can approve.`,
        });
        create.mutate(token);
      } catch { /* cancelled */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [create.error]);

  return (
    <>
      <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Card>
            <CardHead title="Request a withdrawal" />
            <form
              className="space-y-4 px-5 pb-5"
              onSubmit={(e) => { e.preventDefault(); if (valid) setReview(true); }}
            >
              {!terms.open && (
                <Notice tone="warn" title="Withdrawals are paused">
                  New requests are not being accepted right now. Anything already in the queue is
                  unaffected and will still be paid.
                </Notice>
              )}

              {!kyc.isLoading && !verified && (
                <Notice
                  tone="warn"
                  icon={<ShieldAlert size={15} className="mt-0.5 shrink-0 text-warn" />}
                  title={underReview ? 'Verification in review' : 'Verify your identity first'}
                >
                  {underReview
                    ? 'Your documents are being checked. Withdrawals open as soon as they are approved.'
                    : 'Withdrawals need a verified identity. It takes a few minutes and only needs doing once.'}
                  {!underReview && (
                    <Link href="/kyc" className="mt-1.5 block text-[12px] font-medium text-violet hover:underline">
                      Verify now →
                    </Link>
                  )}
                </Notice>
              )}

              <div>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <label htmlFor="wd-amount" className="text-[12.5px] font-medium text-ink">Amount (USDT)</label>
                  <button
                    type="button"
                    onClick={() => setAmount(String(Math.min(available, terms.maximum)))}
                    className="text-[11.5px] font-medium text-violet hover:underline"
                  >
                    Available {usd(available)}
                  </button>
                </div>
                <input
                  id="wd-amount" type="number" min={terms.minimum} max={terms.maximum} step="0.01"
                  required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00"
                  className={`${controlCls} h-12 w-full text-[16px]`}
                />
                <p className="mt-1.5 text-[11.5px] text-ink-2">
                  Minimum {usd(terms.minimum, 0)} · maximum {usd(terms.maximum, 0)} per request
                </p>
              </div>

              <div>
                <label htmlFor="wd-address" className="mb-1.5 block text-[12.5px] font-medium text-ink">
                  BEP-20 payout address
                </label>
                <input
                  id="wd-address" required value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value.trim())}
                  placeholder="0x…" spellCheck={false} autoComplete="off"
                  aria-describedby="wd-address-help"
                  className={`${controlCls} h-11 w-full font-mono text-[13px]`}
                />
                <p id="wd-address-help" className="mt-1.5 text-[11.5px] leading-relaxed text-ink-2">
                  Paste it from your wallet rather than typing it. A payment sent to the wrong
                  address cannot be recovered by anyone.
                </p>
              </div>

              <QuoteBreakdown
                amount={n}
                quote={priced}
                loading={quotable && (quote.isLoading || !settled)}
                network={terms.network}
              />

              {tooMuch && (
                <Notice tone="bad" title={`That is more than your available balance of ${usd(available)}.`} />
              )}

              <Button type="submit" className="h-12 w-full text-[14px]"
                      disabled={!valid || !verified || !terms.open}>
                <ArrowUpFromLine size={16} /> Review withdrawal
              </Button>

              <p className="flex gap-2 text-[11.5px] leading-relaxed text-ink-2">
                <Clock size={14} className="mt-0.5 shrink-0" />
                You can request at any time. Payouts are settled{' '}
                {payoutScheduleLabel(terms) ?? `within ${terms.slaHours} hours`}, in {terms.network} — this
                one is due {payoutTiming(terms)}. The amount leaves your Main wallet immediately and is
                returned in full if the request is rejected.
              </p>
            </form>
          </Card>
        </div>

        <div className="lg:col-span-5">
          <WithdrawalHistory rows={list.data ?? []} loading={list.isLoading} />
        </div>
      </div>

      <ReviewDialog
        open={review && priced !== null}
        onClose={() => setReview(false)}
        onConfirm={submit}
        pending={create.isPending}
        quote={priced}
        address={walletAddress}
        network={terms.network}
        timing={payoutTiming(terms)}
      />

      {dialog}
    </>
  );
}

/* ── the figures, as the server computes them ───────────────────────────── */

function QuoteBreakdown({
  amount, quote, loading, network,
}: {
  amount: number; quote: Quote | null; loading: boolean; network: string;
}) {
  if (amount <= 0) return null;

  return (
    <dl aria-live="polite" className="space-y-1.5 rounded-[10px] border border-line bg-canvas px-3.5 py-3 text-[12.5px]">
      <Line label="Requested" value={quote ? usd(quote.amount) : UNKNOWN} muted={loading} />
      <Line
        label={quote ? `Fee (${quote.feePercent}%)` : 'Fee'}
        value={quote ? `−${usd(quote.fee)}` : UNKNOWN}
        tone="bad"
        muted={loading}
      />
      {/* Only shown when a rate is set — a permanent "Withholding 0%" line is
          noise on every payout in a jurisdiction that does not withhold. */}
      {quote && quote.taxPercent > 0 && (
        <Line label={`Withholding (${quote.taxPercent}%)`} value={`−${usd(quote.tax)}`} tone="bad" muted={loading} />
      )}
      <div className="flex justify-between border-t border-line pt-1.5">
        <dt className="font-medium text-ink">You receive</dt>
        <dd className={`font-semibold tabular-nums ${loading ? 'text-ink-3' : 'text-good'}`}>
          {quote ? usd(quote.net) : UNKNOWN}
        </dd>
      </div>
      <p className="pt-0.5 text-[11px] text-ink-3">
        {loading ? 'Working out the exact figures…' : `Settled in ${network}. These are the exact amounts that will be recorded.`}
      </p>
    </dl>
  );
}

function Line({ label, value, tone, muted }: { label: string; value: string; tone?: 'bad'; muted?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className="text-ink-2">{label}</dt>
      <dd className={`tabular-nums ${muted ? 'text-ink-3' : tone === 'bad' ? 'text-bad' : 'text-ink'}`}>{value}</dd>
    </div>
  );
}

/* ── review before an irreversible transfer ─────────────────────────────── */

function ReviewDialog({
  open, onClose, onConfirm, pending, quote, address, network, timing,
}: {
  open: boolean; onClose: () => void; onConfirm: () => void; pending: boolean;
  quote: Quote | null; address: string; network: string; timing: string;
}) {
  if (!open || !quote) return null;

  return (
    <Modal
      open
      onClose={onClose}
      title="Check this before you send it"
      description="A payment sent to the wrong address cannot be reversed or recovered."
      width="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>Back</Button>
          <Button onClick={onConfirm} loading={pending}>Confirm and send</Button>
        </>
      }
    >
      <div className="space-y-4 pb-1">
        <div className="rounded-[11px] border border-line bg-canvas-2 p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3">Sending to</p>
          {/* Never truncated. Truncation is what hides a wrong character. */}
          <p className="mt-1.5 break-all font-mono text-[13.5px] leading-relaxed text-ink">{address}</p>
          <p className="mt-1.5 text-[11.5px] text-ink-2">{network} · check this against your wallet</p>
        </div>

        <dl className="space-y-1.5 rounded-[11px] border border-line bg-canvas-2 p-4 text-[13px]">
          <Line label="Requested" value={usd(quote.amount)} />
          <Line label={`Fee (${quote.feePercent}%)`} value={`−${usd(quote.fee)}`} tone="bad" />
          {quote.taxPercent > 0 && (
            <Line label={`Withholding (${quote.taxPercent}%)`} value={`−${usd(quote.tax)}`} tone="bad" />
          )}
          <div className="flex justify-between border-t border-line pt-2">
            <dt className="font-medium text-ink">You receive</dt>
            <dd className="text-[16px] font-semibold tabular-nums text-good">{usd(quote.net)}</dd>
          </div>
        </dl>

        <p className="text-[12px] leading-relaxed text-ink-2">
          {usd(quote.amount)} leaves your Main wallet as soon as you confirm, and is returned in full
          if the request is rejected. Payment arrives {timing}.
        </p>
      </div>
    </Modal>
  );
}

/* ── shared notice ──────────────────────────────────────────────────────── */

function Notice({
  tone, title, icon, children,
}: {
  tone: 'warn' | 'bad'; title: string; icon?: React.ReactNode; children?: React.ReactNode;
}) {
  const warn = tone === 'warn';
  return (
    <div className={`flex items-start gap-2.5 rounded-[10px] border px-3.5 py-3 ${
      warn ? 'border-warn/30 bg-warn-soft' : 'border-bad/30 bg-bad-soft'}`}>
      {icon ?? <AlertCircle size={15} className={`mt-0.5 shrink-0 ${warn ? 'text-warn' : 'text-bad'}`} />}
      <div className="min-w-0">
        <p className="text-[12.5px] font-medium text-ink">{title}</p>
        {children && <div className="mt-0.5 text-[12px] leading-relaxed text-ink-2">{children}</div>}
      </div>
    </div>
  );
}
