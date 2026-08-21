import type { AuditAction, Prisma } from '@prisma/client';
import type { Request } from 'express';
import { prisma, type Tx } from '../../../core/db.js';

/**
 * Every mutating admin action writes one row here. Append-only — there is no
 * update or delete path, so an operator cannot erase their own trail.
 */
export interface AuditInput {
  adminId: string;
  action: AuditAction;
  entityType: string;
  entityId?: string;
  summary: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  req?: Request;
}

export async function record(input: AuditInput, db: Tx = prisma) {
  return db.auditLog.create({
    data: {
      adminId: input.adminId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      summary: input.summary,
      before: input.before,
      after: input.after,
      ip: input.req?.ip,
      userAgent: input.req?.headers['user-agent']?.slice(0, 300),
    },
  });
}

export interface AuditQuery {
  take?: number;
  skip?: number;
  adminId?: string;
  entityType?: string;
  entityId?: string;
  action?: AuditAction;
  /** Inclusive lower bound on createdAt. */
  from?: Date;
  /** Exclusive upper bound on createdAt. */
  to?: Date;
  q?: string;
}

export async function list(opts: AuditQuery) {
  const where: Prisma.AuditLogWhereInput = {
    ...(opts.adminId ? { adminId: opts.adminId } : {}),
    ...(opts.entityType ? { entityType: opts.entityType } : {}),
    ...(opts.entityId ? { entityId: opts.entityId } : {}),
    ...(opts.action ? { action: opts.action } : {}),
    ...(opts.from || opts.to
      ? { createdAt: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lt: opts.to } : {}) } }
      : {}),
    ...(opts.q ? { summary: { contains: opts.q, mode: 'insensitive' } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where, orderBy: { createdAt: 'desc' },
      take: opts.take ?? 50, skip: opts.skip ?? 0,
      include: { admin: { select: { name: true, email: true, role: { select: { name: true, slug: true } } } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    total,
    rows: rows.map((r) => ({
      id: r.id, action: r.action, entityType: r.entityType, entityId: r.entityId,
      summary: r.summary, before: r.before, after: r.after,
      admin: { name: r.admin.name, email: r.admin.email, role: r.admin.role.name }, ip: r.ip, createdAt: r.createdAt,
    })),
  };
}

/**
 * The values worth filtering by, derived from what has actually been recorded.
 * Served alongside the log so the console can offer real choices rather than a
 * hardcoded list that drifts from the data — and so an operator who can read
 * the audit log does not also need permission to list admin accounts.
 */
export async function facets() {
  const [entityTypes, admins] = await Promise.all([
    prisma.auditLog.groupBy({ by: ['entityType'], _count: { _all: true }, orderBy: { entityType: 'asc' } }),
    prisma.auditLog.groupBy({ by: ['adminId'], _count: { _all: true } }),
  ]);

  const adminRows = admins.length
    ? await prisma.adminUser.findMany({
        where: { id: { in: admins.map((a) => a.adminId) } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      })
    : [];

  return {
    entityTypes: entityTypes.map((e) => ({ value: e.entityType, count: e._count._all })),
    admins: adminRows.map((a) => ({
      id: a.id, name: a.name,
      count: admins.find((x) => x.adminId === a.id)?._count._all ?? 0,
    })),
  };
}
