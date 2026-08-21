'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { toastError } from '@/lib/toast';
import { adminGet, adminPost, adminPatch, adminDelete, adminError } from '@/lib/admin-api';
import { Panel, PageHeader, Table, Badge, toneFor, Button, controlCls } from '@/components/ui/primitives';
import { ActionDialog } from '@/components/ui/dialog';
import { ActiveSessions } from '@/components/admin/active-sessions';

import { useAdmin } from '@/features/admin/use-admin';
import { shortDate } from '@/lib/format';

interface Role {
  id: string; name: string; slug: string; description: string | null;
  level: number; isSystem: boolean; permissionIds: string[]; adminCount: number;
}
interface PermGroup { group: string; permissions: { id: string; key: string; label: string; description?: string }[] }
interface AdminRow {
  id: string; email: string; name: string; isActive: boolean;
  role: { name: string; slug: string; level: number }; lastLoginAt: string | null; createdAt: string;
}

const field = 'w-full rounded-lg border border-field-line bg-field px-3 py-2 text-sm text-ink outline-none transition placeholder:text-field-ph focus:border-gold focus:ring-4 focus:ring-gold/15';

export default function AccessPage() {
  const qc = useQueryClient();
  const { admin, can } = useAdmin();
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [newRole, setNewRole] = useState({ name: '', description: '', level: 50 });
  const [newAdmin, setNewAdmin] = useState({ email: '', name: '', password: '', roleId: '' });

  const roles = useQuery({ queryKey: ['admin', 'roles'], queryFn: () => adminGet<Role[]>('/admin/roles') });
  const perms = useQuery({ queryKey: ['admin', 'permissions'], queryFn: () => adminGet<PermGroup[]>('/admin/permissions') });
  const admins = useQuery({ queryKey: ['admin', 'admins'], queryFn: () => adminGet<AdminRow[]>('/admin/admins'),
                            enabled: can('admins.view') });

  const role = roles.data?.find((r) => r.id === selected) ?? null;
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin'] });

  const pick = (r: Role) => { setSelected(r.id); setDraft(new Set(r.permissionIds)); };
  const toggle = (id: string) =>
    setDraft((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const keyOf = (id: string) =>
    perms.data?.flatMap((g) => g.permissions).find((p) => p.id === id)?.key ?? '';

  const saveRole = useMutation({
    mutationFn: () => adminPatch(`/admin/roles/${selected}`, {
      permissionKeys: [...draft].map(keyOf).filter(Boolean),
    }),
    onSuccess: () => { toast.success('Permissions saved — applies within 30 seconds, no re-login'); refresh(); },
    onError: (e) => toastError(e),
  });

  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string; adminCount: number } | null>(null);

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
    mutationFn: () => adminPost('/admin/roles', { ...newRole, permissionKeys: [] }),
    onSuccess: () => { toast.success('Role created'); setNewRole({ name: '', description: '', level: 50 }); refresh(); },
    onError: (e) => toastError(e),
  });

  const createAdmin = useMutation({
    mutationFn: () => adminPost('/admin/admins', newAdmin),
    onSuccess: () => { toast.success('Admin created'); setNewAdmin({ email: '', name: '', password: '', roleId: '' }); refresh(); },
    onError: (e) => toastError(e),
  });

  const toggleAdmin = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => adminPatch(`/admin/admins/${id}`, { isActive }),
    onSuccess: () => { toast.success('Admin updated'); refresh(); },
    onError: (e) => toastError(e),
  });

  const dirty = role && (draft.size !== role.permissionIds.length || [...draft].some((d) => !role.permissionIds.includes(d)));

  return (
    <div className="space-y-3.5">
      <PageHeader
        title="Roles & Access"
        subtitle="Admin accounts, roles and permission grants. Roles are data — create as many levels as you need without a deploy."
      />
      <p className="text-sm text-ink-2">
        Roles live in the database. Create as many admin levels as you need and grant each one exactly the
        capabilities it should have — no deploy, and the API enforces the same keys this screen shows.
        You can only manage roles less senior than your own ({admin?.role.name}, level {admin?.role.level}).
      </p>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <Panel title={`Roles — ${roles.data?.length ?? 0}`}>
            <div className="space-y-1.5">
              {(roles.data ?? []).map((r) => {
                const locked = (admin?.role.level ?? 999) >= r.level;
                return (
                  <button key={r.id} onClick={() => pick(r)}
                    className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
                      selected === r.id
                        ? 'border-violet bg-violet-soft'
                        : 'border-line hover:bg-canvas'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{r.name}</span>
                      <span className="font-mono text-[10px] text-ink-2">L{r.level}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-ink-2">
                      {r.permissionIds.length} permissions · {r.adminCount} admin{r.adminCount === 1 ? '' : 's'}
                    </p>
                    <div className="mt-1.5 flex gap-1">
                      {r.isSystem && <Badge tone="info">system</Badge>}
                      {locked && <Badge tone="warn">read-only</Badge>}
                    </div>
                  </button>
                );
              })}
            </div>
          </Panel>

          <ActiveSessions />

          {can('roles.manage') && (
            <Panel title="New role">
              <div className="space-y-2">
                <input className={field} placeholder="Role name" value={newRole.name}
                       onChange={(e) => setNewRole((s) => ({ ...s, name: e.target.value }))} />
                <input className={field} placeholder="Description" value={newRole.description}
                       onChange={(e) => setNewRole((s) => ({ ...s, description: e.target.value }))} />
                <label className="block">
                  <span className="text-[11px] text-ink-2">Seniority — higher number is more junior</span>
                  <input type="number" min={(admin?.role.level ?? 0) + 1} className={field} value={newRole.level}
                         onChange={(e) => setNewRole((s) => ({ ...s, level: Number(e.target.value) }))} />
                </label>
                <Button className="w-full" loading={createRole.isPending}
                        disabled={newRole.name.trim().length < 2}
                        onClick={() => createRole.mutate()}>Create role</Button>
              </div>
            </Panel>
          )}
        </div>

        <Panel
          title={role ? `Permissions — ${role.name}` : 'Permissions'}
          action={role && can('roles.manage') && (admin?.role.level ?? 999) < role.level ? (
            <div className="flex items-center gap-2">
              {/* a system role, or one that still has holders, cannot be deleted —
                  the API enforces both, so the button only offers what will work */}
              {!role.isSystem && (
                <Button variant="ghost" className="px-3 py-1.5 text-xs text-bad hover:bg-bad-soft hover:text-bad"
                        onClick={() => setConfirmDelete({ id: role.id, name: role.name, adminCount: role.adminCount })}>
                  Delete role
                </Button>
              )}
              <Button className="px-3 py-1.5 text-xs" loading={saveRole.isPending} disabled={!dirty}
                      onClick={() => saveRole.mutate()}>
                {dirty ? `Save ${draft.size} permissions` : 'Saved'}
              </Button>
            </div>
          ) : undefined}
        >
          {!role ? (
            <p className="py-10 text-center text-sm text-ink-2">Select a role to see and edit its permissions.</p>
          ) : (
            <div className="space-y-5">
              {role.description && <p className="text-sm text-ink-2">{role.description}</p>}
              {(perms.data ?? []).map((g) => (
                <div key={g.group}>
                  <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-ink-2">{g.group}</p>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {g.permissions.map((p) => {
                      const on = draft.has(p.id);
                      const editable = can('roles.manage') && (admin?.role.level ?? 999) < role.level && !role.isSystem;
                      return (
                        <label key={p.id}
                          className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 text-sm transition ${
                            on ? 'border-violet/40 bg-violet-soft'
                               : 'border-line'} ${editable ? 'cursor-pointer' : 'opacity-70'}`}>
                          <input type="checkbox" checked={on} disabled={!editable}
                                 onChange={() => toggle(p.id)} className="mt-0.5" />
                          <span>
                            <span className="block leading-tight">{p.label}</span>
                            <span className="font-mono text-[10px] text-ink-2">{p.key}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {can('admins.view') && (
        <Panel title={`Admin accounts — ${admins.data?.length ?? 0}`}>
          <Table head={['Name', 'Email', 'Role', 'Level', 'Status', 'Last login', '']}
            rows={(admins.data ?? []).map((a) => [
              a.name,
              <span key="e" className="text-xs">{a.email}</span>,
              a.role.name,
              <span key="l" className="font-mono tabular-nums">L{a.role.level}</span>,
              <Badge key="s" tone={a.isActive ? 'good' : 'bad'}>{a.isActive ? 'active' : 'disabled'}</Badge>,
              <span key="t" className="font-mono text-xs">{a.lastLoginAt ? shortDate(a.lastLoginAt) : 'never'}</span>,
              can('admins.manage') && a.id !== admin?.id ? (
                <Button key="b" variant="ghost" className="px-3 py-1 text-xs"
                        onClick={() => toggleAdmin.mutate({ id: a.id, isActive: !a.isActive })}>
                  {a.isActive ? 'Disable' : 'Enable'}
                </Button>
              ) : <span key="b" className="text-xs text-ink-3">—</span>,
            ])} />

          {can('admins.manage') && (
            <div className="mt-5 border-t border-line pt-5">
              <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-ink-2">Add an admin</p>
              <div className="grid gap-2 sm:grid-cols-4">
                <input className={field} placeholder="Name" value={newAdmin.name}
                       onChange={(e) => setNewAdmin((s) => ({ ...s, name: e.target.value }))} />
                <input className={field} placeholder="Email" type="email" value={newAdmin.email}
                       onChange={(e) => setNewAdmin((s) => ({ ...s, email: e.target.value }))} />
                <input className={field} placeholder="Password (min 8)" type="password" value={newAdmin.password}
                       onChange={(e) => setNewAdmin((s) => ({ ...s, password: e.target.value }))} />
                <select className={field} value={newAdmin.roleId}
                        onChange={(e) => setNewAdmin((s) => ({ ...s, roleId: e.target.value }))}>
                  <option value="">Select role…</option>
                  {(roles.data ?? []).filter((r) => (admin?.role.level ?? 999) < r.level)
                    .map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <Button className="mt-2" loading={createAdmin.isPending}
                      disabled={!newAdmin.email || !newAdmin.name || newAdmin.password.length < 8 || !newAdmin.roleId}
                      onClick={() => createAdmin.mutate()}>Create admin</Button>
            </div>
          )}
        </Panel>
      )}
      <ActionDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        pending={deleteRole.isPending}
        tone="danger"
        title={confirmDelete ? `Delete the ${confirmDelete.name} role?` : ''}
        body={confirmDelete
          ? confirmDelete.adminCount > 0
            ? `${confirmDelete.adminCount} admin${confirmDelete.adminCount === 1 ? '' : 's'} still hold this role. Reassign them first — the API will refuse the delete until then.`
            : 'The role and its permission grants are removed. Admin accounts are not affected because none hold it.'
          : undefined}
        confirmLabel="Delete role"
        onConfirm={() => confirmDelete && deleteRole.mutate(confirmDelete.id)}
      />
    </div>

  );
}
