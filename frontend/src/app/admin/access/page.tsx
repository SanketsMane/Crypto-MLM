'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { clsx } from 'clsx';
import { Banknote, KeyRound, Plus, Search, ShieldCheck, UserRoundPlus } from 'lucide-react';
import { toastError } from '@/lib/toast';
import { adminGet, adminPost, adminPatch, adminDelete } from '@/lib/admin-api';
import { PageHeader, Badge, Button, Skeleton, Table, controlCls } from '@/components/ui/primitives';
import { ActionDialog } from '@/components/ui/dialog';
import { Modal } from '@/components/ui/modal';
import { useConfirmOk } from '@/components/ui/confirm';
import {
  Workbench, Rail, Detail, DetailBar, QueueRow, EmptyDetail, useQueueKeys,
} from '@/components/admin/workbench';
import { useAdmin } from '@/features/admin/use-admin';
import { shortDate, ago } from '@/lib/format';

interface Role {
  id: string; name: string; slug: string; description: string | null;
  level: number; isSystem: boolean; permissionIds: string[]; adminCount: number;
}
interface Perm { id: string; key: string; label: string; description?: string }
interface PermGroup { group: string; permissions: Perm[] }
interface AdminRow {
  id: string; email: string; name: string; isActive: boolean;
  role: { name: string; slug: string; level: number }; lastLoginAt: string | null; createdAt: string;
}

/**
 * What a grant is actually worth.
 *
 * The catalogue the API serves says what a permission is called, not what it
 * costs to get it wrong. `withdrawals.approve` lets somebody send money out of
 * the platform; `roles.manage` lets them grant themselves everything else. On a
 * screen whose entire job is deciding who holds those, the weight of a grant
 * has to be legible before you tick the box — and a role has to show how many
 * of each it carries before you ever open it.
 *
 * Keep in step with backend/src/modules/admin/rbac/permissions.ts.
 */
const MONEY_KEYS = new Set([
  'deposits.approve', 'deposits.reject',
  'withdrawals.approve', 'withdrawals.reject',
  'users.adjust', 'jobs.run', 'plan.edit', 'roaming.fulfil',
]);
const ACCESS_KEYS = new Set([
  'roles.manage', 'admins.manage', 'users.password', 'users.impersonate',
  'announcements.send', 'platform.maintenance',
]);

type Weight = 'money' | 'access';
const weightOf = (key: string): Weight | null =>
  MONEY_KEYS.has(key) ? 'money' : ACCESS_KEYS.has(key) ? 'access' : null;

/** Icon + word + colour, so the marker survives greyscale and colour blindness. */
function WeightChip({ kind, count }: { kind: Weight; count?: number }) {
  const Icon = kind === 'money' ? Banknote : KeyRound;
  return (
    <span
      title={kind === 'money'
        ? 'Moves money or authorises a money movement'
        : 'Grants console access or acts as another person'}
      className={clsx(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-[2px] text-[10.5px] font-medium',
        kind === 'money' ? 'bg-warn-soft text-warn-on' : 'bg-bad-soft text-bad-on',
      )}
    >
      <Icon size={11} strokeWidth={2.2} />
      {count === undefined ? kind : `${count} ${kind}`}
    </span>
  );
}

export default function AccessPage() {
  const qc = useQueryClient();
  const { admin, can } = useAdmin();
  const askConfirm = useConfirmOk();

  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [roleOpen, setRoleOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [newRole, setNewRole] = useState({ name: '', description: '', level: 50 });
  const [newAdmin, setNewAdmin] = useState({ email: '', name: '', password: '', roleId: '' });
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string; adminCount: number } | null>(null);

  const roles = useQuery({ queryKey: ['admin', 'roles'], queryFn: () => adminGet<Role[]>('/admin/roles') });
  const perms = useQuery({ queryKey: ['admin', 'permissions'], queryFn: () => adminGet<PermGroup[]>('/admin/permissions') });
  const admins = useQuery({
    queryKey: ['admin', 'admins'],
    queryFn: () => adminGet<AdminRow[]>('/admin/admins'),
    enabled: can('admins.view'),
  });

  const myLevel = admin?.role.level ?? 999;
  const role = roles.data?.find((r) => r.id === selected) ?? null;
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin'] });

  /* ── permission lookups ─────────────────────────────────────────────── */
  const allPerms = useMemo(() => (perms.data ?? []).flatMap((g) => g.permissions), [perms.data]);
  const keyById = useMemo(() => new Map(allPerms.map((p) => [p.id, p.key])), [allPerms]);
  const total = allPerms.length;

  /** Money/access counts for a set of permission ids. */
  const weigh = useMemo(() => (ids: string[]) => {
    let money = 0, access = 0;
    for (const id of ids) {
      const w = weightOf(keyById.get(id) ?? '');
      if (w === 'money') money++;
      else if (w === 'access') access++;
    }
    return { money, access };
  }, [keyById]);

  const roleBySlug = useMemo(
    () => new Map((roles.data ?? []).map((r) => [r.slug, r])),
    [roles.data],
  );

  /* ── selection ──────────────────────────────────────────────────────── */
  const dirty = !!role && (
    draft.size !== role.permissionIds.length || [...draft].some((d) => !role.permissionIds.includes(d))
  );

  const load = (r: Role) => { setSelected(r.id); setDraft(new Set(r.permissionIds)); };

  /**
   * Switching roles throws away unsaved grants, so it asks first. Losing a set
   * of permission edits to a stray click is the kind of thing you only notice
   * a week later, when somebody still cannot approve a withdrawal.
   */
  const pick = async (r: Role) => {
    if (r.id === selected) return;
    if (dirty && !(await askConfirm({
      title: 'Discard unsaved permission changes?',
      body: `Your edits to ${role?.name} have not been saved. Opening another role loses them.`,
      confirmLabel: 'Discard changes',
    }))) return;
    load(r);
  };

  /* Never land on an empty detail pane: open the first role on arrival. */
  useEffect(() => {
    if (selected || !roles.data?.length) return;
    load(roles.data.find((r) => myLevel < r.level) ?? roles.data[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roles.data, selected, myLevel]);

  useQueueKeys(
    (roles.data ?? []).map((r) => r.id),
    selected,
    (id) => { const r = roles.data?.find((x) => x.id === id); if (r) void pick(r); },
  );

  const toggle = (id: string) =>
    setDraft((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  /* ── mutations ──────────────────────────────────────────────────────── */
  const saveRole = useMutation({
    mutationFn: () => adminPatch(`/admin/roles/${selected}`, {
      permissionKeys: [...draft].map((id) => keyById.get(id) ?? '').filter(Boolean),
    }),
    onSuccess: () => { toast.success('Permissions saved — applies within 30 seconds, no re-login'); refresh(); },
    onError: (e) => toastError(e),
  });

  const deleteRole = useMutation({
    mutationFn: (id: string) => adminDelete(`/admin/roles/${id}`),
    onSuccess: () => {
      toast.success('Role deleted');
      setConfirmDelete(null);
      setSelected(null);
      qc.invalidateQueries({ queryKey: ['admin', 'roles'] });
    },
    onError: (e) => toastError(e),
  });

  const createRole = useMutation({
    mutationFn: () => adminPost<Role>('/admin/roles', { ...newRole, permissionKeys: [] }),
    onSuccess: () => {
      toast.success('Role created — it starts with no permissions');
      setNewRole({ name: '', description: '', level: 50 });
      setRoleOpen(false);
      refresh();
    },
    onError: (e) => toastError(e),
  });

  const createAdmin = useMutation({
    mutationFn: () => adminPost('/admin/admins', newAdmin),
    onSuccess: () => {
      toast.success('Admin created — they can sign in now');
      setNewAdmin({ email: '', name: '', password: '', roleId: '' });
      setAdminOpen(false);
      refresh();
    },
    onError: (e) => toastError(e),
  });

  const toggleAdmin = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      adminPatch(`/admin/admins/${id}`, { isActive }),
    onSuccess: (_d, v) => { toast.success(v.isActive ? 'Admin re-enabled' : 'Admin disabled — sessions ended'); refresh(); },
    onError: (e) => toastError(e),
  });

  /* ── editability, mirroring the API exactly ─────────────────────────── */
  /* outranks(actor, target) === actorLevel < targetLevel — admin-auth.ts */
  const editable = !!role && can('roles.manage') && myLevel < role.level && !role.isSystem;
  const lockReason = !role ? null
    : !can('roles.manage')
      ? 'Read-only. Your role does not include “Create and edit roles”.'
      : myLevel >= role.level
        ? `Read-only. You can only edit roles less senior than your own — you are ${admin?.role.name} at level ${myLevel}, and this role is level ${role.level}. Nobody can widen their own access from this screen.`
        : role.isSystem
          ? 'Read-only. The owner role must keep every permission, so its grants are fixed. It can still be assigned to an admin.'
          : null;

  /* ── the unsaved diff ───────────────────────────────────────────────── */
  const added = role ? [...draft].filter((id) => !role.permissionIds.includes(id)) : [];
  const removed = role ? role.permissionIds.filter((id) => !draft.has(id)) : [];

  /* ── filtered catalogue ─────────────────────────────────────────────── */
  const q = filter.trim().toLowerCase();
  const groups = (perms.data ?? [])
    .map((g) => ({
      ...g,
      permissions: q
        ? g.permissions.filter((p) =>
          `${p.label} ${p.key} ${p.description ?? ''} ${g.group}`.toLowerCase().includes(q))
        : g.permissions,
    }))
    .filter((g) => g.permissions.length > 0);

  /* ── governance posture ─────────────────────────────────────────────── */
  const active = (admins.data ?? []).filter((a) => a.isActive);
  const holders = (kind: Weight) => active.filter((a) => {
    const r = roleBySlug.get(a.role.slug);
    return r ? weigh(r.permissionIds)[kind] > 0 : false;
  }).length;

  const facts = [
    { k: 'Admin accounts', v: admins.data ? `${active.length}` : '—',
      hint: admins.data ? `${admins.data.length - active.length} disabled` : 'loading' },
    { k: 'Roles', v: roles.data ? `${roles.data.length}` : '—',
      hint: `${total} permissions defined` },
    { k: 'Can move money', v: admins.data ? `${holders('money')}` : '—',
      hint: 'active admins', tone: 'warn' as const },
    { k: 'Can grant access', v: admins.data ? `${holders('access')}` : '—',
      hint: 'active admins', tone: 'bad' as const },
  ];

  return (
    <>
      <PageHeader
        title="Roles & Access"
        subtitle={`Who can reach this console and what each of them can do. Roles are rows in the database — add as many levels as you need without a deploy, and the API enforces the same keys shown here. You can only manage roles less senior than ${admin?.role.name ?? 'your own'} (level ${myLevel}).`}
      />

      {can('admins.view') && (
        <div className="mb-3.5 grid gap-px overflow-hidden rounded-[5px] border border-line bg-line shadow-card sm:grid-cols-2 lg:grid-cols-4">
          {facts.map((f) => (
            <div key={f.k} className="bg-card px-4 py-3">
              <p className="text-[10.5px] font-medium uppercase tracking-[0.04em] text-ink-2">{f.k}</p>
              <p className={clsx('mt-1 text-[19px] font-semibold tabular-nums',
                f.tone === 'warn' ? 'text-warn' : f.tone === 'bad' ? 'text-bad' : 'text-ink')}>{f.v}</p>
              <p className="mt-0.5 text-[11.5px] text-ink-2">{f.hint}</p>
            </div>
          ))}
        </div>
      )}

      <Workbench>
        {/* ── roles rail ────────────────────────────────────────────────── */}
        <Rail>
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-3.5">
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold leading-tight text-ink">Roles</h2>
              <p className="mt-0.5 text-[11.5px] text-ink-2">Lower level is more senior</p>
            </div>
            {can('roles.manage') && (
              <Button size="sm" variant="outline" onClick={() => setRoleOpen(true)}>
                <Plus size={14} /> New role
              </Button>
            )}
          </div>

          <div className="fx-scrollbar-hide min-h-0 flex-1 overflow-y-auto">
            {roles.isLoading ? (
              <div className="space-y-2 p-5">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[86px]" />)}
              </div>
            ) : (roles.data ?? []).length === 0 ? (
              <p className="px-5 py-14 text-center text-[13px] text-ink-2">No roles are defined.</p>
            ) : (roles.data ?? []).map((r) => {
              const { money, access } = weigh(r.permissionIds);
              const mine = r.level === myLevel;
              const locked = myLevel >= r.level;
              const pct = total ? Math.round((r.permissionIds.length / total) * 100) : 0;
              return (
                <QueueRow key={r.id} selected={selected === r.id} onSelect={() => void pick(r)}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13.5px] font-medium text-ink">{r.name}</span>
                    <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-ink-3">L{r.level}</span>
                  </div>

                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-line">
                    <div className={clsx('h-full rounded-full', pct === 100 ? 'bg-gold' : 'bg-violet')}
                         style={{ width: `${pct}%` }} />
                  </div>

                  <p className="mt-1.5 text-[11.5px] tabular-nums text-ink-2">
                    {r.permissionIds.length} of {total} permissions · {r.adminCount} admin{r.adminCount === 1 ? '' : 's'}
                  </p>

                  {(money > 0 || access > 0 || r.isSystem || mine || locked) && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      {money > 0 && <WeightChip kind="money" count={money} />}
                      {access > 0 && <WeightChip kind="access" count={access} />}
                      {r.isSystem && <Badge tone="info">system</Badge>}
                      {mine && <Badge tone="neutral">your role</Badge>}
                      {locked && !mine && <Badge tone="neutral">read-only</Badge>}
                    </div>
                  )}
                </QueueRow>
              );
            })}
          </div>
        </Rail>

        {/* ── permission editor ─────────────────────────────────────────── */}
        <Detail>
          {!role ? (
            roles.isLoading ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
              </div>
            ) : (
              <EmptyDetail
                icon={<ShieldCheck size={20} />}
                title="Select a role"
                hint="Its permission grants open here. Ticking a box takes effect within 30 seconds — nobody has to sign in again."
              />
            )
          ) : (
            <>
              <DetailBar
                title={role.name}
                subtitle={dirty ? (
                  <span className="tabular-nums">
                    {added.length > 0 && <span className="font-medium text-good">+{added.length} granted</span>}
                    {added.length > 0 && removed.length > 0 && <span className="text-ink-3"> · </span>}
                    {removed.length > 0 && <span className="font-medium text-bad">−{removed.length} revoked</span>}
                    <span className="text-ink-2"> · not saved yet</span>
                  </span>
                ) : (
                  <span className="tabular-nums">
                    Level {role.level} · {draft.size} of {total} permissions · {role.adminCount} admin{role.adminCount === 1 ? '' : 's'}
                  </span>
                )}
              >
                {editable && (
                  <>
                    {!role.isSystem && (
                      <Button size="sm" variant="ghost"
                              className="text-bad hover:bg-bad-soft hover:text-bad"
                              onClick={() => setConfirmDelete({ id: role.id, name: role.name, adminCount: role.adminCount })}>
                        Delete role
                      </Button>
                    )}
                    {/* Save appears only when there is something to save — a
                        permanently lit primary button pointing at a no-op is
                        noise, and its arrival is the clearest dirty signal. */}
                    {dirty && (
                      <>
                        <span className="h-5 w-px bg-line" aria-hidden />
                        <Button size="sm" variant="ghost" onClick={() => load(role)}>Discard</Button>
                        <Button size="sm" loading={saveRole.isPending} onClick={() => saveRole.mutate()}>
                          Save changes
                        </Button>
                      </>
                    )}
                  </>
                )}
              </DetailBar>

              {/* what is about to change, before it changes */}
              {dirty && (
                <div className="border-b border-line bg-canvas px-5 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-2">Unsaved changes</p>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {added.map((id) => (
                      <li key={id} className="inline-flex items-center gap-1 rounded-[3px] bg-good-soft px-2 py-[3px] font-mono text-[10.5px] text-good-on">
                        + {keyById.get(id)}
                      </li>
                    ))}
                    {removed.map((id) => (
                      <li key={id} className="inline-flex items-center gap-1 rounded-[3px] bg-bad-soft px-2 py-[3px] font-mono text-[10.5px] text-bad-on">
                        − {keyById.get(id)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {role.description && !dirty && (
                <p className="border-b border-line px-5 py-3 text-[12.5px] leading-relaxed text-ink-2">{role.description}</p>
              )}

              {lockReason && (
                <div className="flex items-start gap-2.5 border-b border-line bg-canvas px-5 py-3">
                  <ShieldCheck size={15} className="mt-[1px] shrink-0 text-ink-3" />
                  <p className="text-[12px] leading-relaxed text-ink-2">{lockReason}</p>
                </div>
              )}

              <div className="border-b border-line px-5 py-3">
                <label className="relative flex items-center">
                  <Search size={15} className="pointer-events-none absolute left-3 text-ink-3" />
                  <span className="sr-only">Filter permissions</span>
                  <input value={filter} onChange={(e) => setFilter(e.target.value)}
                         placeholder="Filter permissions — name, key or area"
                         className={`${controlCls} h-9 w-full pl-9 text-[12.5px]`} />
                </label>
              </div>

              {perms.isLoading ? (
                <div className="space-y-3 p-5">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
                </div>
              ) : groups.length === 0 ? (
                <p className="px-5 py-14 text-center text-[13px] text-ink-2">
                  No permission matches “{filter}”.
                </p>
              ) : groups.map((g) => {
                const ids = g.permissions.map((p) => p.id);
                const onCount = ids.filter((id) => draft.has(id)).length;
                const allOn = onCount === ids.length;
                return (
                  <section key={g.group} className="border-b border-line-soft px-5 py-4 last:border-b-0">
                    <div className="mb-2.5 flex items-center justify-between gap-3">
                      <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-2">
                        {g.group}
                        <span className="ml-1.5 font-normal tabular-nums text-ink-3">{onCount}/{ids.length}</span>
                      </h3>
                      {editable && (
                        <button type="button"
                          onClick={() => setDraft((s) => {
                            const n = new Set(s);
                            ids.forEach((id) => (allOn ? n.delete(id) : n.add(id)));
                            return n;
                          })}
                          className="rounded-[3px] px-2 py-1 text-[11.5px] font-medium text-ink-2 transition hover:bg-canvas hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">
                          {allOn ? 'Clear all' : 'Select all'}
                        </button>
                      )}
                    </div>

                    {/* One column until the detail pane is genuinely wide. At `lg`
                        the pane is ~500px, and splitting that in two wraps every
                        label and description into a four-line block. */}
                    <div className="grid gap-1.5 xl:grid-cols-2">
                      {g.permissions.map((p) => {
                        const on = draft.has(p.id);
                        const w = weightOf(p.key);
                        return (
                          <label key={p.id}
                            className={clsx(
                              'flex items-start gap-2.5 rounded-[5px] border px-3 py-2.5 transition',
                              on ? 'border-violet/35 bg-violet-bg' : 'border-line bg-card',
                              editable ? 'cursor-pointer hover:border-line-strong' : 'cursor-not-allowed opacity-75',
                            )}>
                            <input type="checkbox" checked={on} disabled={!editable}
                                   onChange={() => toggle(p.id)}
                                   className="mt-[3px] h-4 w-4 shrink-0 accent-violet" />
                            <span className="min-w-0">
                              <span className="flex flex-wrap items-center gap-1.5">
                                <span className="text-[13px] font-medium leading-tight text-ink">{p.label}</span>
                                {w && <WeightChip kind={w} />}
                              </span>
                              {p.description && (
                                <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-2">{p.description}</span>
                              )}
                              <span className="mt-1 block font-mono text-[10.5px] text-ink-3">{p.key}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </>
          )}
        </Detail>
      </Workbench>

      {/* ── admin accounts ──────────────────────────────────────────────── */}
      {can('admins.view') && (
        <section className="mt-3.5 overflow-hidden rounded-[5px] border border-line bg-card shadow-card">
          <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
            <div className="min-w-0">
              <h2 className="text-[16px] font-semibold leading-tight tracking-[-0.01em] text-ink">Admin accounts</h2>
              <p className="mt-0.5 text-[12.5px] text-ink-2">
                Everyone who can sign in to this console. Disabling an account ends its sessions immediately.
              </p>
            </div>
            {can('admins.manage') && (
              <Button size="sm" variant="outline" onClick={() => setAdminOpen(true)}>
                <UserRoundPlus size={14} /> Add admin
              </Button>
            )}
          </header>

          <Table
            head={['Admin', 'Role', 'Grants', 'Status', 'Last login', '']}
            empty="No admin accounts."
            rows={admins.isLoading
              ? Array.from({ length: 3 }).map((_, i) => [
                <Skeleton key={`a${i}`} className="h-8 w-40" />,
                <Skeleton key={`r${i}`} className="h-4 w-24" />,
                <Skeleton key={`g${i}`} className="h-4 w-20" />,
                <Skeleton key={`s${i}`} className="h-4 w-14" />,
                <Skeleton key={`l${i}`} className="h-4 w-20" />,
                <Skeleton key={`b${i}`} className="h-4 w-12" />,
              ])
              : (admins.data ?? []).map((a) => {
                const r = roleBySlug.get(a.role.slug);
                const { money, access } = r ? weigh(r.permissionIds) : { money: 0, access: 0 };
                const isMe = a.id === admin?.id;
                /* the API refuses unless the actor outranks the target — do not
                   offer a button that is guaranteed to come back 403 */
                const canAct = can('admins.manage') && !isMe && myLevel < a.role.level;
                return [
                  <span key="n" className="block">
                    <span className="flex items-center gap-1.5 font-medium text-ink">
                      {a.name}
                      {isMe && <Badge tone="neutral">you</Badge>}
                    </span>
                    <span className="mt-0.5 block text-[11.5px] text-ink-2">{a.email}</span>
                  </span>,
                  <span key="r" className="block">
                    <span className="block text-[12.5px] text-ink">{a.role.name}</span>
                    <span className="mt-0.5 block font-mono text-[10.5px] tabular-nums text-ink-3">L{a.role.level}</span>
                  </span>,
                  <span key="g" className="flex flex-wrap gap-1">
                    {money > 0 && <WeightChip kind="money" count={money} />}
                    {access > 0 && <WeightChip kind="access" count={access} />}
                    {money === 0 && access === 0 && <span className="text-[12px] text-ink-3">read-only</span>}
                  </span>,
                  <Badge key="s" tone={a.isActive ? 'good' : 'neutral'}>{a.isActive ? 'active' : 'disabled'}</Badge>,
                  <span key="t" className="text-[12.5px] text-ink-2"
                        title={a.lastLoginAt ? shortDate(a.lastLoginAt) : undefined}>
                    {a.lastLoginAt ? ago(a.lastLoginAt) : 'never'}
                  </span>,
                  canAct ? (
                    <Button key="b" size="sm" variant="outline"
                      onClick={async () => {
                        if (a.isActive && !(await askConfirm({
                          title: `Disable ${a.name}?`,
                          body: `${a.email} is signed out of every device immediately and cannot sign in again until re-enabled. Their audit history is kept.`,
                          confirmLabel: 'Disable admin',
                        }))) return;
                        toggleAdmin.mutate({ id: a.id, isActive: !a.isActive });
                      }}>
                      {a.isActive ? 'Disable' : 'Enable'}
                    </Button>
                  ) : (
                    <span key="b" className="text-[12px] text-ink-3"
                          title={isMe ? 'You cannot disable your own account' : 'This admin is at or above your seniority'}>
                      —
                    </span>
                  ),
                ];
              })}
          />
        </section>
      )}

      {/* ── new role ────────────────────────────────────────────────────── */}
      <Modal
        open={roleOpen}
        onClose={() => setRoleOpen(false)}
        title="New role"
        description="A role starts with no permissions. Create it, then grant exactly what it needs."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setRoleOpen(false)}>Cancel</Button>
            <Button size="sm" loading={createRole.isPending}
                    disabled={newRole.name.trim().length < 2 || newRole.level <= myLevel}
                    onClick={() => createRole.mutate()}>Create role</Button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-ink">Name</span>
            <input className={`${controlCls} w-full`} value={newRole.name} autoFocus
                   placeholder="Compliance Officer"
                   onChange={(e) => setNewRole((s) => ({ ...s, name: e.target.value }))} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-ink">Description</span>
            <input className={`${controlCls} w-full`} value={newRole.description}
                   placeholder="What this role is for"
                   onChange={(e) => setNewRole((s) => ({ ...s, description: e.target.value }))} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-ink">Seniority level</span>
            <input type="number" min={myLevel + 1} className={`${controlCls} w-full`} value={newRole.level}
                   onChange={(e) => setNewRole((s) => ({ ...s, level: Number(e.target.value) }))} />
            <span className={clsx('mt-1 block text-[11.5px]',
              newRole.level <= myLevel ? 'text-bad' : 'text-ink-2')}>
              {newRole.level <= myLevel
                ? `Must be above ${myLevel} — you cannot create a role at or above your own seniority.`
                : `A lower number is more senior. Yours is ${myLevel}, so ${myLevel + 1} or higher.`}
            </span>
          </label>
        </div>
      </Modal>

      {/* ── new admin ───────────────────────────────────────────────────── */}
      <Modal
        open={adminOpen}
        onClose={() => setAdminOpen(false)}
        title="Add an admin"
        description="They can sign in as soon as this is saved, with everything their role grants."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setAdminOpen(false)}>Cancel</Button>
            <Button size="sm" loading={createAdmin.isPending}
                    disabled={!newAdmin.email.trim() || !newAdmin.name.trim()
                              || newAdmin.password.length < 8 || !newAdmin.roleId}
                    onClick={() => createAdmin.mutate()}>Create admin</Button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-ink">Full name</span>
            <input className={`${controlCls} w-full`} value={newAdmin.name} autoFocus
                   onChange={(e) => setNewAdmin((s) => ({ ...s, name: e.target.value }))} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-ink">Email</span>
            <input type="email" autoComplete="off" className={`${controlCls} w-full`} value={newAdmin.email}
                   onChange={(e) => setNewAdmin((s) => ({ ...s, email: e.target.value }))} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-ink">Temporary password</span>
            <input type="password" autoComplete="new-password" className={`${controlCls} w-full`}
                   value={newAdmin.password}
                   onChange={(e) => setNewAdmin((s) => ({ ...s, password: e.target.value }))} />
            <span className={clsx('mt-1 block text-[11.5px]',
              newAdmin.password && newAdmin.password.length < 8 ? 'text-bad' : 'text-ink-2')}>
              At least 8 characters. Send it to them over a channel other than email.
            </span>
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-ink">Role</span>
            <select className={`${controlCls} w-full`} value={newAdmin.roleId}
                    onChange={(e) => setNewAdmin((s) => ({ ...s, roleId: e.target.value }))}>
              <option value="">Select a role…</option>
              {(roles.data ?? []).filter((r) => myLevel < r.level)
                .map((r) => <option key={r.id} value={r.id}>{r.name} — level {r.level}</option>)}
            </select>
          </label>

          {/* what you are about to hand over, before you hand it over */}
          {(() => {
            const r = roles.data?.find((x) => x.id === newAdmin.roleId);
            if (!r) return null;
            const { money, access } = weigh(r.permissionIds);
            return (
              <div className="rounded-[5px] border border-line bg-canvas px-3.5 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-2">This grants</p>
                <p className="mt-1 text-[12.5px] tabular-nums text-ink">
                  {r.permissionIds.length} of {total} permissions
                </p>
                {(money > 0 || access > 0) ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {money > 0 && <WeightChip kind="money" count={money} />}
                    {access > 0 && <WeightChip kind="access" count={access} />}
                  </div>
                ) : (
                  <p className="mt-1 text-[11.5px] text-ink-2">No money or access powers — read-only.</p>
                )}
              </div>
            );
          })()}
        </div>
      </Modal>

      <ActionDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        pending={deleteRole.isPending}
        tone="danger"
        title={confirmDelete ? `Delete the ${confirmDelete.name} role?` : ''}
        body={confirmDelete
          ? confirmDelete.adminCount > 0
            ? `${confirmDelete.adminCount} admin${confirmDelete.adminCount === 1 ? '' : 's'} still hold this role. Reassign them first — the API will refuse the delete until then.`
            : 'The role and its permission grants are removed. No admin holds it, so nobody loses access.'
          : undefined}
        confirmLabel="Delete role"
        onConfirm={() => confirmDelete && deleteRole.mutate(confirmDelete.id)}
      />
    </>
  );
}
