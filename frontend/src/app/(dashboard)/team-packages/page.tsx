'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Package } from 'lucide-react';
import { clsx } from 'clsx';
import { get } from '@/lib/api';
import { Card, CardHead, Table, Badge, Metric, Skeleton, Button } from '@/components/ui/primitives';
import { Pagination } from '@/components/ui/pagination';
import { usd, shortDate } from '@/lib/format';

interface Row {
  id: string; level: number; userCode: string; name: string;
  sponsorCode: string; sponsorName: string;
  packageName: string; amount: string; earned: string;
  status: string; purchasedAt: string;
}
interface Payload { total: number; totalValue: string; activeCount: number; rows: Row[] }

const LEVELS = Array.from({ length: 30 }, (_, i) => i + 1);

/**
 * Every package bought anywhere in the downline.
 *
 * Team volume answers "how much"; this answers "who, and when" — which is the
 * question a member actually has while watching their network grow, and one an
 * aggregate cannot answer.
 */
export default function TeamPackagesPage() {
  const [level, setLevel] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(25);

  const data = useQuery<Payload>({
    queryKey: ['member', 'team-packages', level, page, size],
    queryFn: () => get('/team/packages', {
      ...(level ? { level } : {}),
      take: size,
      skip: page * size,
    }),
  });

  const rows = data.data?.rows ?? [];

  /** Exported client-side — the rows are already here, so a round trip buys nothing. */
  const exportCsv = () => {
    const head = ['Level', 'User ID', 'Name', 'Sponsor ID', 'Sponsor', 'Package', 'Value', 'Earned', 'Status', 'Purchased'];
    const body = rows.map((r) => [
      r.level, r.userCode, r.name, r.sponsorCode, r.sponsorName,
      r.packageName, r.amount, r.earned, r.status, new Date(r.purchasedAt).toISOString().slice(0, 10),
    ]);
    const csv = [head, ...body]
      // Quote everything and double any inner quotes — a member's name with a
      // comma in it must not shift every following column.
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `team-packages${level ? `-level-${level}` : ''}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Package records" value={data.data?.total ?? 0} />
        <Metric label="Total value" value={usd(Number(data.data?.totalValue ?? 0))} />
        <Metric label="Still active" value={data.data?.activeCount ?? 0} />
      </div>

      <Card>
        <CardHead
          title="Filter by level"
          subtitle="All thirty generation levels, or one at a time."
        />
        <div className="px-5 pb-5">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => { setLevel(null); setPage(0); }}
              className={clsx(
                'h-9 rounded-[4px] border px-3 text-[12px] font-medium transition',
                level === null
                  ? 'border-violet bg-violet text-white'
                  : 'border-line bg-card text-ink-2 hover:border-violet/40 hover:text-ink',
              )}
            >
              All levels
            </button>
            {LEVELS.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => { setLevel(l); setPage(0); }}
                className={clsx(
                  'h-9 w-9 rounded-[4px] border text-[12px] font-medium tabular-nums transition',
                  level === l
                    ? 'border-violet bg-violet text-white'
                    : 'border-line bg-card text-ink-2 hover:border-violet/40 hover:text-ink',
                )}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <CardHead
          title={level ? `Level ${level} purchases` : 'All downline purchases'}
          subtitle="Newest first."
          right={
            <Button variant="outline" onClick={exportCsv} disabled={!rows.length}>
              <Download size={14} /> Export this page
            </Button>
          }
        />
        {data.isLoading ? (
          <div className="px-5 pb-5"><Skeleton className="h-48" /></div>
        ) : !rows.length ? (
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-canvas text-ink-3">
              <Package size={19} />
            </span>
            <p className="text-[14px] font-medium text-ink">
              {level ? `Nobody at level ${level} has bought a package yet` : 'No purchases in your team yet'}
            </p>
            <p className="max-w-sm text-[12.5px] leading-relaxed text-ink-2">
              Every package bought by anyone below you appears here, with the level they sit on.
            </p>
          </div>
        ) : (
          <>
            <Table
              head={['Level', 'Member', 'Sponsor', 'Package', 'Value', 'Earned', 'Status', 'Purchased']}
              rows={rows.map((r) => [
                <span key="l" className="tabular-nums text-ink-2">L{r.level}</span>,
                <div key="m">
                  <p className="text-[13px] font-medium text-ink">{r.name}</p>
                  <p className="font-mono text-[11px] text-ink-3">{r.userCode}</p>
                </div>,
                <div key="s">
                  <p className="text-[12.5px] text-ink-2">{r.sponsorName}</p>
                  <p className="font-mono text-[11px] text-ink-3">{r.sponsorCode}</p>
                </div>,
                r.packageName,
                <span key="v" className="tabular-nums font-medium">{usd(Number(r.amount))}</span>,
                <span key="e" className="tabular-nums text-ink-2">{usd(Number(r.earned))}</span>,
                <Badge key="st" tone={r.status === 'ACTIVE' ? 'good' : r.status === 'CAPPED' ? 'warn' : 'neutral'}>
                  {r.status}
                </Badge>,
                shortDate(r.purchasedAt),
              ])}
            />
            <Pagination
              total={data.data?.total ?? 0}
              page={page}
              pageSize={size}
              onPage={setPage}
              onPageSize={setSize}
              sizes={[25, 50, 100]}
            />
          </>
        )}
      </Card>
    </div>
  );
}
