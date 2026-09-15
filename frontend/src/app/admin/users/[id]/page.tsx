'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMoneyMutation } from '@/lib/money-mutation';
import { toast } from 'sonner';
import { Eye } from 'lucide-react';
import { toastError } from '@/lib/toast';
import { adminGet, adminPost, adminPatch, adminError } from '@/lib/admin-api';
import { Panel, Metric, Table, Badge, toneFor, Button, PageHeader, controlCls } from '@/components/ui/primitives';
import { ActionDialog } from '@/components/ui/dialog';
import { usd, shortDate, titleCase } from '@/lib/format';
import { rankLabel } from '@/lib/rank';
import { usePlatformConfig } from '@/features/config/use-config';

interface Detail {
  profile: {
    id: string; userCode: string; email: string; phone: string | null; name: string;
    status: string; affiliateMode: string; walletAddress: string | null;
    totalInvested: string; totalEarned: string; directCount: number; activeDirectCount: number;
    depth: number; rank: { code: string; name: string; level: number } | null;
    sponsor: { userCode: string; email: string } | null;
    lastLoginAt: string | null; createdAt: string;
  };
  capping: { limit: string; earned: string; remaining: string; isCapped: boolean };
  team: { totalTeamBusiness: string; powerLegVolume: string; otherLegsVolume: string; teamSize: number };
  wallets: { type: string; balance: string; locked: string }[];
  investments: { id: string; package: string; amount: string; capLimit: string; totalEarned: string; status: string; startedAt: string }[];
  ledger: { id: string; wallet: string; direction: string; category: string; amount: string; balanceAfter: string; description: string | null; createdAt: string }[];
  commissions: { id: string; kind: string; level: number; from: string; percent: string; baseAmount: string; paidAmount: string; createdAt: string }[];
  ranks: { rank: string; rankLevel: number; reward: string; achievedAt: string }[];
  directs: { userCode: string; email: string; status: string; totalInvested: string; createdAt: string }[];
}

export default function AdminUserDetail() {
  /* Read, not hard-coded — see the note on the users list. */
  const cfgQ = usePlatformConfig();
  const capPassive = cfgQ.data?.returns.capPassivePercent ?? 200;
  const capActive = cfgQ.data?.returns.capActivePercent ?? 300;
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [wallet, setWallet] = useState('MAIN');
  const [direction, setDirection] = useState('CREDIT');

  const { data, isLoading } = useQuery({ queryKey: ['admin', 'user', id], queryFn: () => adminGet<Detail>(`/admin/users/${id}`) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'user', id] });

  const [supportReason, setSupportReason] = useState('');
  const [supportOpen, setSupportOpen] = useState(false);

  /**
   * Opens the member's own view in a new tab.
   *
   * The returned session is read-only — the server refuses anything that would
   * change state on it — so this is genuinely "see what they see" and not
   * "act as them".
   */
  const supportView = useMutation({
    mutationFn: () => adminPost<{ accessToken: string; refreshToken: string }>(
      `/admin/users/${id}/impersonate`, { reason: supportReason }),
    onSuccess: (d) => {
      // Handed over through sessionStorage rather than the URL: an access token
      // in a query string ends up in browser history and proxy logs.
      sessionStorage.setItem('fx_support_view', JSON.stringify(d));
      setSupportOpen(false);
      setSupportReason('');
      window.open('/dashboard?support-view=1', '_blank', 'noopener');
    },
    onError: (e) => toastError(e),
  });

  const adjust = useMoneyMutation({
    mutationFn: (_: void, key) =>
      adminPost(`/admin/users/${id}/adjust`, { walletType: wallet, direction, amount, reason }, key),
    onSuccess: () => { toast.success('Adjustment posted to the ledger'); setAmount(''); setReason(''); refresh(); },
    onError: (e) => toastError(e),
  });
  const setStatus = useMutation({
    mutationFn: (status: string) => adminPatch(`/admin/users/${id}/status`, { status }),
    onSuccess: () => { toast.success('Status updated'); refresh(); },
    onError: (e) => toastError(e),
  });
  const setMode = useMutation({
    mutationFn: (affiliateMode: string) => adminPatch(`/admin/users/${id}/affiliate-mode`, { affiliateMode }),
    onSuccess: () => { toast.success('Cap mode updated'); refresh(); },
    onError: (e) => toastError(e),
  });
  const [resetting, setResetting] = useState(false);

  const resetPassword = useMutation({
    mutationFn: (password: string) => adminPost(`/admin/users/${id}/reset-password`, { password }),
    onSuccess: () => { toast.success('Password reset — share it over a channel you trust'); setResetting(false); },
    onError: (e) => toastError(e),
  });

  const recalc = useMutation({
    mutationFn: () => adminPost(`/admin/users/${id}/recalculate-team`),
    onSuccess: () => { toast.success('Team volume recalculated'); refresh(); },
    onError: (e) => toastError(e),
  });

  if (isLoading || !data) return <p className="text-sm text-ink-2">Loading…</p>;
  const p = data.profile;
  const capPct = Number(data.capping.limit) > 0
    ? Math.min(100, (Number(data.capping.earned) / Number(data.capping.limit)) * 100) : 0;
  const input = controlCls;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]">{p.name || p.userCode}</h1>
          <p className="text-[12.5px] text-ink-2">
            {p.userCode} · {p.email} · joined {shortDate(p.createdAt)}
            {p.sponsor && <> · sponsor {p.sponsor.userCode}</>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={toneFor(p.status)}>{p.status}</Badge>
          <Badge tone={p.affiliateMode === 'ACTIVE' ? 'info' : 'neutral'}>cap {p.affiliateMode === 'ACTIVE' ? `${capActive}%` : `${capPassive}%`}</Badge>
          {p.rank && <Badge tone="good">{rankLabel(p.rank.level)}</Badge>}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Invested" value={usd(p.totalInvested)} />
        <Metric label="Earned" value={usd(p.totalEarned)} tone="good" />
        <Metric label="Team business" value={usd(data.team.totalTeamBusiness)} hint={`${data.team.teamSize} members`} />
        <Metric label="Directs" value={p.directCount} hint={`${p.activeDirectCount} active`} />
      </div>

      <Panel title="Cap position">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-ink-2">{usd(data.capping.earned)} of {usd(data.capping.limit)}</span>
          <span className="font-mono tabular-nums">{capPct.toFixed(1)}%</span>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-line-soft">
          <div className={`h-full rounded-full ${data.capping.isCapped ? 'bg-bad' : 'bg-violet'}`} style={{ width: `${capPct}%` }} />
        </div>
        <p className="mt-2 text-xs text-ink-2">
          {data.capping.isCapped ? 'Capped out — no further income will credit until a top-up.' : `${usd(data.capping.remaining)} of headroom remaining.`}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {data.wallets.map((w) => (
            <div key={w.type} className="rounded-lg border border-line bg-canvas p-3">
              <p className="font-mono text-[10px] uppercase tracking-widest text-ink-2">{w.type}</p>
              <p className="mt-1 font-mono text-lg tabular-nums">{usd(w.balance)}</p>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Operator actions">
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-medium text-ink-2">Manual balance adjustment</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <select value={wallet} onChange={(e) => setWallet(e.target.value)} className={input}>
                  {['MAIN', 'FUND', 'DIGITAL'].map((w) => <option key={w}>{w}</option>)}
                </select>
                <select value={direction} onChange={(e) => setDirection(e.target.value)} className={input}>
                  <option value="CREDIT">Credit</option><option value="DEBIT">Debit</option>
                </select>
                <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" className={input} />
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" className={input} />
              </div>
              <Button className="mt-2 w-full" loading={adjust.isPending}
                      disabled={!amount || reason.trim().length < 3}
                      onClick={() => adjust.mutate()}>
                Post adjustment
              </Button>
              <p className="mt-1.5 text-[11px] text-ink-2">
                Posts a normal ledger entry — it obeys the same atomicity and audit rules as any other movement.
              </p>
            </div>

            <div className="border-t border-line pt-4">
              <p className="mb-2 text-xs font-medium text-ink-2">Support view</p>
              {supportOpen ? (
                <div className="space-y-2">
                  <input
                    value={supportReason}
                    onChange={(e) => setSupportReason(e.target.value)}
                    placeholder="Why are you opening this account?"
                    className={input}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button className="px-3 py-1.5 text-xs" loading={supportView.isPending}
                            disabled={supportReason.trim().length < 5}
                            onClick={() => supportView.mutate()}>
                      Open their view
                    </Button>
                    <Button variant="ghost" className="px-3 py-1.5 text-xs"
                            onClick={() => { setSupportOpen(false); setSupportReason(''); }}>
                      Cancel
                    </Button>
                  </div>
                  <p className="text-[11px] leading-relaxed text-ink-2">
                    Read-only, expires in 30 minutes, and the member is told it happened. Use it to
                    see what they see — not to act for them.
                  </p>
                </div>
              ) : (
                <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => setSupportOpen(true)}>
                  <Eye size={13} /> See what this member sees
                </Button>
              )}
            </div>

            <div className="border-t border-line pt-4">
              <p className="mb-2 text-xs font-medium text-ink-2">Account controls</p>
              <div className="flex flex-wrap gap-2">
                {['ACTIVE', 'SUSPENDED', 'BLOCKED'].map((s) => (
                  <Button key={s} variant={s === p.status ? 'primary' : 'ghost'} className="px-3 py-1.5 text-xs"
                          onClick={() => setStatus.mutate(s)}>{s}</Button>
                ))}
                <Button variant="ghost" className="px-3 py-1.5 text-xs"
                        onClick={() => setMode.mutate(p.affiliateMode === 'ACTIVE' ? 'PASSIVE' : 'ACTIVE')}>
                  Switch to {p.affiliateMode === 'ACTIVE' ? `${capPassive}%` : `${capActive}%`} cap
                </Button>
                <Button variant="ghost" className="px-3 py-1.5 text-xs" loading={recalc.isPending}
                        onClick={() => recalc.mutate()}>Recalculate team</Button>
                <Button variant="ghost" className="px-3 py-1.5 text-xs"
                        onClick={() => setResetting(true)}>Reset password</Button>
              </div>
            </div>
          </div>
        </Panel>

        <Panel title="Team">
          <Table head={['Metric', 'Value']} rows={[
            ['Total team business', <span key="a" className="font-mono tabular-nums">{usd(data.team.totalTeamBusiness)}</span>],
            ['Power leg (max 50%)', <span key="b" className="font-mono tabular-nums">{usd(data.team.powerLegVolume)}</span>],
            ['Other legs (min 50%)', <span key="c" className="font-mono tabular-nums">{usd(data.team.otherLegsVolume)}</span>],
            ['Team size', <span key="d" className="font-mono tabular-nums">{data.team.teamSize}</span>],
            ['Depth in tree', <span key="e" className="font-mono tabular-nums">{p.depth}</span>],
          ]} />
        </Panel>
      </div>

      <Panel title={`Investments — ${data.investments.length}`}>
        <Table head={['Package', 'Amount', 'Cap limit', 'Earned', 'Status', 'Started']}
          rows={data.investments.map((i) => [
            i.package,
            <span key="a" className="font-mono tabular-nums">{usd(i.amount)}</span>,
            <span key="b" className="font-mono tabular-nums">{usd(i.capLimit)}</span>,
            <span key="c" className="font-mono tabular-nums">{usd(i.totalEarned)}</span>,
            <Badge key="d" tone={toneFor(i.status)}>{i.status}</Badge>,
            <span key="e" className="font-mono text-xs">{shortDate(i.startedAt)}</span>,
          ])} empty="No investments." />
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={`Commissions earned — ${data.commissions.length}`}>
          <Table head={['Kind', 'L', 'From', '%', 'Base', 'Paid']}
            rows={data.commissions.slice(0, 12).map((c) => [
              <Badge key="a" tone={c.kind === 'DIRECT' ? 'info' : 'neutral'}>{c.kind}</Badge>,
              <span key="b" className="font-mono tabular-nums">{c.level}</span>,
              <span key="c" className="font-mono text-xs">{c.from}</span>,
              <span key="d" className="font-mono tabular-nums">{c.percent}%</span>,
              <span key="e" className="font-mono tabular-nums">{usd(c.baseAmount)}</span>,
              <span key="f" className="font-mono tabular-nums text-good">{usd(c.paidAmount)}</span>,
            ])} empty="No commissions." />
        </Panel>

        <Panel title={`Direct referrals — ${data.directs.length}`}>
          <Table head={['User', 'Status', 'Invested', 'Joined']}
            rows={data.directs.map((d) => [
              <span key="a" className="font-mono text-xs">{d.userCode}</span>,
              <Badge key="b" tone={toneFor(d.status)}>{d.status}</Badge>,
              <span key="c" className="font-mono tabular-nums">{usd(d.totalInvested)}</span>,
              <span key="d" className="font-mono text-xs">{shortDate(d.createdAt)}</span>,
            ])} empty="No direct referrals." />
        </Panel>
      </div>

      <Panel title={`Ledger — last ${data.ledger.length} entries`}>
        <Table head={['Date', 'Wallet', 'Category', 'Amount', 'Balance after', 'Description']}
          rows={data.ledger.map((l) => [
            <span key="a" className="font-mono text-xs">{shortDate(l.createdAt)}</span>,
            <span key="b" className="font-mono text-xs">{l.wallet}</span>,
            titleCase(l.category),
            <span key="d" className={`font-mono tabular-nums ${l.direction === 'CREDIT' ? 'text-good' : 'text-bad'}`}>
              {l.direction === 'CREDIT' ? '+' : '−'}{usd(l.amount)}
            </span>,
            <span key="e" className="font-mono tabular-nums">{usd(l.balanceAfter)}</span>,
            <span key="f" className="text-xs text-ink-2">{l.description ?? '—'}</span>,
          ])} empty="No ledger entries." />
      </Panel>
      <ActionDialog
        open={resetting}
        onClose={() => setResetting(false)}
        pending={resetPassword.isPending}
        tone="danger"
        title={`Reset the password for ${p.userCode}?`}
        body="The member's current password stops working immediately. Send the new one over a channel you trust and ask them to change it after signing in."
        confirmLabel="Reset password"
        fields={[{
          name: 'password', label: 'New password', required: true, minLength: 8,
          placeholder: 'at least 8 characters',
          help: 'Not stored in the audit log — only the fact that you reset it.',
        }]}
        onConfirm={(v) => resetPassword.mutate(v.password)}
      />
    </div>
  );
}
