'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { Skeleton } from '@/components/ui/primitives';
import { FlyersHero } from '@/components/member/flyers/flyers-hero';
import { RoutePanel } from '@/components/member/flyers/route-panel';
import { DestinationSection } from '@/components/member/flyers/destination-section';
import { DestinationDetail } from '@/components/member/flyers/destination-detail';
import { FlyersNote } from '@/components/member/flyers/flyers-note';
import { journey, standing, toView, type Tier, type TierView } from '@/components/member/flyers/types';

/**
 * The Flyers Club — "earn your journey".
 *
 * Hero with the live standing → your route and the destination you are closest
 * to → every destination by route → the note. Every figure on the page comes
 * from `GET /roaming-club` (the API path predates the rename); the page only
 * decides how to draw them.
 */
export default function FlyersClubPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['member', 'flyers'],
    queryFn: () => get<Tier[]>('/roaming-club'),
  });

  const [detail, setDetail] = useState<TierView | null>(null);

  const tiers = useMemo(() => (data ?? []).map(toView), [data]);
  const stops = useMemo(() => journey(tiers), [tiers]);
  const where = useMemo(
    () => (isLoading || tiers.length === 0 ? null : standing(tiers, stops)),
    [isLoading, tiers, stops],
  );

  return (
    <>
      <div className="mb-6">
        <FlyersHero standing={where} />
      </div>

      {isLoading ? (
        <FlyersSkeleton />
      ) : tiers.length === 0 ? (
        <div className="rounded-[5px] border border-dashed border-line bg-card px-3.5 py-14 text-center">
          <p className="text-[14px] font-medium text-ink">No offers are open right now</p>
          <p className="mx-auto mt-1.5 max-w-[46ch] text-[12.5px] leading-relaxed text-ink-2">
            Offers appear here as soon as they are published. Your capital and team business keep
            counting toward them in the meantime.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-7">
            <RoutePanel stops={stops} next={where?.next ?? null} onView={setDetail} />
          </div>

          <div className="mb-6">
            <DestinationSection tiers={tiers} onView={setDetail} />
          </div>

          <FlyersNote />
        </>
      )}

      <DestinationDetail tier={detail} onClose={() => setDetail(null)} />
    </>
  );
}

function FlyersSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the affiliate offers">
      <Skeleton className="mb-7 h-[330px] rounded-[5px]" />
      <Skeleton className="mb-4 h-[120px] rounded-[5px]" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[380px] rounded-[5px]" />)}
      </div>
    </div>
  );
}
