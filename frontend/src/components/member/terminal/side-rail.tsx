'use client';

import Link from 'next/link';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { usd, num } from '@/lib/format';
import { Panel, Label, Figure } from './panel';

/**
 * The right rail: balances, rank, and the tape.
 *
 * Structurally this is the biggest change to the page. The old dashboard laid
 * eight equal-weight cards across a 12-column grid, so a member scanned left
 * to right through Rank Progress, Level Status, Invite & Earn and Recent
 * Activity as though they were equally urgent. They are not.
 *
 * Splitting into a wide working column and a narrow standing rail says which
 * is which: the left column is what you came to look at, the rail is what you
 * check on the way past. It is also what makes a dense layout readable — a
 * fixed-width rail gives the eye a stop.
 */

export function BalancesPanel({ wallets, loading }: {
  wallets?: { type: string; balance: string; available: string }[];
  loading?: boolean;
}) {
  const find = (t: string) => wallets?.find((w) => w.type === t);
  const rows = [
    { type: 'MAIN', label: 'Main', hint: 'withdrawable', color: 'var(--color-gold)' },
    { type: 'FUND', label: 'Fund', hint: 'for packages', color: 'var(--color-chart-1)' },
  ];

  return (
    <Panel title="Balances" meta="USDT · BEP-20" bodyClassName="p-0">
      <div className="divide-y divide-line-soft">
        {rows.map((r) => (
          <div key={r.type} className="flex items-center justify-between gap-3 px-3 py-2.5">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-4 w-[3px] shrink-0 rounded-[1px]" style={{ background: r.color }} />
              <span className="truncate text-[11.5px] text-ink">{r.label}</span>
              <span className="shrink-0 text-[10px] text-ink-3">{r.hint}</span>
            </span>
            <Figure size="md" value={loading ? '—' : usd(find(r.type)?.balance)} />
          </div>
        ))}
      </div>

      <div className="flex gap-1.5 border-t border-line p-2.5">
        <Link href="/deposit"
              className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[4px] bg-gold text-[11.5px] font-semibold text-gold-on transition-colors hover:bg-gold-hover">
          <ArrowDownLeft size={13} /> Deposit
        </Link>
        <Link href="/withdrawals"
              className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[4px] border border-line-strong text-[11.5px] font-medium text-ink transition-colors hover:border-gold hover:text-gold">
          <ArrowUpRight size={13} /> Withdraw
        </Link>
      </div>
    </Panel>
  );
}

export function RankPanel({ rank, team, loading }: {
  rank?: { current: { name: string; level: number } | null; next: { name: string; level: number; reward: string; selfCapital: string; teamBusiness: string; percent: number } | null };
  team?: { totalTeamBusiness: string; powerLegVolume: string; otherLegsVolume: string };
  loading?: boolean;
}) {
  const cur = rank?.current;
  const next = rank?.next;

  return (
    <Panel title="Rank" meta={cur ? `${cur.level} of 10` : '—'}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[14px] font-semibold text-ink">{loading ? '—' : cur?.name ?? 'Unranked'}</span>
        {next && <span className="shrink-0 text-[11px] text-ink-3">next · {next.name}</span>}
      </div>

      <div className="mt-2.5 h-[5px] overflow-hidden rounded-[2px] bg-card-2">
        <span className="block h-full rounded-[2px] bg-chart-4" style={{ width: `${Math.min(100, next?.percent ?? 0)}%` }} />
      </div>

      {next ? (
        <>
          <div className="mt-2.5 flex justify-between gap-3">
            <span>
              <Label>Self capital</Label>
              <span className="mt-1 block tabular-nums text-[11.5px] text-ink">{usd(next.selfCapital)}</span>
            </span>
            <span className="text-right">
              <Label>Team business</Label>
              <span className="mt-1 block tabular-nums text-[11.5px] text-ink">
                {usd(team?.totalTeamBusiness)} <span className="text-ink-3">/ {usd(next.teamBusiness)}</span>
              </span>
            </span>
          </div>
          <div className="mt-2.5 flex items-center justify-between border-t border-line pt-2.5">
            <span className="text-[11px] text-ink-2">Reward on promotion</span>
            <Figure size="md" value={usd(next.reward)} tone="accent" />
          </div>
        </>
      ) : (
        <p className="mt-2.5 text-[11px] leading-relaxed text-ink-3">
          Ranks unlock once a package is active and your team starts producing volume.
        </p>
      )}
    </Panel>
  );
}

export interface TapeEntry {
  id: string;
  createdAt: string;
  label: string;
  amount: string;
  direction: 'CREDIT' | 'DEBIT';
  category?: string;
}

const STREAM_COLOR: Record<string, string> = {
  DAILY_ROI:        'var(--color-chart-1)',
  DIRECT_BONUS: 'var(--color-chart-2)',
  GENERATION_BONUS: 'var(--color-chart-3)',
  RANK_BONUS:       'var(--color-chart-4)',
  ROAMING_CLUB: 'var(--color-chart-5)',
};

/**
 * The ledger tape.
 *
 * Replaces "Recent Activity", which rendered each entry as a three-line card
 * with an icon chip — six entries filled a panel and you could not compare
 * them. A tape is one 30px row per entry: time, stream, label, amount. Ten
 * fit where four did, and the amounts form a column you can read down.
 */
export function LedgerTape({ items, loading }: { items: TapeEntry[]; loading?: boolean }) {
  const time = (iso: string) => {
    const d = new Date(iso);
    const sameDay = d.toDateString() === new Date().toDateString();
    return sameDay
      ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  };

  return (
    <Panel
      title="Ledger"
      className="min-h-0 flex-1"
      bodyClassName="p-0 overflow-hidden"
      action={<Link href="/passbook" className="text-[10.5px] text-gold hover:text-gold-hi">Passbook →</Link>}
    >
      {loading ? (
        <div className="space-y-px p-2">
          {Array.from({ length: 6 }, (_, i) => <div key={i} className="h-[26px] animate-pulse rounded-[3px] bg-line-soft" />)}
        </div>
      ) : items.length === 0 ? (
        <p className="px-3 py-6 text-center text-[11.5px] text-ink-3">
          Nothing posted yet. Every credit and debit lands here with its reference.
        </p>
      ) : (
        <ul>
          {items.map((e) => (
            <li key={e.id} className="flex items-center gap-2 border-b border-line-soft px-3 last:border-0" style={{ height: 30 }}>
              <span className="w-[38px] shrink-0 tabular-nums text-[9.5px] text-ink-3">{time(e.createdAt)}</span>
              <span className="size-[5px] shrink-0 rounded-[1px]"
                    style={{ background: STREAM_COLOR[e.category ?? ''] ?? 'var(--color-ink-4)' }} />
              <span className="min-w-0 flex-1 truncate text-[11px] text-ink-2">{e.label}</span>
              <span className={`shrink-0 tabular-nums text-[11.5px] ${e.direction === 'CREDIT' ? 'text-good' : 'text-bad'}`}>
                {e.direction === 'CREDIT' ? '+' : '−'}{num(Math.abs(Number(e.amount)).toFixed(2))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
