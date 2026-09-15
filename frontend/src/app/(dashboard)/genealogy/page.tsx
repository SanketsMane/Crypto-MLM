'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Network, Search, Table2, Users } from 'lucide-react';
import { clsx } from 'clsx';
import { get } from '@/lib/api';
import { Card, CardHead, Table, Badge, Skeleton, Button, controlCls } from '@/components/ui/primitives';
import { usd, shortDate } from '@/lib/format';

interface Node {
  id: string; userCode: string; name: string; status: string;
  level: number; parentId: string | null;
  invested: string; directs: number; joinedAt: string;
}
interface Genealogy { rootId: string; total: number; maxLevel: number; nodes: Node[] }
interface Level { level: number; members: number; active: number; volume: string; unlocked: boolean }

const DEPTHS = [3, 5, 10, 30];

export default function GenealogyPage() {
  const [view, setView] = useState<'tree' | 'levels'>('tree');
  const [depth, setDepth] = useState(5);

  return (
    <div className="space-y-4">
      <Card>
        <CardHead
          title="Your network"
          subtitle="Everyone below you, however they got there."
          right={
            <div className="flex rounded-full border border-line p-0.5">
              {([['tree', 'Tree', Network], ['levels', 'By level', Table2]] as const).map(([k, label, Icon]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setView(k)}
                  className={clsx(
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition',
                    view === k ? 'bg-navy text-white dark:bg-gold dark:text-navy' : 'text-ink-2 hover:text-ink',
                  )}
                >
                  <Icon size={13} /> {label}
                </button>
              ))}
            </div>
          }
        />
        {view === 'tree' && (
          <div className="flex flex-wrap items-center gap-2 px-5 pb-4">
            <span className="text-[12px] text-ink-2">Load</span>
            {DEPTHS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDepth(d)}
                className={clsx(
                  'rounded-full px-3 py-1 text-[12px] font-medium transition',
                  depth === d ? 'bg-gold-soft text-gold-ink' : 'text-ink-2 hover:bg-canvas hover:text-ink',
                )}
              >
                {d} levels
              </button>
            ))}
          </div>
        )}
      </Card>

      {view === 'tree' ? <TreeView depth={depth} /> : <LevelView />}
    </div>
  );
}

// ── tree ──────────────────────────────────────────────────────────────────

function TreeView({ depth }: { depth: number }) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const data = useQuery<Genealogy>({
    queryKey: ['member', 'genealogy', depth],
    queryFn: () => get('/team/genealogy', { depth }),
  });

  /** Children indexed by parent, so rendering a branch is a lookup not a scan. */
  const byParent = useMemo(() => {
    const map = new Map<string, Node[]>();
    for (const n of data.data?.nodes ?? []) {
      if (!n.parentId) continue;
      const list = map.get(n.parentId) ?? [];
      list.push(n);
      map.set(n.parentId, list);
    }
    return map;
  }, [data.data]);

  const root = data.data?.nodes.find((n) => n.id === data.data?.rootId);

  /**
   * Searching expands the path to every match rather than filtering the tree —
   * a member found with no ancestors visible has lost the thing that makes a
   * genealogy useful, which is where they sit.
   */
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return null;
    return new Set(
      (data.data?.nodes ?? [])
        .filter((n) => n.name.toLowerCase().includes(q) || n.userCode.toLowerCase().includes(q))
        .map((n) => n.id),
    );
  }, [query, data.data]);

  const revealed = useMemo(() => {
    if (!matches?.size) return null;
    const byId = new Map((data.data?.nodes ?? []).map((n) => [n.id, n]));
    const open = new Set<string>();
    for (const id of matches) {
      let cur = byId.get(id)?.parentId;
      while (cur) { open.add(cur); cur = byId.get(cur)?.parentId; }
    }
    return open;
  }, [matches, data.data]);

  const isOpen = (id: string) => (revealed ? revealed.has(id) : expanded.has(id));

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  if (data.isLoading) return <Card><div className="p-5"><Skeleton className="h-64" /></div></Card>;

  if (!root) return null;

  return (
    <Card>
      <CardHead
        title={`${data.data?.total ?? 0} in your downline`}
        subtitle={`Loaded ${depth} level${depth === 1 ? '' : 's'} deep · deepest is level ${data.data?.maxLevel ?? 0}`}
        right={
          <label className="relative flex items-center">
            <Search size={14} className="pointer-events-none absolute left-3 text-ink-3" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a member"
              className={`${controlCls} h-9 w-48 pl-8 text-[12.5px]`}
            />
          </label>
        }
      />
      <div className="overflow-x-auto px-2 pb-4 sm:px-5">
        <ul className="min-w-[320px]">
          <TreeNode
            node={root}
            byParent={byParent}
            isRoot
            isOpen={isOpen}
            onToggle={toggle}
            matches={matches}
          />
        </ul>
        {matches?.size === 0 && (
          <p className="px-3 py-4 text-[13px] text-ink-2">
            Nobody in the loaded levels matches “{query}”. Try loading more levels.
          </p>
        )}
      </div>
    </Card>
  );
}

function TreeNode({
  node, byParent, isRoot = false, isOpen, onToggle, matches,
}: {
  node: Node;
  byParent: Map<string, Node[]>;
  isRoot?: boolean;
  isOpen: (id: string) => boolean;
  onToggle: (id: string) => void;
  matches: Set<string> | null;
}) {
  const children = byParent.get(node.id) ?? [];
  const open = isRoot || isOpen(node.id);
  const hit = matches?.has(node.id) ?? false;

  return (
    <li>
      <div
        className={clsx(
          'flex items-center gap-2 rounded-[4px] py-1.5 pr-2 transition',
          hit ? 'bg-gold-soft' : 'hover:bg-canvas',
        )}
      >
        {children.length > 0 ? (
          <button
            type="button"
            onClick={() => onToggle(node.id)}
            aria-label={open ? `Collapse ${node.name}` : `Expand ${node.name}`}
            aria-expanded={open}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-[3px] text-ink-3 transition hover:bg-line/50 hover:text-ink"
          >
            <ChevronRight size={14} className={clsx('transition-transform', open && 'rotate-90')} />
          </button>
        ) : (
          <span className="h-6 w-6 shrink-0" />
        )}

        <span
          className={clsx(
            'grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold',
            isRoot
              ? 'bg-gradient-to-br from-gold to-gold-hi text-navy'
              : node.status === 'ACTIVE'
                ? 'bg-violet-soft text-violet'
                : 'bg-canvas text-ink-3',
          )}
        >
          {node.name.slice(0, 1).toUpperCase()}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="truncate text-[13px] font-medium text-ink">
              {isRoot ? 'You' : node.name}
            </span>
            <span className="font-mono text-[11px] text-ink-3">{node.userCode}</span>
            {!isRoot && <span className="text-[11px] text-ink-3">L{node.level}</span>}
          </span>
        </span>

        <span className="hidden shrink-0 items-center gap-2 sm:flex">
          {node.directs > 0 && (
            <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-3">
              <Users size={11} /> {node.directs}
            </span>
          )}
          <span className="tabular-nums text-[12.5px] text-ink-2">{usd(Number(node.invested))}</span>
          {node.status !== 'ACTIVE' && <Badge tone="neutral">{node.status}</Badge>}
        </span>
      </div>

      {open && children.length > 0 && (
        // The rail is what makes depth readable — indentation alone stops
        // working past three or four levels.
        <ul className="ml-3 border-l border-line pl-3">
          {children.map((c) => (
            <TreeNode
              key={c.id}
              node={c}
              byParent={byParent}
              isOpen={isOpen}
              onToggle={onToggle}
              matches={matches}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

// ── by level (the original view, kept) ────────────────────────────────────

function LevelView() {
  const [level, setLevel] = useState(1);
  const levels = useQuery({ queryKey: ['member', 'levels'], queryFn: () => get<Level[]>('/customer/levels') });
  const members = useQuery({
    queryKey: ['member', 'genealogy-level', level],
    queryFn: () => get<{ id: string; userCode: string; firstName: string; lastName: string | null; status: string; totalInvested: string; createdAt: string }[]>(`/team/level/${level}`),
  });

  return (
    <>
      <Card>
        <CardHead title="Choose a level" />
        <div className="px-5 pb-5">
          <div className="flex flex-wrap gap-1.5">
            {(levels.data ?? Array.from({ length: 30 }, (_, i) => ({ level: i + 1, members: 0, unlocked: false } as Level))).map((l) => (
              <button key={l.level} onClick={() => setLevel(l.level)}
                className={`relative h-11 w-11 rounded-[4px] border text-[12px] font-medium tabular-nums transition ${
                  l.level === level
                    ? 'border-violet bg-violet text-white'
                    : l.unlocked
                      ? 'border-line bg-card text-ink hover:border-violet/40'
                      : 'border-line bg-canvas text-ink-3 hover:border-ink-3'}`}>
                {l.level}
                {l.members > 0 && (
                  <span className={`absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[9px] font-semibold ${
                    l.level === level ? 'bg-white text-violet' : 'bg-violet text-white'}`}>
                    {l.members}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <CardHead title={`Level ${level} — ${members.data?.length ?? 0} member${members.data?.length === 1 ? '' : 's'}`} />
        <Table
          head={['Member', 'User ID', 'Invested', 'Status', 'Joined']}
          empty={`Nobody at level ${level} yet.`}
          rows={(members.data ?? []).map((m) => [
            [m.firstName, m.lastName].filter(Boolean).join(' ') || m.userCode,
            <span key="c" className="font-mono text-[12px]">{m.userCode}</span>,
            <span key="i" className="tabular-nums">{usd(Number(m.totalInvested))}</span>,
            <Badge key="s" tone={m.status === 'ACTIVE' ? 'good' : 'neutral'}>{m.status}</Badge>,
            shortDate(m.createdAt),
          ])}
        />
      </Card>
    </>
  );
}
