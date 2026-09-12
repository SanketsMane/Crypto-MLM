'use client';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Landmark, Percent, Wallet,
} from 'lucide-react';
import { adminGet } from '@/lib/admin-api';
import { Card, CardHead, PageHeader, Table, Badge, Skeleton } from '@/components/ui/primitives';
import { StatCard } from '@/components/dashboard/stat-card';
import { usd, num, titleCase } from '@/lib/format';

/**
 * The operator's view of the money.
 *
 * Two questions, and they are not the same one: what do the ledgers say we owe,
 * and is the money actually there. A solvent-looking ledger sitting on an empty
 * gateway account is exactly the situation to find out about before a member
 * does — so liability and holdings are shown side by side, and neither is ever
 * inferred from the other.
 *
 * Gateway holdings are listed per coin and never summed. Adding BTC to USDT
 * needs a price, this page has no price, and a made-up total here would be the
 * one number nobody should trust.
 */

interface Summary {
  heldTotal: string;
  byWallet: { type: string; balance: string; accounts: number }[];
  depositsIn: string; depositCount: number;
  withdrawalsOut: string; withdrawalCount: number; feesCollected: string;
}

interface Provider {
  id: string;
  label: string;
  balances: { coin: string; amount: number }[];
  /** False when the account could not be read — never reported as zero. */
  readable: boolean;
  reason?: string;
  canCharge: boolean;
  canPay: boolean;
}

interface Treasury {
  providers: Provider[];
  gateways: {
    enabled: string[];
    pinned: string | null;
    reasons: string[];
    payoutRail: {
      rail: string;
      /** Configuration could not be resolved safely — nothing may be sent. */
      ambiguous: boolean;
      reason: string;
    };
  };
  liability: {
    memberBalances: string; approvedNotSent: string;
    pendingWithdrawalCount: number; total: string;
  };
  flows: {
    depositsIn: string; depositCount: number;
    withdrawalsOut: string; withdrawalsNetSent: string;
    withdrawalCount: number; feesCollected: string;
  };
  obligations: { capitalInvested: string; earningsCeiling: string; earningsPaid: string };
  byProvider: { provider: string | null; deposits: number; amount: string }[];
  wallets: { type: string; balance: string; locked: string }[];
}

const ROLE: Record<string, string> = {
  MAIN: 'Income and withdrawals',
  FUND: 'Deposits and purchases',
  DIGITAL: 'Digital assets',
};

export default function WalletPage() {
  const summary = useQuery({
    queryKey: ['admin', 'wallet-summary'],
    queryFn: () => adminGet<Summary>('/admin/wallet-summary'),
  });
  /**
   * Refetched on an interval, unlike the ledger figures.
   *
   * Gateway balances move without anything happening on this platform — a
   * member pays an invoice, a payout settles — so a figure read once at page
   * load goes stale while an operator is still looking at it.
   */
  const treasury = useQuery({
    queryKey: ['admin', 'treasury'],
    queryFn: () => adminGet<Treasury>('/admin/treasury'),
    refetchInterval: 60_000,
  });

  const t = treasury.data;
  const s = summary.data;
  const net = Number(s?.depositsIn ?? 0) - Number(s?.withdrawalsOut ?? 0);
  const accountsFor = (type: string) => s?.byWallet.find((w) => w.type === type)?.accounts;

  /* Treasury carries the locked column and is the newer source; the older
     summary stands in until it arrives so the table is never empty on a
     first paint. Normalised to one shape rather than left as a union. */
  const walletRows: { type: string; balance: string; locked: string }[] =
    t?.wallets ?? (s?.byWallet ?? []).map((w) => ({ type: w.type, balance: w.balance, locked: '0' }));

  return (
    <>
      <PageHeader
        title="Wallet & treasury"
        subtitle="What the platform owes, what the gateways are holding, and which rails are live."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Owed to Members" value={usd(t?.liability.total)} change={null}
                  icon={Wallet} chip="bg-violet-soft text-violet" loading={treasury.isLoading} />
        <StatCard label="Deposits In" value={usd(t?.flows.depositsIn ?? s?.depositsIn)} change={null}
                  icon={ArrowDownToLine} chip="bg-good-soft text-good" loading={treasury.isLoading} />
        <StatCard label="Withdrawals Out" value={usd(t?.flows.withdrawalsOut ?? s?.withdrawalsOut)} change={null}
                  icon={ArrowUpFromLine} chip="bg-bad-soft text-bad" loading={treasury.isLoading} />
        <StatCard label="Fees Collected" value={usd(t?.flows.feesCollected ?? s?.feesCollected)} change={null}
                  icon={Percent} chip="bg-warn-soft text-warn" loading={treasury.isLoading} />
      </div>

      <div className="mt-3.5 grid grid-cols-1 items-start gap-3.5 lg:grid-cols-12">
        {/* ── what is owed ──────────────────────────────────────────────── */}
        <div className="lg:col-span-5">
          <Card>
            <CardHead title="What we owe" subtitle="Everything a member could ask for right now." />
            <div className="space-y-2.5 px-5 pb-5">
              {treasury.isLoading ? <Skeleton className="h-[132px]" /> : (
                <>
                  <Row label="Credited member balances" value={usd(t?.liability.memberBalances)} />
                  {/* Approved-and-unsent has left the member's balance and not
                      yet left the platform. Counting only balances would
                      understate the obligation by exactly this figure. */}
                  <Row label={`Approved, not yet sent${t?.liability.pendingWithdrawalCount
                    ? ` (${num(t.liability.pendingWithdrawalCount)})` : ''}`}
                       value={usd(t?.liability.approvedNotSent)} />
                  <div className="flex items-baseline justify-between border-t border-line pt-2.5">
                    <span className="text-[12.5px] font-medium text-ink">Total liability</span>
                    <span className="text-[15px] font-semibold tabular-nums text-ink">
                      {usd(t?.liability.total)}
                    </span>
                  </div>
                </>
              )}
            </div>
          </Card>
        </div>

        {/* ── what is actually held ─────────────────────────────────────── */}
        <div className="lg:col-span-7">
          <Card>
            <CardHead title="What the gateways hold"
                      subtitle="Read live from each provider. Listed per coin, never converted." />
            <div className="space-y-2.5 px-5 pb-5">
              {treasury.isLoading ? <Skeleton className="h-[132px]" /> : (t?.providers ?? []).map((p) => (
                <div key={p.id} className="rounded-[10px] border border-line bg-canvas px-3.5 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold text-ink">{p.label}</span>
                    <span className="flex gap-1.5">
                      <Badge tone={p.canCharge ? 'good' : 'neutral'}>
                        {p.canCharge ? 'deposits on' : 'deposits off'}
                      </Badge>
                      <Badge tone={p.canPay ? 'good' : 'neutral'}>
                        {p.canPay ? 'payouts on' : 'payouts off'}
                      </Badge>
                    </span>
                  </div>

                  {/* An unreadable account says so. A zero here would be
                      indistinguishable from an empty one, and would make a
                      shortfall look like a balanced book. */}
                  {!p.readable ? (
                    <p className="mt-2 flex gap-2 rounded-[8px] bg-warn-soft px-2.5 py-2 text-[11.5px] leading-relaxed text-warn">
                      <AlertTriangle size={14} className="mt-px shrink-0" />
                      <span>Balance could not be read — {p.reason ?? 'no reason given'}</span>
                    </p>
                  ) : p.balances.length === 0 ? (
                    <p className="mt-1.5 text-[12px] text-ink-2">No balance held.</p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5">
                      {p.balances.map((b) => (
                        <span key={b.coin} className="text-[12.5px] text-ink-2">
                          <span className="font-semibold tabular-nums text-ink">
                            {b.amount.toLocaleString(undefined, { maximumFractionDigits: 8 })}
                          </span>{' '}
                          {b.coin.toUpperCase()}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* ── controls ──────────────────────────────────────────────────── */}
        <div className="lg:col-span-5">
          <Card>
            <CardHead title="Gateway controls"
                      subtitle="Set by environment, so a rail cannot be switched on by a stray click." />
            <div className="space-y-2.5 px-5 pb-5">
              {treasury.isLoading ? <Skeleton className="h-[112px]" /> : (
                <>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[12.5px] text-ink-2">Accepting deposits</span>
                    <span className="flex flex-wrap justify-end gap-1.5">
                      {(t?.gateways.enabled ?? []).length === 0
                        ? <Badge tone="bad">none</Badge>
                        : t!.gateways.enabled.map((g) => <Badge key={g} tone="good">{g}</Badge>)}
                    </span>
                  </div>
                  <Row label="Pinned provider"
                       value={t?.gateways.pinned ?? 'not pinned — members choose'} />
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[12.5px] text-ink-2">Payout rail</span>
                    {/* An ambiguous rail is not a cosmetic warning: nothing can
                        be sent until it is resolved, so it is flagged as a
                        state rather than shown as a name. */}
                    <Badge tone={t?.gateways.payoutRail.ambiguous ? 'bad' : 'good'}>
                      {t?.gateways.payoutRail.ambiguous
                        ? `${t.gateways.payoutRail.rail} — unresolved`
                        : titleCase(t?.gateways.payoutRail.rail ?? '—')}
                    </Badge>
                  </div>
                  {t?.gateways.payoutRail.reason && (
                    <p className="text-[11.5px] leading-relaxed text-ink-2">
                      {t.gateways.payoutRail.reason}
                    </p>
                  )}
                  {/* Why nothing is enabled, when nothing is. Otherwise an
                      operator is left guessing at which variable is missing. */}
                  {(t?.gateways.reasons ?? []).length > 0 && (
                    <ul className="space-y-1 rounded-[10px] bg-warn-soft px-3 py-2.5">
                      {t!.gateways.reasons.map((r) => (
                        <li key={r} className="flex gap-2 text-[11.5px] leading-relaxed text-warn">
                          <AlertTriangle size={13} className="mt-0.5 shrink-0" />{r}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          </Card>
        </div>

        {/* ── which checkout members pick ───────────────────────────────── */}
        <div className="lg:col-span-7">
          <Card>
            <CardHead title="Deposits by provider" subtitle="Paid deposits only, since the choice went live." />
            <Table
              head={['Provider', 'Deposits', 'Amount']}
              empty="No gateway deposits recorded yet."
              rows={(t?.byProvider ?? []).map((r) => [
                <span key="a" className="font-medium capitalize">{r.provider ?? 'unrecorded'}</span>,
                <span key="b" className="tabular-nums">{num(r.deposits)}</span>,
                <span key="c" className="font-medium tabular-nums">{usd(r.amount)}</span>,
              ])}
            />
          </Card>
        </div>
      </div>

      <Card className="mt-3.5">
        <CardHead title="Balances by wallet type" />
        <Table
          head={['Wallet', 'Role', 'Accounts', 'Available', 'Locked']}
          empty="No wallets yet."
          rows={walletRows.map((w) => [
            <span key="a" className="font-medium">{titleCase(w.type)}</span>,
            <span key="b" className="text-ink-2">{ROLE[w.type] ?? '—'}</span>,
            <span key="c" className="tabular-nums">
              {accountsFor(w.type) === undefined ? '—' : num(accountsFor(w.type)!)}
            </span>,
            <span key="d" className="font-medium tabular-nums">{usd(w.balance)}</span>,
            <span key="e" className="tabular-nums text-ink-2">{usd(w.locked)}</span>,
          ])}
        />
        <p className="border-t border-line px-4 py-3 text-[12.5px] text-ink-2">
          Net platform position:{' '}
          <span className={`font-semibold tabular-nums ${net >= 0 ? 'text-good' : 'text-bad'}`}>{usd(net)}</span>
          {' '}— deposits received less withdrawals paid.
        </p>
      </Card>

      <Card className="mt-3.5">
        <CardHead title="Future obligations"
                  subtitle="What active plans are contracted to pay out over their lifetime." />
        <div className="grid grid-cols-1 gap-3 px-5 pb-5 sm:grid-cols-3">
          {treasury.isLoading ? <Skeleton className="h-[64px] sm:col-span-3" /> : (
            <>
              <Figure icon={Landmark} label="Capital invested" value={usd(t?.obligations.capitalInvested)} />
              <Figure icon={ArrowUpFromLine} label="Earnings ceiling" value={usd(t?.obligations.earningsCeiling)} />
              <Figure icon={Percent} label="Earnings paid so far" value={usd(t?.obligations.earningsPaid)} />
            </>
          )}
        </div>
      </Card>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[12.5px] text-ink-2">{label}</span>
      <span className="text-[13px] font-medium tabular-nums capitalize text-ink">{value}</span>
    </div>
  );
}

function Figure(
  { icon: Icon, label, value }:
  { icon: typeof Landmark; label: string; value: string },
) {
  return (
    <div className="rounded-[10px] border border-line bg-canvas px-3.5 py-3">
      <p className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.04em] text-ink-2">
        <Icon size={13} /> {label}
      </p>
      <p className="mt-1 text-[16px] font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}
