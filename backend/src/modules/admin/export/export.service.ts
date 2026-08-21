import type { Response } from 'express';
import { prisma } from '../../../core/db.js';
import { badRequest } from '../../../core/errors.js';

/**
 * CSV export for the admin lists.
 *
 * Operators reconcile against spreadsheets; until now the only way to get data
 * out of the console was to read it off the screen a page at a time.
 *
 * Rows are fetched in batches and written straight to the response, so a large
 * export never materialises the whole result set in memory. Each resource
 * declares its own columns rather than dumping raw model shapes — an export is
 * a document someone reads, not a database dump.
 */

const BATCH = 500;
/** A hard stop, so one click cannot pull a million rows through the API. */
const MAX_ROWS = 50_000;

/** RFC 4180 quoting, plus the leading-quote guard against formula injection. */
function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = value instanceof Date ? value.toISOString() : String(value);
  // Excel and Sheets execute a leading =, +, - or @ as a formula.
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const line = (values: unknown[]) => `${values.map(cell).join(',')}\r\n`;

interface Resource {
  filename: string;
  columns: string[];
  fetch: (skip: number, take: number, q: Record<string, unknown>) => Promise<unknown[][]>;
}

const money = (v: { toString(): string } | null | undefined) => (v ? v.toString() : '0');

export const RESOURCES: Record<string, Resource> = {
  users: {
    filename: 'members',
    columns: ['Member ID', 'Name', 'Email', 'Status', 'Cap mode', 'Invested', 'Earned', 'Directs', 'Team size', 'Team business', 'Rank', 'Joined'],
    fetch: async (skip, take, q) => {
      const rows = await prisma.user.findMany({
        where: {
          ...(q.status ? { status: q.status as never } : {}),
          ...(q.q ? { OR: [{ email: { contains: String(q.q), mode: 'insensitive' as const } },
                           { userCode: { contains: String(q.q).toUpperCase() } }] } : {}),
        },
        orderBy: { createdAt: 'desc' }, skip, take,
        include: { currentRank: { select: { name: true } }, teamVolume: { select: { totalTeamBusiness: true, teamSize: true } } },
      });
      return rows.map((u) => [
        u.userCode, [u.firstName, u.lastName].filter(Boolean).join(' '), u.email, u.status, u.affiliateMode,
        money(u.totalInvested), money(u.totalEarned), u.directCount,
        u.teamVolume?.teamSize ?? 0, money(u.teamVolume?.totalTeamBusiness),
        u.currentRank?.name ?? '', u.createdAt,
      ]);
    },
  },

  transactions: {
    filename: 'ledger',
    columns: ['Date', 'Member ID', 'Email', 'Wallet', 'Direction', 'Category', 'Amount', 'Balance after', 'Reference', 'Description'],
    fetch: async (skip, take, q) => {
      const rows = await prisma.ledgerEntry.findMany({
        where: {
          ...(q.category ? { category: q.category as never } : {}),
          ...(q.q ? { user: { userCode: { contains: String(q.q).toUpperCase() } } } : {}),
        },
        orderBy: { createdAt: 'desc' }, skip, take,
        include: { user: { select: { userCode: true, email: true } }, wallet: { select: { type: true } } },
      });
      return rows.map((r) => [
        r.createdAt, r.user.userCode, r.user.email, r.wallet.type, r.direction, r.category,
        money(r.amount), money(r.balanceAfter), r.reference, r.description ?? '',
      ]);
    },
  },

  commissions: {
    filename: 'commissions',
    columns: ['Date', 'Earner', 'From', 'Stream', 'Level', 'Rate %', 'Base amount', 'Intended', 'Paid', 'Status'],
    fetch: async (skip, take, q) => {
      const rows = await prisma.commission.findMany({
        where: q.kind ? { kind: q.kind as never } : {},
        orderBy: { createdAt: 'desc' }, skip, take,
        include: { user: { select: { userCode: true } }, fromUser: { select: { userCode: true } } },
      });
      return rows.map((c) => [
        c.createdAt, c.user.userCode, c.fromUser.userCode, c.kind, c.level,
        money(c.percent), money(c.baseAmount), money(c.amount), money(c.paidAmount), c.status,
      ]);
    },
  },

  investments: {
    filename: 'investments',
    columns: ['Started', 'Member ID', 'Plan', 'Amount', 'Daily %', 'Cap limit', 'Earned', 'Status'],
    fetch: async (skip, take, q) => {
      const rows = await prisma.investment.findMany({
        where: q.status ? { status: q.status as never } : {},
        orderBy: { createdAt: 'desc' }, skip, take,
        include: { user: { select: { userCode: true } }, package: { select: { name: true } } },
      });
      return rows.map((i) => [
        i.startedAt, i.user.userCode, i.package.name, money(i.amount),
        money(i.dailyRoiPercent), money(i.capLimit), money(i.totalEarned), i.status,
      ]);
    },
  },

  withdrawals: {
    filename: 'withdrawals',
    columns: ['Requested', 'Member ID', 'Email', 'Amount', 'Fee', 'Net', 'Address', 'Status', 'Tx hash', 'SLA due', 'Processed', 'Reject reason'],
    fetch: async (skip, take, q) => {
      const rows = await prisma.withdrawal.findMany({
        where: q.status ? { status: q.status as never } : {},
        orderBy: { createdAt: 'desc' }, skip, take,
        include: { user: { select: { userCode: true, email: true } } },
      });
      return rows.map((w) => [
        w.createdAt, w.user.userCode, w.user.email, money(w.amount), money(w.fee), money(w.netAmount),
        w.walletAddress, w.status, w.txHash ?? '', w.slaDueAt, w.processedAt ?? '', w.rejectReason ?? '',
      ]);
    },
  },

  deposits: {
    filename: 'deposits',
    columns: ['Date', 'Member ID', 'Email', 'Amount', 'Network', 'Tx hash', 'Reference', 'Status', 'Confirmed'],
    fetch: async (skip, take, q) => {
      const rows = await prisma.deposit.findMany({
        where: q.status ? { status: q.status as never } : {},
        orderBy: { createdAt: 'desc' }, skip, take,
        include: { user: { select: { userCode: true, email: true } } },
      });
      return rows.map((d) => [
        d.createdAt, d.user.userCode, d.user.email, money(d.amount), d.network,
        d.txHash ?? '', d.reference, d.status, d.confirmedAt ?? '',
      ]);
    },
  },

  audit: {
    filename: 'audit-log',
    columns: ['When', 'Operator', 'Role', 'Action', 'Entity', 'Entity ID', 'Summary', 'IP'],
    fetch: async (skip, take, q) => {
      const rows = await prisma.auditLog.findMany({
        where: {
          ...(q.action ? { action: q.action as never } : {}),
          ...(q.entityType ? { entityType: String(q.entityType) } : {}),
          ...(q.adminId ? { adminId: String(q.adminId) } : {}),
        },
        orderBy: { createdAt: 'desc' }, skip, take,
        include: { admin: { select: { name: true, role: { select: { name: true } } } } },
      });
      return rows.map((r) => [
        r.createdAt, r.admin.name, r.admin.role.name, r.action, r.entityType,
        r.entityId ?? '', r.summary, r.ip ?? '',
      ]);
    },
  },
};

/** The permission each export needs — the same one that guards its screen. */
export const RESOURCE_PERMISSION: Record<string, string> = {
  users: 'users.view',
  transactions: 'users.view',
  commissions: 'users.view',
  investments: 'users.view',
  withdrawals: 'withdrawals.view',
  deposits: 'deposits.view',
  audit: 'audit.view',
};

export async function stream(resource: string, query: Record<string, unknown>, res: Response) {
  const spec = RESOURCES[resource];
  if (!spec) throw badRequest(`Nothing to export called "${resource}"`);

  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="fortunex-${spec.filename}-${stamp}.csv"`);
  res.setHeader('Cache-Control', 'private, no-store');

  // BOM so Excel opens UTF-8 correctly on Windows.
  res.write('﻿');
  res.write(line(spec.columns));

  let skip = 0;
  let written = 0;
  for (;;) {
    const batch = await spec.fetch(skip, Math.min(BATCH, MAX_ROWS - written), query);
    if (!batch.length) break;
    for (const row of batch) res.write(line(row));
    written += batch.length;
    skip += batch.length;
    if (batch.length < BATCH || written >= MAX_ROWS) break;
  }

  // Say so in the file itself rather than truncating silently.
  if (written >= MAX_ROWS) res.write(line([`Truncated at ${MAX_ROWS} rows — narrow the filters and export again`]));
  res.end();
  return written;
}
