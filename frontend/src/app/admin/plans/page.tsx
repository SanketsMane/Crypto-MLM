'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { toastError } from '@/lib/toast';
import { clsx } from 'clsx';
import { Plus } from 'lucide-react';
import { adminGet, adminPost, adminPut, adminPatch, adminError } from '@/lib/admin-api';
import { Card, CardHead, PageHeader, Table, Badge, Button, Skeleton, controlCls } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/modal';
import { ActionDialog } from '@/components/ui/dialog';
import { usd, num, shortDate } from '@/lib/format';

interface Pkg { id: string; name: string; amount: string; dailyRoiPercent: string; capPercent: string; sortOrder: number; isActive: boolean }
interface Rule { id: string; kind: string; level: number; percent: string; requiredDirects: number; requiredTeamVolume: string; isActive: boolean }
interface Rank { id: string; code: string; name: string; level: number; selfCapital: string; teamBusiness: string; reward: string; isActive: boolean }
interface Tier { id: string; track: string; destination: string; selfRequirement: string; teamRequirement: string }
interface Award { id: string; userCode: string; email: string; track: string; destination: string; status: string; notes: string | null; achievedAt: string; fulfilledAt: string | null }
interface Achievement { id: string; userCode: string; rank: string; reward: string; achievedAt: string }

const cell =
  'w-24 rounded-[7px] border border-field-line bg-field px-2 py-1.5 text-right text-[12.5px] tabular-nums text-ink ' +
  'outline-none transition focus:border-gold focus:ring-4 focus:ring-gold/15';

/** Small inline on/off used in the plan tables. */
function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch" aria-checked={on} aria-label={label}
      onClick={() => onChange(!on)}
      className={clsx('relative h-5 w-9 shrink-0 rounded-full transition-colors',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/25',
        on ? 'bg-gold' : 'bg-line-strong')}
    >
      <span className={clsx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
        on ? 'left-0.5 translate-x-4' : 'left-0.5')} />
    </button>
  );
}

interface RewardTier {
  id: string; name: string; threshold: string; bonusPercent: string;
  maxBonus: string; isActive: boolean;
}

const EMPTY_REWARD = { name: '', threshold: '', bonusPercent: '', maxBonus: '' };

const EMPTY_PKG = { name: '', amount: '', dailyRoiPercent: '0.5', capPercent: '250', sortOrder: '0', isActive: true };

export default function PlansPage() {
  const qc = useQueryClient();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [pkgForm, setPkgForm] = useState<(typeof EMPTY_PKG & { id?: string }) | null>(null);
  const [rewardForm, setRewardForm] = useState<(typeof EMPTY_REWARD & { id?: string }) | null>(null);
  const [fulfil, setFulfil] = useState<Award | null>(null);
  const key = (kind: string, level: number) => `${kind}-${level}`;

  const packages = useQuery({ queryKey: ['admin', 'packages'], queryFn: () => adminGet<Pkg[]>('/admin/packages') });
  const rewardTiers = useQuery({
    queryKey: ['admin', 'reward-tiers'],
    queryFn: () => adminGet<RewardTier[]>('/admin/reward-tiers'),
  });

  const saveRewardTier = useMutation({
    mutationFn: (t: typeof EMPTY_REWARD & { id?: string }) => adminPost('/admin/reward-tiers', t),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'reward-tiers'] });
      setRewardForm(null);
      toast.success('Reward tier saved');
    },
    onError: (e) => toastError(e),
  });
  const rules = useQuery({ queryKey: ['admin', 'rules'], queryFn: () => adminGet<Rule[]>('/admin/commission-rules') });
  const ranks = useQuery({ queryKey: ['admin', 'ranks'], queryFn: () => adminGet<Rank[]>('/admin/ranks') });
  const tiers = useQuery({ queryKey: ['admin', 'tiers'], queryFn: () => adminGet<Tier[]>('/admin/roaming-tiers') });
  const awards = useQuery({
    queryKey: ['admin', 'roaming-awards'],
    queryFn: () => adminGet<{ total: number; pending: number; rows: Award[] }>('/admin/roaming-awards', { take: 50 }),
  });
  const achievements = useQuery({
    queryKey: ['admin', 'rank-achievements'],
    queryFn: () => adminGet<{ total: number; rewarded: string; rows: Achievement[] }>('/admin/rank-achievements', { take: 25 }),
  });

  const refresh = (k: string) => qc.invalidateQueries({ queryKey: ['admin', k] });
  const fail = (e: unknown) => toastError(e);

  const savePackage = useMutation({
    mutationFn: (p: typeof EMPTY_PKG & { id?: string }) => adminPost('/admin/packages', {
      ...(p.id ? { id: p.id } : {}),
      name: p.name, amount: p.amount, dailyRoiPercent: p.dailyRoiPercent,
      capPercent: p.capPercent, sortOrder: Number(p.sortOrder) || 0, isActive: p.isActive,
    }),
    onSuccess: (_d, p) => { toast.success(p.id ? 'Package updated' : 'Package created'); setPkgForm(null); refresh('packages'); },
    onError: fail,
  });
  const togglePackage = useMutation({
    mutationFn: (p: Pkg) => adminPost('/admin/packages', {
      id: p.id, name: p.name, amount: p.amount, dailyRoiPercent: p.dailyRoiPercent,
      capPercent: p.capPercent, sortOrder: p.sortOrder, isActive: !p.isActive,
    }),
    onSuccess: (_d, p) => { toast.success(p.isActive ? 'Package retired' : 'Package activated'); refresh('packages'); },
    onError: fail,
  });

  const saveRule = useMutation({
    mutationFn: (r: Rule) => adminPut('/admin/commission-rules', {
      kind: r.kind, level: r.level,
      percent: edits[key(r.kind, r.level)] ?? r.percent,
      requiredDirects: Number(edits[`${key(r.kind, r.level)}-directs`] ?? r.requiredDirects),
      requiredTeamVolume: edits[`${key(r.kind, r.level)}-volume`] ?? r.requiredTeamVolume,
      isActive: r.isActive,
    }),
    onSuccess: () => { toast.success('Commission rule updated — applies to the next payout run'); refresh('rules'); },
    onError: fail,
  });
  const toggleRule = useMutation({
    mutationFn: (r: Rule) => adminPut('/admin/commission-rules', { kind: r.kind, level: r.level, percent: r.percent, isActive: !r.isActive }),
    onSuccess: () => { toast.success('Level updated'); refresh('rules'); },
    onError: fail,
  });

  const saveRank = useMutation({
    mutationFn: (r: Rank) => adminPatch(`/admin/ranks/${r.id}`, {
      selfCapital: edits[`rank-${r.id}-self`] ?? r.selfCapital,
      teamBusiness: edits[`rank-${r.id}-team`] ?? r.teamBusiness,
      reward: edits[`rank-${r.id}-reward`] ?? r.reward,
    }),
    onSuccess: () => { toast.success('Rank updated'); refresh('ranks'); },
    onError: fail,
  });
  const toggleRank = useMutation({
    mutationFn: (r: Rank) => adminPatch(`/admin/ranks/${r.id}`, { isActive: !r.isActive }),
    onSuccess: () => { toast.success('Rank updated'); refresh('ranks'); },
    onError: fail,
  });

  const fulfilAward = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) => adminPost(`/admin/roaming-awards/${id}/fulfil`, { notes }),
    onSuccess: () => { toast.success('Award marked fulfilled'); setFulfil(null); refresh('roaming-awards'); },
    onError: fail,
  });

  const direct = (rules.data ?? []).filter((r) => r.kind === 'DIRECT');
  const generation = (rules.data ?? []).filter((r) => r.kind === 'GENERATION');
  const set = (k: string, v: string) => setEdits((s) => ({ ...s, [k]: v }));

  return (
    <>
      <PageHeader
        title="Plans"
        subtitle="Investment tiers, commission levels, ranks and Roaming Club. The plan is data — edits apply on the next payout run and every change is audited."
      />

      {/* ── packages ─────────────────────────────────────────────────── */}
      <Card>
        <CardHead
          title={`Investment packages — ${num(packages.data?.length ?? 0)}`}
          action={<Button size="sm" onClick={() => setPkgForm({ ...EMPTY_PKG })}><Plus size={14} /> New package</Button>}
        />
        <Table
          head={['Plan', 'Amount', 'Daily return', 'Earn limit', 'Order', 'Active', '']}
          empty="No packages configured. Create the first one to open the platform for purchases."
          rows={(packages.data ?? []).map((p) => [
            <span key="a" className="font-medium">{p.name}</span>,
            <span key="b" className="font-medium tabular-nums">{usd(p.amount, 0)}</span>,
            <span key="c" className="tabular-nums">{p.dailyRoiPercent}%</span>,
            <span key="d" className="tabular-nums text-ink-2">{p.capPercent}%</span>,
            <span key="e" className="tabular-nums text-ink-3">{p.sortOrder}</span>,
            <Toggle key="f" on={p.isActive} label={`Toggle ${p.name}`} onChange={() => togglePackage.mutate(p)} />,
            <Button key="g" size="sm" variant="outline"
                    onClick={() => setPkgForm({
                      id: p.id, name: p.name, amount: p.amount, dailyRoiPercent: p.dailyRoiPercent,
                      capPercent: p.capPercent, sortOrder: String(p.sortOrder), isActive: p.isActive,
                    })}>Edit</Button>,
          ])}
        />
      </Card>

      <div className="mt-3.5 grid grid-cols-1 items-start gap-3.5 lg:grid-cols-2">
        {/* ── direct bonus ───────────────────────────────────────────── */}
        <Card>
          <CardHead title="Direct sponsor bonus" />
          <Table
            head={['Level', 'Percent', 'Active', '']}
            empty="Not configured."
            rows={direct.map((r) => [
              <span key="a" className="font-medium tabular-nums">Level {r.level}</span>,
              <input key="b" className={cell} defaultValue={r.percent}
                     onChange={(e) => set(key(r.kind, r.level), e.target.value)} />,
              <Toggle key="c" on={r.isActive} label={`Toggle direct level ${r.level}`} onChange={() => toggleRule.mutate(r)} />,
              <Button key="d" size="sm" variant="outline" onClick={() => saveRule.mutate(r)}>Save</Button>,
            ])}
          />
        </Card>

        {/* ── ranks ──────────────────────────────────────────────────── */}
        <Card>
          <CardHead title="Executive ranks" />
          <Table
            head={['Rank', 'Self capital', 'Team business', 'Reward', 'Active', '']}
            empty="Not configured."
            rows={(ranks.data ?? []).map((r) => [
              <span key="a" className="font-medium">{r.name}</span>,
              <input key="b" className={cell} defaultValue={r.selfCapital}
                     onChange={(e) => set(`rank-${r.id}-self`, e.target.value)} />,
              <input key="c" className={cell} defaultValue={r.teamBusiness}
                     onChange={(e) => set(`rank-${r.id}-team`, e.target.value)} />,
              <input key="d" className={cell} defaultValue={r.reward}
                     onChange={(e) => set(`rank-${r.id}-reward`, e.target.value)} />,
              <Toggle key="e" on={r.isActive} label={`Toggle ${r.name}`} onChange={() => toggleRank.mutate(r)} />,
              <Button key="f" size="sm" variant="outline" onClick={() => saveRank.mutate(r)}>Save</Button>,
            ])}
          />
        </Card>
      </div>

      {/* ── generation bonus ─────────────────────────────────────────── */}
      <Card className="mt-3.5">
        <CardHead title={`Generation bonus — ${num(generation.length)} levels`} />
        <Table
          head={['Level', 'Percent', 'Directs required', 'Team volume required', 'Active', '']}
          empty="Not configured."
          rows={generation.map((r) => [
            <span key="a" className="font-medium tabular-nums">Level {r.level}</span>,
            <input key="b" className={cell} defaultValue={r.percent}
                   onChange={(e) => set(key(r.kind, r.level), e.target.value)} />,
            <input key="c" className={cell} defaultValue={String(r.requiredDirects)}
                   onChange={(e) => set(`${key(r.kind, r.level)}-directs`, e.target.value)} />,
            <input key="d" className={cell} defaultValue={r.requiredTeamVolume}
                   onChange={(e) => set(`${key(r.kind, r.level)}-volume`, e.target.value)} />,
            <Toggle key="e" on={r.isActive} label={`Toggle generation level ${r.level}`} onChange={() => toggleRule.mutate(r)} />,
            <Button key="f" size="sm" variant="outline" onClick={() => saveRule.mutate(r)}>Save</Button>,
          ])}
        />
      </Card>

      {/* ── reward tiers: the scratch-card milestones ─────────────────── */}
      <Card className="mt-3.5">
        <CardHead
          title={`Reward tiers — ${num(rewardTiers.data?.length ?? 0)}`}
          subtitle="Milestones that unlock a bonus card. Cards already issued keep their original amount, so retuning a tier never rewrites what a member is holding."
          right={
            <Button size="sm" variant="outline"
                    onClick={() => setRewardForm(rewardForm ? null : { ...EMPTY_REWARD })}>
              {rewardForm ? 'Cancel' : 'Add tier'}
            </Button>
          }
        />

        {rewardForm && (
          <form
            className="grid gap-2 border-b border-line px-5 pb-4 sm:grid-cols-5"
            onSubmit={(e) => { e.preventDefault(); saveRewardTier.mutate(rewardForm); }}
          >
            {([
              ['name', 'Name', 'text', 'Elite Card'],
              ['threshold', 'Unlocks at', 'decimal', '500'],
              ['bonusPercent', 'Bonus %', 'decimal', '1'],
              ['maxBonus', 'Max bonus', 'decimal', '50'],
            ] as const).map(([field, label, mode, placeholder]) => (
              <label key={field} className="block">
                <span className="mb-1 block text-[11px] font-medium text-ink-2">{label}</span>
                <input
                  value={rewardForm[field]}
                  inputMode={mode === 'decimal' ? 'decimal' : 'text'}
                  placeholder={placeholder}
                  onChange={(e) => setRewardForm({ ...rewardForm, [field]: e.target.value })}
                  className={`${controlCls} h-9 w-full text-[13px]`}
                />
              </label>
            ))}
            <div className="flex items-end">
              <Button type="submit" size="sm" className="w-full" loading={saveRewardTier.isPending}
                      disabled={!rewardForm.name.trim() || !Number(rewardForm.threshold) || !Number(rewardForm.bonusPercent) || !Number(rewardForm.maxBonus)}>
                Save
              </Button>
            </div>
          </form>
        )}

        <Table
          head={['Tier', 'Unlocks at', 'Bonus', 'Capped at', 'Status', '']}
          empty="No reward tiers configured. Members see nothing on the Rewards page until at least one exists."
          rows={(rewardTiers.data ?? []).map((t) => [
            <span key="n" className="font-medium">{t.name}</span>,
            <span key="t" className="tabular-nums">{usd(Number(t.threshold), 0)}</span>,
            <span key="p" className="tabular-nums">{Number(t.bonusPercent)}%</span>,
            <span key="m" className="tabular-nums text-ink-2">{usd(Number(t.maxBonus), 0)}</span>,
            <Badge key="s" tone={t.isActive ? 'good' : 'neutral'}>{t.isActive ? 'Active' : 'Off'}</Badge>,
            <Button key="e" size="sm" variant="ghost" onClick={() => setRewardForm({
              id: t.id, name: t.name, threshold: String(t.threshold),
              bonusPercent: String(t.bonusPercent), maxBonus: String(t.maxBonus),
            })}>Edit</Button>,
          ])}
        />
      </Card>

      {/* ── roaming club: tiers and the fulfilment queue ──────────────── */}
      <div className="mt-3.5 grid grid-cols-1 items-start gap-3.5 xl:grid-cols-2">
        <Card>
          <CardHead title={`Roaming Club tiers — ${num(tiers.data?.length ?? 0)}`} />
          <Table
            head={['Track', 'Destination', 'Self required', 'Team required']}
            empty="Not configured."
            rows={(tiers.data ?? []).map((t) => [
              <Badge key="a" tone={t.track === 'AFFILIATE' ? 'info' : 'neutral'}>{t.track.replace('_', ' ')}</Badge>,
              <span key="b" className="font-medium">{t.destination}</span>,
              <span key="c" className="tabular-nums">{usd(t.selfRequirement, 0)}</span>,
              <span key="d" className="tabular-nums text-ink-2">{Number(t.teamRequirement) > 0 ? usd(t.teamRequirement, 0) : '—'}</span>,
            ])}
          />
        </Card>

        <Card>
          <CardHead
            title="Roaming Club awards"
            action={awards.data?.pending
              ? <Badge tone="warn">{num(awards.data.pending)} awaiting fulfilment</Badge>
              : undefined}
          />
          {awards.isLoading ? (
            <div className="space-y-2 px-5 pb-5">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : (
            <Table
              head={['Earned', 'Member', 'Destination', 'Status', '']}
              empty="No awards earned yet. Members qualify automatically against the tiers on the left."
              rows={(awards.data?.rows ?? []).map((a) => [
                <span key="a" className="text-ink-2">{shortDate(a.achievedAt)}</span>,
                <span key="b" className="font-medium">{a.userCode}</span>,
                <span key="c">{a.destination}</span>,
                <span key="d" className="inline-flex items-center gap-1.5">
                  <Badge tone={a.status === 'PROCESSED' ? 'good' : 'warn'}>{a.status === 'PROCESSED' ? 'fulfilled' : 'pending'}</Badge>
                  {a.notes && <span title={a.notes} className="max-w-[130px] truncate text-[11px] text-ink-3">{a.notes}</span>}
                </span>,
                a.status === 'PROCESSED'
                  ? <span key="e" className="text-ink-3">—</span>
                  : <Button key="e" size="sm" onClick={() => setFulfil(a)}>Fulfil</Button>,
              ])}
            />
          )}
        </Card>
      </div>

      {/* ── rank achievements ────────────────────────────────────────── */}
      <Card className="mt-3.5">
        <CardHead
          title="Rank achievements"
          action={achievements.data
            ? <span className="text-[12.5px] text-ink-2">{num(achievements.data.total)} awarded · {usd(achievements.data.rewarded)} in rewards</span>
            : undefined}
        />
        <Table
          head={['Achieved', 'Member', 'Rank', 'Reward']}
          empty="No ranks achieved yet."
          rows={(achievements.data?.rows ?? []).map((a) => [
            <span key="a" className="text-ink-2">{shortDate(a.achievedAt)}</span>,
            <span key="b" className="font-medium">{a.userCode}</span>,
            <span key="c">{a.rank}</span>,
            <span key="d" className="font-medium tabular-nums text-good">{usd(a.reward)}</span>,
          ])}
        />
      </Card>

      {/* ── package editor ───────────────────────────────────────────── */}
      <Modal
        open={!!pkgForm}
        onClose={() => setPkgForm(null)}
        width="lg"
        title={pkgForm?.id ? `Edit ${pkgForm.name}` : 'New investment package'}
        description="The earn limit is this tier's ceiling as a percent of capital. ACTIVE affiliates earn the configured uplift on top of it."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setPkgForm(null)}>Cancel</Button>
            <Button size="sm" loading={savePackage.isPending}
                    disabled={!pkgForm?.name.trim() || !pkgForm?.amount.trim()}
                    onClick={() => pkgForm && savePackage.mutate(pkgForm)}>
              {pkgForm?.id ? 'Save package' : 'Create package'}
            </Button>
          </>
        }
      >
        {pkgForm && (
          <div className="grid gap-3 sm:grid-cols-2">
            {([
              ['name', 'Plan name', 'text', 'e.g. Starter'],
              ['amount', 'Amount ($)', 'decimal', '500'],
              ['dailyRoiPercent', 'Daily return (%)', 'decimal', '0.5'],
              ['capPercent', 'Earn limit (%)', 'decimal', '250'],
              ['sortOrder', 'Display order', 'numeric', '0'],
            ] as const).map(([field, label, mode, placeholder]) => (
              <label key={field} className={clsx('block', field === 'name' && 'sm:col-span-2')}>
                <span className="mb-1 block text-[12px] font-medium text-ink-2">{label}</span>
                <input
                  value={pkgForm[field]}
                  inputMode={mode === 'text' ? undefined : mode}
                  placeholder={placeholder}
                  onChange={(e) => setPkgForm((s) => s && { ...s, [field]: e.target.value })}
                  className="w-full rounded-[9px] border border-field-line bg-field px-3 py-2 text-[13px] text-ink outline-none transition placeholder:text-field-ph focus:border-gold focus:ring-4 focus:ring-gold/15"
                />
              </label>
            ))}
            <label className="flex items-center gap-2.5 sm:col-span-2">
              <Toggle on={pkgForm.isActive} label="Package active"
                      onChange={(v) => setPkgForm((s) => s && { ...s, isActive: v })} />
              <span className="text-[13px] text-ink-2">Available for purchase</span>
            </label>
          </div>
        )}
      </Modal>

      {/* ── roaming fulfilment ───────────────────────────────────────── */}
      <ActionDialog
        open={!!fulfil}
        onClose={() => setFulfil(null)}
        pending={fulfilAward.isPending}
        title={fulfil ? `Mark ${fulfil.destination} fulfilled?` : ''}
        body={fulfil ? `Records the trip for ${fulfil.userCode} as delivered. The Roaming Club sits outside the earnings cap, so nothing is credited to a wallet here.` : undefined}
        confirmLabel="Mark fulfilled"
        fields={[{
          name: 'notes', label: 'Fulfilment note', required: true, minLength: 3, multiline: true,
          placeholder: 'e.g. booked via Emirates, ref AB1234, departing 12 Mar',
          help: 'Stored on the award and written to the audit log.',
        }]}
        onConfirm={(v) => fulfil && fulfilAward.mutate({ id: fulfil.id, notes: v.notes })}
      />
    </>
  );
}
