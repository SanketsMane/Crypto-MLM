'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Search, Trash2 } from 'lucide-react';
import { adminDelete, adminGet, adminPost } from '@/lib/admin-api';
import { useConfirm } from '@/components/ui/confirm';
import { useMoneyMutation } from '@/lib/money-mutation';
import { toastError } from '@/lib/toast';
import { ActionDialog } from '@/components/ui/dialog';
import { Card, CardHead, PageHeader, Table, Badge, toneFor, Select, controlCls, Skeleton, Button } from '@/components/ui/primitives';
import { ExportButton } from '@/components/admin/export-button';
import { NewMemberDialog } from '@/components/admin/new-member-dialog';
import { useAdmin } from '@/features/admin/use-admin';
import { UserPlus } from 'lucide-react';
import { Pagination } from '@/components/ui/pagination';
import { usd, shortDate, num } from '@/lib/format';
import { rankLabel } from '@/lib/rank';
import { usePlatformConfig } from '@/features/config/use-config';

interface Row {
  id: string; userCode: string; email: string; name: string; status: string;
  affiliateMode: string; totalInvested: string; totalEarned: string;
  directCount: number; rank: string | null; rankLevel: number | null;
  teamBusiness: string; teamSize: number; createdAt: string;
}

export default function UsersPage() {
  /* The ceilings come from the settings table, not from constants here. This
     page hard-coded 250%/300% in four places, so changing the ceiling in
     Settings left the console labelling every member with the old figure —
     and the bulk action offered to set a cap the platform no longer applies. */
  const cfg = usePlatformConfig();
  const capPassive = cfg.data?.returns.capPassivePercent ?? 200;
  const capActive = cfg.data?.returns.capActivePercent ?? 300;
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(50);
  const [creating, setCreating] = useState(false);
  const { can } = useAdmin();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<'ACTIVE' | 'SUSPENDED' | 'BLOCKED' | null>(null);

  const done = (label: string) => (r: { succeeded: string[]; failed: { reason: string }[] }) => {
    qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    setSelected(new Set());
    setBulkStatus(null);
    // Report both halves — a partial failure that reads as success is how an
    // operator believes they blocked twelve accounts and blocked nine.
    if (r.failed.length) {
      toast.warning(`${r.succeeded.length} ${label}, ${r.failed.length} could not be`, {
        description: r.failed[0]?.reason,
      });
    } else {
      toast.success(`${r.succeeded.length} member${r.succeeded.length === 1 ? '' : 's'} ${label}`);
    }
  };

  const bulkStatusMutation = useMoneyMutation({
    mutationFn: (v: { status: string; reason: string }, key) =>
      adminPost<{ succeeded: string[]; failed: { reason: string }[] }>(
        '/admin/users/bulk/status', { userIds: [...selected], ...v }, key),
    onSuccess: done('updated'),
    onError: (e) => toastError(e),
  });

  const bulkMode = useMoneyMutation({
    mutationFn: (mode: 'ACTIVE' | 'PASSIVE', key) =>
      adminPost<{ succeeded: string[]; failed: { reason: string }[] }>(
        '/admin/users/bulk/affiliate-mode', { userIds: [...selected], mode }, key),
    onSuccess: done('switched'),
    onError: (e) => toastError(e),
  });

  /**
   * Deleting a member.
   *
   * The server refuses once an account has any financial history or downline,
   * and says which — so the dialog does not try to predict that here. It asks
   * once, in plain words, and lets the refusal be the authority.
   */
  const askConfirm = useConfirm();

  const removeUser = useMutation({
    mutationFn: (v: { id: string; reason: string }) =>
      adminDelete<{ userCode: string }>(`/admin/users/${v.id}?reason=${encodeURIComponent(v.reason)}`),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      setSelected(new Set());
      toast.success(`${r.userCode} deleted`);
    },
    onError: (e) => toastError(e),
  });

  const confirmDelete = async (u: Row) => {
    const { ok, values } = await askConfirm({
      title: `Delete ${u.userCode}?`,
      body:
        `This permanently erases ${u.email} and everything attached to the account. `
        + 'It cannot be undone. If the member has ever moved money or sponsored anyone, '
        + 'the server will refuse — block the account instead.',
      confirmLabel: 'Delete permanently',
      tone: 'danger',
      fields: [{
        name: 'reason', label: 'Reason', required: true, minLength: 3,
        placeholder: 'e.g. bot signup, never verified',
        help: 'Written to the audit log, which outlives the account.',
      }],
    });
    if (!ok) return;
    removeUser.mutate({ id: u.id, reason: values.reason });
  };

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', q, status, page, size],
    queryFn: () => adminGet<{ total: number; rows: Row[] }>('/admin/users', {
      take: size, skip: page * size, q: q || undefined, status: status || undefined,
    }),
  });

  const rows = data?.rows ?? [];
  const allSelected = rows.length > 0 && rows.every((u) => selected.has(u.id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(rows.map((u) => u.id)));

  return (
    <>
      <PageHeader title="Users" subtitle="Every member on the platform, with balances and network position." />
      <Card>
        <CardHead
          title={`${num(data?.total ?? 0)} members`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Select label="Filter by member status" value={status} onChange={(v) => { setStatus(v); setPage(0); }} className="h-9 text-[12.5px]"
                      options={[{ value: '', label: 'All statuses' }, ...['ACTIVE','PENDING','SUSPENDED','BLOCKED'].map((s) => ({ value: s, label: s }))]} />
              <label className="relative flex items-center">
                <Search size={15} className="pointer-events-none absolute left-3 text-ink-3" />
                <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Search email, name or ID"
                       className={`${controlCls} h-9 w-56 pl-9 text-[12.5px]`} />
              </label>
              <ExportButton resource="users" filters={{ q: q || undefined, status: status || undefined }} />
              {can('users.create') && (
                <Button size="sm" onClick={() => setCreating(true)}><UserPlus size={13} /> New member</Button>
              )}
            </div>
          }
        />
        {/* The bulk bar only appears with a selection — a permanent row of
            disabled buttons is clutter. */}
        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-y border-line bg-canvas px-5 py-2.5">
            <span className="text-[12.5px] font-medium text-ink">{selected.size} selected</span>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              {(['ACTIVE', 'SUSPENDED', 'BLOCKED'] as const).map((st) => (
                <Button key={st} size="sm" variant="outline"
                        onClick={() => setBulkStatus(st)}>
                  Set {st.toLowerCase()}
                </Button>
              ))}
              <Button size="sm" variant="outline" loading={bulkMode.isPending}
                      onClick={() => bulkMode.mutate('ACTIVE')}>
                Cap {capActive}%
              </Button>
              <Button size="sm" variant="outline" loading={bulkMode.isPending}
                      onClick={() => bulkMode.mutate('PASSIVE')}>
                Cap {capPassive}%
              </Button>
              <button type="button" onClick={() => setSelected(new Set())}
                      className="rounded-[4px] px-2 py-1.5 text-[12px] text-ink-3 transition hover:text-ink">
                Clear
              </button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-2 px-5 pb-5">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-11" />)}</div>
        ) : (
          <Table
            head={[
              <input
                key="all"
                type="checkbox"
                aria-label="Select every member on this page"
                checked={allSelected}
                onChange={toggleAll}
                className="h-3.5 w-3.5 rounded border-line-strong accent-gold"
              />,
              'User ID', 'Name', 'Email', 'Status', 'Cap', 'Invested', 'Earned', 'Team', 'Directs', 'Rank', 'Joined', '',
            ]}
            empty="No members match those filters."
            rows={(data?.rows ?? []).map((u) => [
              <input
                key="sel"
                type="checkbox"
                aria-label={`Select ${u.userCode}`}
                checked={selected.has(u.id)}
                onChange={() => toggle(u.id)}
                className="h-3.5 w-3.5 rounded border-line-strong accent-gold"
              />,
              <span key="c" className="font-medium">{u.userCode}</span>,
              u.name || '—',
              <span key="e" className="text-ink-2">{u.email}</span>,
              <Badge key="s" tone={toneFor(u.status)}>{u.status}</Badge>,
              <Badge key="m" tone={u.affiliateMode === 'ACTIVE' ? 'info' : 'neutral'}>{u.affiliateMode === 'ACTIVE' ? `${capActive}%` : `${capPassive}%`}</Badge>,
              <span key="i" className="tabular-nums">{usd(u.totalInvested)}</span>,
              <span key="r" className="font-medium tabular-nums text-good">{usd(u.totalEarned)}</span>,
              <span key="t" className="tabular-nums">{usd(u.teamBusiness)}</span>,
              <span key="d" className="tabular-nums">{u.directCount}</span>,
              <span key="k" className="tabular-nums">{rankLabel(u.rankLevel)}</span>,
              <span key="j" className="text-ink-2">{shortDate(u.createdAt)}</span>,
              <div key="v" className="flex items-center justify-end gap-3">
                <Link href={`/admin/users/${u.id}`} className="font-medium text-violet hover:underline">View</Link>
                {can('users.delete') && (
                  <button
                    type="button"
                    onClick={() => void confirmDelete(u)}
                    disabled={removeUser.isPending}
                    title={`Delete ${u.userCode}`}
                    aria-label={`Delete ${u.userCode}`}
                    className="rounded p-1 text-ink-2 transition hover:bg-bad/10 hover:text-bad disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>,
            ])}
          />
        )}
        <Pagination total={data?.total ?? 0} page={page} pageSize={size} onPage={setPage} onPageSize={setSize} />
      </Card>

      <NewMemberDialog open={creating} onClose={() => setCreating(false)} />

      {/* Status changes in bulk require a reason, like the single-member path —
          it goes in the audit log and into each member's own trail. */}
      <ActionDialog
        open={bulkStatus !== null}
        onClose={() => setBulkStatus(null)}
        pending={bulkStatusMutation.isPending}
        title={bulkStatus ? `Set ${selected.size} member${selected.size === 1 ? '' : 's'} to ${bulkStatus.toLowerCase()}?` : ''}
        body={
          bulkStatus === 'ACTIVE'
            ? 'Restores full access for everyone selected.'
            : `Ends every session for the members selected and stops them signing in. Each is told, and it is recorded against your name.`
        }
        confirmLabel={bulkStatus ? `Set ${bulkStatus.toLowerCase()}` : 'Confirm'}
        fields={[{
          name: 'reason', label: 'Reason', required: true, minLength: 3,
          placeholder: 'e.g. fraud review completed — accounts cleared',
          help: 'Written to the audit log and to every affected member\'s activity trail.',
        }]}
        onConfirm={(v) => bulkStatus && bulkStatusMutation.mutate({ status: bulkStatus, reason: v.reason })}
      />
    </>
  );
}
