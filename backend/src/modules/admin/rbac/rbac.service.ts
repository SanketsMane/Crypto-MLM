import type { Request } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../../../core/db.js';
import { logger } from '../../../core/logger.js';
import { badRequest, conflict, forbidden, notFound } from '../../../core/errors.js';
import { invalidateAdmin, outranks } from '../../../middleware/admin-auth.js';
import * as audit from '../audit/audit.service.js';
import { revokeAllFor } from '../../../core/sessions.js';
import { notifyAdmins } from '../../../core/notify.js';
import { PERMISSIONS, DEFAULT_ROLES } from './permissions.js';

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ─────────── permissions catalogue ───────────

export async function permissionCatalogue() {
  const rows = await prisma.permission.findMany({ orderBy: [{ group: 'asc' }, { key: 'asc' }] });
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!groups.has(r.group)) groups.set(r.group, []);
    groups.get(r.group)!.push(r);
  }
  return [...groups.entries()].map(([group, items]) => ({
    group,
    permissions: items.map((i) => ({ id: i.id, key: i.key, label: i.label, description: i.description })),
  }));
}

// ─────────── roles ───────────

export async function listRoles() {
  const roles = await prisma.adminRole.findMany({
    orderBy: { level: 'asc' },
    include: { permissions: { select: { permissionId: true } }, _count: { select: { admins: true } } },
  });
  return roles.map((r) => ({
    id: r.id, name: r.name, slug: r.slug, description: r.description,
    level: r.level, isSystem: r.isSystem,
    permissionIds: r.permissions.map((p) => p.permissionId),
    adminCount: r._count.admins,
  }));
}

export async function createRole(
  actor: { id: string; roleLevel: number },
  input: { name: string; description?: string; level: number; permissionKeys: string[] },
  req?: Request,
) {
  if (!outranks(actor.roleLevel, input.level)) {
    throw forbidden('You cannot create a role at or above your own seniority');
  }
  const slug = slugify(input.name);
  if (!slug) throw badRequest('Role name is required');
  if (await prisma.adminRole.findUnique({ where: { slug } })) throw conflict('A role with that name already exists');

  const perms = await prisma.permission.findMany({ where: { key: { in: input.permissionKeys } }, select: { id: true } });

  const role = await prisma.adminRole.create({
    data: {
      name: input.name, slug, description: input.description, level: input.level,
      permissions: { create: perms.map((p) => ({ permissionId: p.id })) },
    },
  });

  await audit.record({
    adminId: actor.id, action: 'CREATE', entityType: 'admin_role', entityId: role.id,
    summary: `Created role "${role.name}" (level ${role.level}) with ${perms.length} permissions`,
    after: { name: role.name, level: role.level, permissions: input.permissionKeys }, req,
  });
  return role;
}

export async function updateRole(
  actor: { id: string; roleLevel: number },
  roleId: string,
  input: { name?: string; description?: string; level?: number; permissionKeys?: string[] },
  req?: Request,
) {
  const role = await prisma.adminRole.findUnique({
    where: { id: roleId },
    include: { permissions: { include: { permission: { select: { key: true } } } } },
  });
  if (!role) throw notFound('Role not found');
  if (!outranks(actor.roleLevel, role.level)) throw forbidden('You cannot modify a role at or above your own seniority');
  if (role.isSystem && input.level !== undefined && input.level !== role.level) {
    throw badRequest('A system role’s seniority cannot be changed');
  }

  const beforeKeys = role.permissions.map((p) => p.permission.key).sort();

  const updated = await prisma.$transaction(async (tx) => {
    const r = await tx.adminRole.update({
      where: { id: roleId },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.level !== undefined && !role.isSystem ? { level: input.level } : {}),
      },
    });

    if (input.permissionKeys) {
      if (role.isSystem && input.permissionKeys.length < PERMISSIONS.length) {
        throw badRequest('The owner role must retain every permission');
      }
      const perms = await tx.permission.findMany({ where: { key: { in: input.permissionKeys } }, select: { id: true } });
      await tx.rolePermission.deleteMany({ where: { roleId } });
      await tx.rolePermission.createMany({ data: perms.map((p) => ({ roleId, permissionId: p.id })) });
    }
    return r;
  });

  // grants changed — every admin holding this role must be re-read
  invalidateAdmin();

  await audit.record({
    adminId: actor.id, action: 'UPDATE', entityType: 'admin_role', entityId: roleId,
    summary: `Updated role "${updated.name}"${input.permissionKeys ? ` — ${input.permissionKeys.length} permissions` : ''}`,
    before: { name: role.name, level: role.level, permissions: beforeKeys },
    after: { name: updated.name, level: updated.level, permissions: input.permissionKeys?.sort() ?? beforeKeys },
    req,
  });
  return updated;
}

export async function deleteRole(actor: { id: string; roleLevel: number }, roleId: string, req?: Request) {
  const role = await prisma.adminRole.findUnique({ where: { id: roleId }, include: { _count: { select: { admins: true } } } });
  if (!role) throw notFound('Role not found');
  if (role.isSystem) throw badRequest('System roles cannot be deleted');
  if (!outranks(actor.roleLevel, role.level)) throw forbidden('You cannot delete a role at or above your own seniority');
  if (role._count.admins > 0) throw badRequest(`${role._count.admins} admin(s) still hold this role — reassign them first`);

  await prisma.adminRole.delete({ where: { id: roleId } });
  invalidateAdmin();
  await audit.record({
    adminId: actor.id, action: 'DELETE', entityType: 'admin_role', entityId: roleId,
    summary: `Deleted role "${role.name}"`, before: { name: role.name, level: role.level }, req,
  });
  return { id: roleId };
}

// ─────────── admin accounts ───────────

export async function listAdmins() {
  const rows = await prisma.adminUser.findMany({
    orderBy: { createdAt: 'asc' },
    include: { role: { select: { name: true, slug: true, level: true } } },
  });
  return rows.map((a) => ({
    id: a.id, email: a.email, name: a.name, isActive: a.isActive,
    role: a.role, lastLoginAt: a.lastLoginAt, createdAt: a.createdAt,
  }));
}

export async function createAdmin(
  actor: { id: string; roleLevel: number },
  input: { email: string; name: string; password: string; roleId: string },
  req?: Request,
) {
  const role = await prisma.adminRole.findUnique({ where: { id: input.roleId } });
  if (!role) throw notFound('Role not found');
  if (!outranks(actor.roleLevel, role.level)) throw forbidden('You cannot assign a role at or above your own seniority');
  if (await prisma.adminUser.findUnique({ where: { email: input.email } })) throw conflict('That email is already registered');

  const admin = await prisma.adminUser.create({
    data: { email: input.email, name: input.name, roleId: input.roleId, passwordHash: await bcrypt.hash(input.password, 12) },
    include: { role: { select: { name: true } } },
  });

  await audit.record({
    adminId: actor.id, action: 'CREATE', entityType: 'admin_user', entityId: admin.id,
    summary: `Created admin ${admin.email} as ${admin.role.name}`,
    after: { email: admin.email, role: admin.role.name }, req,
  });
  return { id: admin.id, email: admin.email, name: admin.name, role: admin.role.name };
}

export async function updateAdmin(
  actor: { id: string; roleLevel: number },
  adminId: string,
  input: { name?: string; roleId?: string; isActive?: boolean; password?: string },
  req?: Request,
) {
  const target = await prisma.adminUser.findUnique({ where: { id: adminId }, include: { role: true } });
  if (!target) throw notFound('Admin not found');
  if (!outranks(actor.roleLevel, target.role.level) && target.id !== actor.id) {
    throw forbidden('You cannot modify an admin at or above your own seniority');
  }
  if (target.id === actor.id && input.isActive === false) throw badRequest('You cannot deactivate your own account');

  if (input.roleId) {
    const next = await prisma.adminRole.findUnique({ where: { id: input.roleId } });
    if (!next) throw notFound('Role not found');
    if (!outranks(actor.roleLevel, next.level)) throw forbidden('You cannot assign a role at or above your own seniority');
  }

  const updated = await prisma.adminUser.update({
    where: { id: adminId },
    data: {
      ...(input.name ? { name: input.name } : {}),
      ...(input.roleId ? { roleId: input.roleId } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.password ? { passwordHash: await bcrypt.hash(input.password, 12) } : {}),
    },
    include: { role: { select: { name: true } } },
  });
  invalidateAdmin(adminId);

  await audit.record({
    adminId: actor.id, action: 'UPDATE', entityType: 'admin_user', entityId: adminId,
    summary: `Updated admin ${updated.email}${input.roleId ? ` — role now ${updated.role.name}` : ''}${input.password ? ' — password reset' : ''}`,
    before: { role: target.role.name, isActive: target.isActive },
    after: { role: updated.role.name, isActive: updated.isActive }, req,
  });
  // Deactivating an admin has to end their console sessions too, or they keep
  // their access until the token expires. A password reset ends them for the
  // same reason: the usual cause is a suspected compromise, and the point of
  // the reset is to lock out whoever else had the old one.
  if (input.isActive === false) await revokeAllFor('ADMIN', updated.id, 'ADMIN_DEACTIVATED');
  else if (input.password) await revokeAllFor('ADMIN', updated.id, 'PASSWORD_RESET');

  // Who can reach the console is the most consequential thing that changes here.
  notifyAdmins({
    type: 'system.admin_changed',
    dedupeKey: `admin-changed:${updated.id}:${updated.updatedAt.getTime()}`,
    title: input.isActive === false ? 'Operator deactivated' : 'Operator account changed',
    body: `${updated.email}${input.roleId ? ` — role is now ${updated.role.name}` : ''}${input.password ? ' — password was reset' : ''}${input.isActive === false ? ' — access revoked' : ''}.`,
    meta: { adminId: updated.id, email: updated.email },
    exceptAdminId: actor.id,
  });

  return { id: updated.id, email: updated.email, name: updated.name, role: updated.role.name, isActive: updated.isActive };
}

/**
 * Brings the permission table in line with the code, at boot.
 *
 * Without this, adding a permission key is a code change that silently does
 * nothing: the route starts refusing everyone, including the Super Admin, and
 * the only clue is a 403 nobody can explain. That is exactly what happened when
 * announcements were added.
 *
 * Two rules keep it safe:
 *
 *   • **New keys are granted only to roles the code defines as holding
 *     everything** — the Super Admin. A permission silently appearing on
 *     Operations Manager would be a privilege escalation performed by a deploy.
 *   • **Nothing is ever revoked.** A key removed from the code leaves its rows
 *     alone, because an operator may have granted it deliberately and a deploy
 *     is not the place to take access away.
 */
export async function syncPermissions() {
  // Upsert the catalogue itself.
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: p.key },
      create: { key: p.key, group: p.group, label: p.label, description: p.description },
      update: { group: p.group, label: p.label, description: p.description },
    });
  }

  const all = await prisma.permission.findMany({ select: { id: true, key: true } });
  const byKey = new Map(all.map((p) => [p.key, p.id]));

  // Roles the code says hold everything get anything they are missing.
  const fullAccess = DEFAULT_ROLES.filter((r) => r.permissions.length === PERMISSIONS.length);
  let granted = 0;

  for (const def of fullAccess) {
    const role = await prisma.adminRole.findUnique({
      where: { slug: def.slug },
      select: { id: true, permissions: { select: { permission: { select: { key: true } } } } },
    });
    if (!role) continue;

    const held = new Set(role.permissions.map((rp) => rp.permission.key));
    const missing = PERMISSIONS.filter((p) => !held.has(p.key));
    if (!missing.length) continue;

    await prisma.rolePermission.createMany({
      data: missing.map((p) => ({ roleId: role.id, permissionId: byKey.get(p.key)! })),
      skipDuplicates: true,
    });
    granted += missing.length;
    logger.info(
      { role: def.slug, granted: missing.map((p) => p.key) },
      'new permissions granted to a full-access role',
    );
  }

  if (granted) invalidateAdmin();
  return { permissions: PERMISSIONS.length, granted };
}