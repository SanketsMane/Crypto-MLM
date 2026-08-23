'use client';

import { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { Select } from '@/components/ui/primitives';
import { DestinationCard } from './destination-card';
import { trackMeta, type TierView } from './types';

type StatusFilter = 'all' | 'locked' | 'qualified';
type SortKey = 'tier' | 'self' | 'team' | 'closest';

const STATUS = [
  { value: 'all', label: 'All' },
  { value: 'locked', label: 'Locked' },
  { value: 'qualified', label: 'Qualified' },
];

const SORT = [
  { value: 'tier', label: 'Tier order' },
  { value: 'self', label: 'Self capital' },
  { value: 'team', label: 'Team business' },
  { value: 'closest', label: 'Closest first' },
];

/**
 * The destination grid, with the track switch and the view controls. Filtering
 * and sorting are presentation only — every tier the API returns stays
 * reachable, and no requirement is recomputed here.
 */
export function DestinationSection({ tiers, onView }: { tiers: TierView[]; onView: (t: TierView) => void }) {
  const tracks = useMemo(() => [...new Set(tiers.map((t) => t.track))], [tiers]);
  const [track, setTrack] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortKey>('tier');

  const active = track && tracks.includes(track) ? track : (tracks.includes('AFFILIATE') ? 'AFFILIATE' : tracks[0]);

  const shown = useMemo(() => {
    const rows = tiers
      .filter((t) => t.track === active)
      .filter((t) => status === 'all' || (status === 'qualified' ? t.achieved : !t.achieved));

    const num = (v: string) => Number(v ?? 0);
    const sorted = [...rows];
    if (sort === 'self') sorted.sort((a, b) => num(a.selfRequirement) - num(b.selfRequirement));
    if (sort === 'team') sorted.sort((a, b) => num(a.teamRequirement) - num(b.teamRequirement));
    if (sort === 'closest') sorted.sort((a, b) => Number(b.achieved) - Number(a.achieved) || b.overallPct - a.overallPct);
    return sorted;
  }, [tiers, active, status, sort]);

  return (
    <section aria-labelledby="destinations-heading">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 id="destinations-heading" className="text-[17px] font-semibold tracking-[-0.015em] text-ink">
            Travel Rewards
          </h2>
          <p className="mt-1 text-[12.5px] text-ink-2">
            Qualify through your personal capital and team performance.
          </p>
        </div>

        <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:items-center">
          {tracks.length > 1 && (
            <div role="group" aria-label="Qualification track"
                 className="flex w-full rounded-[10px] border border-line bg-canvas-2 p-1 sm:w-auto">
              {tracks.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={t === active}
                  onClick={() => setTrack(t)}
                  className={clsx(
                    'flex-1 whitespace-nowrap rounded-[7px] px-3 py-1.5 text-[12px] font-medium transition sm:flex-none',
                    'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/25',
                    t === active
                      ? 'bg-card text-ink shadow-card ring-1 ring-gold/35'
                      : 'text-ink-2 hover:text-ink',
                  )}
                >
                  {trackMeta(t).short}
                </button>
              ))}
            </div>
          )}

          <div className="flex w-full gap-2.5 sm:w-auto">
            <label className="flex-1 sm:flex-none">
              <span className="sr-only">Filter destinations by status</span>
              <Select label="Filter by status" value={status} onChange={(v) => setStatus(v as StatusFilter)} options={STATUS} className="w-full" />
            </label>
            <label className="flex-1 sm:flex-none">
              <span className="sr-only">Sort destinations</span>
              <Select label="Sort destinations" value={sort} onChange={(v) => setSort(v as SortKey)} options={SORT} className="w-full" />
            </label>
          </div>
        </div>
      </div>

      <p className="mb-3 text-[12px] text-ink-3">{trackMeta(active ?? '').blurb}</p>

      {shown.length === 0 ? (
        <div className="rounded-[14px] border border-dashed border-line bg-card px-5 py-12 text-center text-[13px] text-ink-2">
          No destinations match this filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((t) => (
            <DestinationCard key={`${t.track}-${t.destination}`} tier={t} onView={onView} />
          ))}
        </div>
      )}
    </section>
  );
}
