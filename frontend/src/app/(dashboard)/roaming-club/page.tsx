'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { Skeleton } from '@/components/ui/primitives';
import { RoamingHero } from '@/components/member/roaming/roaming-hero';
import { RoamingOverview } from '@/components/member/roaming/roaming-overview';
import { TravelProgress } from '@/components/member/roaming/travel-progress';
import { NextRewardCard } from '@/components/member/roaming/next-reward-card';
import { DestinationSection } from '@/components/member/roaming/destination-section';
import { DestinationDetail } from '@/components/member/roaming/destination-detail';
import { RoamingInfoCard } from '@/components/member/roaming/roaming-info-card';
import { journey, nextReward, toView, type Tier, type TierView } from '@/components/member/roaming/types';

/**
 * Roaming Club — "earn your journey".
 *
 * Hero → qualification tracks → your progress → next reward → destinations →
 * the note. Every figure on the page comes from `GET /roaming-club`; the page
 * only decides how to draw them.
 */
export default function RoamingClubPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['member', 'roaming'],
    queryFn: () => get<Tier[]>('/roaming-club'),
  });

  const [detail, setDetail] = useState<TierView | null>(null);

  const tiers = useMemo(() => (data ?? []).map(toView), [data]);
  const next = useMemo(() => nextReward(tiers), [tiers]);
  const stops = useMemo(() => journey(tiers), [tiers]);

  return (
    <>
      <div className="mb-6">
        <RoamingHero />
      </div>

      {isLoading ? (
        <RoamingSkeleton />
      ) : tiers.length === 0 ? (
        <div className="rounded-[14px] border border-dashed border-line bg-card px-5 py-14 text-center">
          <p className="text-[14px] font-medium text-ink">No travel tiers are open right now</p>
          <p className="mx-auto mt-1.5 max-w-[46ch] text-[12.5px] leading-relaxed text-ink-2">
            Roaming Club destinations appear here as soon as they are published. Your capital and team
            business keep counting toward them in the meantime.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-7">
            <RoamingOverview tiers={tiers} />
          </div>

          <div className="mb-7 space-y-4">
            <TravelProgress stops={stops} next={next} />
            <NextRewardCard tier={next} onView={setDetail} />
          </div>

          <div className="mb-6">
            <DestinationSection tiers={tiers} onView={setDetail} />
          </div>

          <RoamingInfoCard />
        </>
      )}

      <DestinationDetail tier={detail} onClose={() => setDetail(null)} />
    </>
  );
}

function RoamingSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading Roaming Club">
      <Skeleton className="mb-7 h-[220px] rounded-[16px]" />
      <Skeleton className="mb-4 h-[190px] rounded-[16px]" />
      <Skeleton className="mb-7 h-[268px] rounded-[18px]" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[380px] rounded-[14px]" />)}
      </div>
    </div>
  );
}
