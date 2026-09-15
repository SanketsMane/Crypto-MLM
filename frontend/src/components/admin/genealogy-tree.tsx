'use client';

import { useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { ChevronDown, ChevronRight, User } from 'lucide-react';
import { usd, num, shortDate } from '@/lib/format';

export interface TreeNode {
  id: string; userCode: string; name: string; status: string;
  depth: number; relativeLevel: number;
  totalInvested: string; directCount: number;
  joinedAt: string;
  children: TreeNode[];
}

const statusDot = (s: string) =>
  s === 'ACTIVE' ? 'bg-good' : s === 'PENDING' ? 'bg-warn' : s === 'SUSPENDED' ? 'bg-warn' : 'bg-bad';

/**
 * One branch of the genealogy.
 *
 * Rows are indented by their level rather than nested in the DOM, so a deep
 * branch does not build a deep element tree, and each row stays a single
 * clickable line. Branches start collapsed below the first two levels — an
 * operator opens the part of the network they are actually asking about.
 */
function Branch({ node, isLast, prefixLines }: { node: TreeNode; isLast: boolean; prefixLines: boolean[] }) {
  const [open, setOpen] = useState(node.relativeLevel <= 1);
  const hasChildren = node.children.length > 0;
  const undrawn = node.directCount - node.children.length;

  return (
    <>
      <div className="group flex items-center gap-2 border-b border-line-soft py-1.5 pr-4 text-[13px] transition-colors hover:bg-row-hover">
        {/* the connector rails: one column per ancestor level */}
        <span className="flex shrink-0" aria-hidden>
          {prefixLines.map((draw, i) => (
            <span key={i} className={clsx('h-6 w-5', draw && 'border-l border-line')} />
          ))}
          <span className={clsx('relative h-6 w-5', !isLast && 'border-l border-line')}>
            <span className="absolute left-0 top-1/2 h-px w-4 bg-line" />
            {isLast && <span className="absolute left-0 top-0 h-1/2 w-px bg-line" />}
          </span>
        </span>

        <button
          onClick={() => hasChildren && setOpen((o) => !o)}
          className={clsx('grid h-5 w-5 shrink-0 place-items-center rounded text-ink-3',
            hasChildren ? 'hover:bg-canvas hover:text-ink' : 'invisible')}
          aria-label={open ? 'Collapse' : 'Expand'}
          aria-expanded={hasChildren ? open : undefined}
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        <span className={clsx('h-1.5 w-1.5 shrink-0 rounded-full', statusDot(node.status))}
              title={node.status} />

        <Link href={`/admin/users/${node.id}`}
              className="shrink-0 font-medium text-ink hover:text-gold hover:underline">
          {node.userCode}
        </Link>
        <span className="min-w-0 flex-1 truncate text-ink-2">{node.name || '—'}</span>

        <span className="hidden shrink-0 text-[11.5px] tabular-nums text-ink-3 sm:inline">
          L{node.relativeLevel}
        </span>
        <span className="w-24 shrink-0 text-right tabular-nums text-ink-2">
          {num(node.directCount)} direct
        </span>
        <span className="w-24 shrink-0 text-right font-medium tabular-nums text-ink">
          {usd(node.totalInvested, 0)}
        </span>
        <span className="hidden w-24 shrink-0 text-right text-[11.5px] tabular-nums text-ink-3 lg:inline">
          {shortDate(node.joinedAt)}
        </span>
      </div>

      {open && node.children.map((child, i) => (
        <Branch
          key={child.id}
          node={child}
          isLast={i === node.children.length - 1}
          prefixLines={[...prefixLines, !isLast]}
        />
      ))}

      {/* honesty about what is not drawn, rather than a silently short branch */}
      {open && undrawn > 0 && (
        <div className="flex items-center gap-2 border-b border-line-soft py-1.5 text-[12px] text-ink-3">
          <span className="flex shrink-0" aria-hidden>
            {[...prefixLines, !isLast].map((draw, i) => (
              <span key={i} className={clsx('h-5 w-5', draw && 'border-l border-line')} />
            ))}
            <span className="h-5 w-5" />
          </span>
          {num(undrawn)} more direct{undrawn === 1 ? '' : 's'} below the depth shown
        </div>
      )}
    </>
  );
}

export function GenealogyTree({ children }: { children: TreeNode[] }) {
  if (children.length === 0) {
    return <p className="px-5 py-10 text-center text-[13.5px] text-ink-2">This member has no downline yet.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        {children.map((c, i) => (
          <Branch key={c.id} node={c} isLast={i === children.length - 1} prefixLines={[]} />
        ))}
      </div>
    </div>
  );
}

/** Compact card for the searched member at the top of the tree. */
export function RootCard({ root }: {
  root: {
    id: string; userCode: string; name: string; status: string;
    totalInvested: string; directCount: number; activeDirectCount: number;
    teamBusiness: string; teamSize: number; sponsorCode: string | null; joinedAt: string;
  };
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line bg-canvas px-5 py-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[4px] bg-gradient-to-br from-gold to-gold-hi text-gold-on">
        <User size={16} strokeWidth={2.3} />
      </span>
      <div className="min-w-0">
        <Link href={`/admin/users/${root.id}`} className="text-[14px] font-semibold text-ink hover:underline">
          {root.userCode}
        </Link>
        <p className="truncate text-[12px] text-ink-2">
          {root.name || '—'}
          {root.sponsorCode ? <> · sponsored by <span className="font-medium">{root.sponsorCode}</span></> : ' · root account'}
        </p>
      </div>
      <dl className="ml-auto flex flex-wrap gap-x-6 gap-y-1 text-[12px]">
        {[
          { k: 'Directs', v: `${num(root.activeDirectCount)}/${num(root.directCount)} active` },
          { k: 'Team size', v: num(root.teamSize) },
          { k: 'Self capital', v: usd(root.totalInvested, 0) },
          { k: 'Team business', v: usd(root.teamBusiness, 0) },
        ].map((s) => (
          <div key={s.k}>
            <dt className="text-[10.5px] uppercase tracking-[0.04em] text-ink-3">{s.k}</dt>
            <dd className="font-medium tabular-nums text-ink">{s.v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
