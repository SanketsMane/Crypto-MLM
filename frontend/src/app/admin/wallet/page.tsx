'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { clsx } from 'clsx';
import {
  AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Landmark, Percent, Wallet,
} from 'lucide-react';
import { adminGet, adminPut } from '@/lib/admin-api';
import { toastError } from '@/lib/toast';
import { useConfirmOk } from '@/components/ui/confirm';
import { useAdmin } from '@/features/admin/use-admin';
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

/**
 * One switchable rail.
 *
 * `configured` and `on` are separate because "off" is not one state. A rail
 * with no key installed cannot be switched on from here at all, and a toggle
 * that silently does nothing is worse than no toggle — so the two are reported
 * apart and rendered differently.
 */
interface Switch {
  key: string;
  on: boolean;
  configured: boolean;
}

interface GatewayControl {
  id: string;
  deposits: Switch;
  /** Null where the integration has no payout support at all. */
  payouts: Switch | null;
}

interface Treasury {
  providers: Provider[];
  gateways: {
    enabled: string[];
    pinned: string | null;
    reasons: string[];
    controls: GatewayControl[];
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
  const qc = useQueryClient();
  const askConfirm = useConfirmOk();
  /* Gated on the permission the API actually enforces for the write, not on
     the one that let them open this page — a reports-only operator can read
     the treasury and must not be handed switches that 403 on click. */
  const { can } = useAdmin();
  const maySwitch = can('settings.edit');

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

  /**
   * The switches write straight through to the settings endpoint.
   *
   * No staged "save" step: this is the control an operator reaches for when a
   * gateway is misbehaving and money is moving the wrong way, and a second
   * click between them and stopping it is a second too many. Both queries are
   * invalidated afterwards, because turning a rail off changes what the rest of
   * this page is reporting.
   */
  const flip = useMutation({
    mutationFn: ({ key, on }: { key: string; on: boolean; label: string }) =>
      adminPut(`/admin/settings/${key}`, { value: String(on) }),
    onSuccess: (_d, v) => {
      toast.success(`${v.label} ${v.on ? 'switched on' : 'switched off'} — live immediately`);
      qc.invalidateQueries({ queryKey: ['admin', 'treasury'] });
      qc.invalidateQueries({ queryKey: ['admin', 'settings'] });
    },
    onError: (e) => toastError(e),
  });

  /**
   * Confirmation is asked for only where the consequence is not on screen.
   *
   * Turning a rail back on restores service and needs no ceremony. Turning one
   * of two deposit gateways off is reversible and members keep the other. The
   * two cases worth stopping for are the ones whose blast radius is invisible
   * from the toggle itself: taking away the LAST checkout, which stops deposits
   * platform-wide, and stopping payouts, which leaves approvals to be paid by
   * hand without anything on this page saying so.
   */
  const toggle = async (sw: Switch, label: string, kind: 'deposits' | 'payouts') => {
    const next = !sw.on;
    if (!next) {
      const lastCheckout = kind === 'deposits' && (t?.gateways.enabled.length ?? 0) <= 1;
      const body = lastCheckout
        ? `${label} is the only checkout members can currently use. Switching it off stops all deposits platform-wide until you switch one back on. Invoices already raised stay payable.`
        : kind === 'payouts'
          ? `Approved withdrawals will stop being sent automatically and will need paying by hand. Nothing already in flight is cancelled, and approvals continue.`
          : `${label} will no longer be offered at checkout. Invoices already raised stay payable and still credit when they confirm.`;

      if (!(await askConfirm({
        title: `Switch off ${label}?`,
        body,
        confirmLabel: 'Switch off',
        tone: lastCheckout || kind === 'payouts' ? 'danger' : 'primary',
      }))) return;
    }
    flip.mutate({ key: sw.key, on: next, label });
  };
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
            <CardHead title="Gateways"
                      subtitle="Switch a rail on or off, and see what each provider is holding. Balances are listed per coin, never converted." />
            <div className="space-y-2.5 px-5 pb-5">
              {treasury.isLoading ? <Skeleton className="h-[132px]" /> : (t?.providers ?? []).map((p) => {
                const ctl = t?.gateways.controls.find((c) => c.id === p.id);
                return (
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

                  {/* The controls, beside the thing they control. */}
                  {ctl && (
                    <div className="mt-2.5 space-y-1.5 border-t border-line pt-2.5">
                      <SwitchRow
                        label="Deposits"
                        hint="Offered to members at checkout"
                        sw={ctl.deposits}
                        busy={flip.isPending}
                        editable={maySwitch}
                        onToggle={() => toggle(ctl.deposits, `${p.label} deposits`, 'deposits')}
                      />
                      {ctl.payouts ? (
                        <SwitchRow
                          label="Payouts"
                          hint="Sends approved withdrawals automatically"
                          sw={ctl.payouts}
                          busy={flip.isPending}
                          editable={maySwitch}
                          onToggle={() => toggle(ctl.payouts!, `${p.label} payouts`, 'payouts')}
                        />
                      ) : (
                        /* Stated rather than shown as a dead toggle: there is no
                           payout support for this provider in the platform, so a
                           switch here would promise something that cannot happen. */
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-[12px] text-ink-2">Payouts</span>
                          <span className="text-[11.5px] text-ink-2">Not supported by this integration</span>
                        </div>
                      )}
                    </div>
                  )}

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
                );
              })}
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

/**
 * One rail's on/off control.
 *
 * An unconfigured rail gets no switch at all, only the reason it has none.
 * Rendering a disabled toggle would invite an operator to click it and
 * conclude the console is broken, when what is actually missing is a key in
 * the deployment they cannot set from here.
 */
function SwitchRow(
  { label, hint, sw, busy, editable, onToggle }:
  { label: string; hint: string; sw: Switch; busy: boolean; editable: boolean; onToggle: () => void },
) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-[12px] font-medium text-ink">{label}</span>
        <span className="block text-[11px] text-ink-2">
          {sw.configured ? hint : 'No credentials installed — set them in the deployment first'}
        </span>
      </span>

      {!editable ? (
        /* Read-only: the state still matters to anyone looking at this page,
           it is just not theirs to change. */
        <Badge tone={sw.on ? 'good' : 'neutral'}>{sw.on ? 'on' : 'off'}</Badge>
      ) : sw.configured ? (
        <button
          type="button"
          role="switch"
          aria-checked={sw.on}
          aria-label={`${label} ${sw.on ? 'on' : 'off'}`}
          disabled={busy}
          onClick={onToggle}
          className={clsx(
            'relative h-6 w-11 shrink-0 rounded-full border transition disabled:opacity-50',
            sw.on ? 'border-good bg-good' : 'border-line bg-line/50',
          )}
        >
          <span className={clsx(
            'absolute top-[2px] h-[18px] w-[18px] rounded-full bg-card shadow-sm transition-all',
            sw.on ? 'left-[22px]' : 'left-[2px]',
          )} />
        </button>
      ) : (
        <Badge tone="neutral">unavailable</Badge>
      )}
    </div>
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
