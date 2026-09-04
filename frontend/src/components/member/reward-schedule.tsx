'use client';

import { useQuery } from '@tanstack/react-query';
import { CalendarClock } from 'lucide-react';
import { get } from '@/lib/api';
import { Card, CardHead, Badge, Skeleton } from '@/components/ui/primitives';
import { usd, shortDate } from '@/lib/format';

interface Instalment {
  rank: string;
  rankLevel: number;
  sequence: number;
  ofTotal: number;
  amount: string;
  dueOn: string;
  paidAt: string | null;
  status: 'PAID' | 'SCHEDULED';
}

interface Schedule {
  scheduled: boolean;
  totalAwarded: string;
  credited: string;
  outstanding: string;
  nextDueOn: string | null;
  nextAmount: string | null;
  instalments: Instalment[];
}

/**
 * What a rank reward is worth, and when it actually arrives.
 *
 * The distinction this screen exists to make is between money awarded and money
 * received. A member who sees "$300 reward" beside a balance that has not moved
 * will raise a ticket, so the three figures are labelled separately and the
 * outstanding part is never styled as though it has landed.
 *
 * Renders nothing at all when there is no schedule — a member whose rewards
 * were paid outright should not be shown an empty table explaining a mechanism
 * that does not apply to them.
 */
export function RewardSchedule() {
  const { data, isLoading } = useQuery({
    queryKey: ['member', 'reward-schedule'],
    queryFn: () => get<Schedule>('/rank/reward-schedule'),
  });

  if (isLoading) {
    return (
      <Card className="mt-3">
        <CardHead title="Reward payments" />
        <div className="space-y-2 px-5 pb-5">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
        </div>
      </Card>
    );
  }

  if (!data?.scheduled) return null;

  return (
    <Card className="mt-3">
      <CardHead
        title="Reward payments"
        subtitle={`Your rank rewards are paid in monthly instalments, credited on the 1st.`}
      />

      <div className="grid grid-cols-1 gap-px border-y border-line bg-line sm:grid-cols-3">
        <div className="bg-card px-5 py-4">
          <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3">Total awarded</span>
          <div className="mt-1 text-[20px] font-semibold tabular-nums">{usd(data.totalAwarded)}</div>
        </div>
        <div className="bg-card px-5 py-4">
          <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3">Credited so far</span>
          <div className="mt-1 text-[20px] font-semibold tabular-nums text-good">{usd(data.credited)}</div>
        </div>
        <div className="bg-card px-5 py-4">
          <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3">Still to come</span>
          {/* Deliberately not styled as a gain: it is not in the wallet yet. */}
          <div className="mt-1 text-[20px] font-semibold tabular-nums text-ink-2">{usd(data.outstanding)}</div>
        </div>
      </div>

      {data.nextDueOn && (
        <div className="flex items-center gap-2.5 px-5 py-3 text-[13px] text-ink-2">
          <CalendarClock size={15} className="shrink-0 text-ink-3" />
          <span>
            Next payment <span className="font-medium tabular-nums text-ink">{usd(data.nextAmount)}</span>
            {' '}on <span className="font-medium">{shortDate(data.nextDueOn)}</span>
          </span>
        </div>
      )}

      <div className="max-h-[320px] overflow-y-auto border-t border-line">
        {data.instalments.map((i) => (
          <div
            key={`${i.rank}-${i.sequence}`}
            className="flex items-center gap-3 border-b border-line px-5 py-3 last:border-b-0"
          >
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-medium">
                {i.rank} · payment {i.sequence} of {i.ofTotal}
              </div>
              <div className="mt-0.5 text-[12px] text-ink-3">
                {i.paidAt ? `Credited ${shortDate(i.paidAt)}` : `Due ${shortDate(i.dueOn)}`}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[14px] font-semibold tabular-nums">
                {i.status === 'PAID' ? `+${usd(i.amount)}` : usd(i.amount)}
              </div>
            </div>
            {/* Status carries a word as well as a colour — a scheduled payment
                must never be mistaken for one already received. */}
            <Badge tone={i.status === 'PAID' ? 'good' : 'neutral'}>
              {i.status === 'PAID' ? 'Paid' : 'Scheduled'}
            </Badge>
          </div>
        ))}
      </div>
    </Card>
  );
}
