'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { adminGet } from '@/lib/admin-api';
import { Card, CardHead, PageHeader, Table, Badge, Select, controlCls, type Tone } from '@/components/ui/primitives';
import { ExportButton } from '@/components/admin/export-button';
import { Pagination } from '@/components/ui/pagination';
import { num, titleCase } from '@/lib/format';

interface Row {
  id: string; action: string; entityType: string; entityId: string | null;
  summary: string; admin: { name: string; email: string; role: string };
  ip: string | null; createdAt: string;
}
interface Facets {
  entityTypes: { value: string; count: number }[];
  admins: { id: string; name: string; count: number }[];
}

const ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'CREDIT', 'DEBIT', 'STATUS_CHANGE', 'SETTING_CHANGE', 'LOGIN'];

const actionTone = (a: string): Tone =>
  a === 'CREDIT' || a === 'APPROVE' || a === 'CREATE' ? 'good'
  : a === 'DEBIT' || a === 'REJECT' || a === 'DELETE' ? 'bad'
  : a === 'STATUS_CHANGE' || a === 'SETTING_CHANGE' ? 'warn'
  : 'neutral';

/** Local midnight, N days back, in the ISO form the API parses. */
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

export default function AuditPage() {
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [adminId, setAdminId] = useState('');
  const [within, setWithin] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(50);

  const on = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(0); };

  const facets = useQuery({ queryKey: ['admin', 'audit-facets'], queryFn: () => adminGet<Facets>('/admin/audit/facets') });

  const { data } = useQuery({
    queryKey: ['admin', 'audit', action, entityType, adminId, within, q, page, size],
    queryFn: () => adminGet<{ total: number; rows: Row[] }>('/admin/audit', {
      take: size, skip: page * size,
      action: action || undefined,
      entityType: entityType || undefined,
      adminId: adminId || undefined,
      from: within ? daysAgo(Number(within)) : undefined,
      q: q || undefined,
    }),
  });

  return (
    <>
      <PageHeader
        title="Audit Log"
        subtitle="Append-only. Every mutating action records the operator, a before/after snapshot and the origin IP — there is no update or delete path."
      />
      <Card>
        <CardHead
          title={`${num(data?.total ?? 0)} recorded actions`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Select label="Filter by time period" value={within} onChange={on(setWithin)} className="h-9 text-[12.5px]"
                      options={[
                        { value: '', label: 'All time' },
                        { value: '1', label: 'Today' },
                        { value: '7', label: 'Last 7 days' },
                        { value: '30', label: 'Last 30 days' },
                      ]} />
              <Select label="Filter by action" value={action} onChange={on(setAction)} className="h-9 text-[12.5px]"
                      options={[{ value: '', label: 'All actions' }, ...ACTIONS.map((a) => ({ value: a, label: titleCase(a) }))]} />
              {/* the entity and operator lists come from what has actually been
                  recorded, so they never offer a filter that returns nothing */}
              <Select label="Filter by entity type" value={entityType} onChange={on(setEntityType)} className="h-9 text-[12.5px]"
                      options={[{ value: '', label: 'All entities' },
                                ...(facets.data?.entityTypes ?? []).map((e) => ({ value: e.value, label: `${titleCase(e.value)} (${e.count})` }))]} />
              <Select label="Filter by operator" value={adminId} onChange={on(setAdminId)} className="h-9 text-[12.5px]"
                      options={[{ value: '', label: 'All operators' },
                                ...(facets.data?.admins ?? []).map((a) => ({ value: a.id, label: `${a.name} (${a.count})` }))]} />
              <label className="relative flex items-center">
                <Search size={15} className="pointer-events-none absolute left-3 text-ink-3" />
                <input value={q} onChange={(e) => on(setQ)(e.target.value)} placeholder="Search summary"
                       className={`${controlCls} h-9 w-48 pl-9 text-[12.5px]`} />
              </label>
              <ExportButton resource="audit" filters={{ action: action || undefined, entityType: entityType || undefined, adminId: adminId || undefined }} />
            </div>
          }
        />
        <Table
          head={['When', 'Operator', 'Role', 'Action', 'Entity', 'Summary', 'IP']}
          empty="No admin actions match these filters."
          rows={(data?.rows ?? []).map((r) => [
            <span key="a" className="whitespace-nowrap text-ink-2">
              {new Date(r.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>,
            <span key="b" className="font-medium">{r.admin.name}</span>,
            <Badge key="c">{r.admin.role}</Badge>,
            <Badge key="d" tone={actionTone(r.action)}>{titleCase(r.action)}</Badge>,
            <span key="e" className="text-ink-2">{titleCase(r.entityType)}</span>,
            <span key="f" className="max-w-[420px] truncate" title={r.summary}>{r.summary}</span>,
            <span key="g" className="tabular-nums text-ink-3">{r.ip ?? '—'}</span>,
          ])}
        />
        <Pagination total={data?.total ?? 0} page={page} pageSize={size} onPage={setPage} onPageSize={setSize} />
      </Card>
    </>
  );
}
