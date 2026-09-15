'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Gift, Lock, Check, Sparkles } from 'lucide-react';
import { clsx } from 'clsx';
import { get, post } from '@/lib/api';
import { useMoneyMutation } from '@/lib/money-mutation';
import { Card, CardHead, Metric, Skeleton, Badge } from '@/components/ui/primitives';
import { toastError } from '@/lib/toast';
import { usd } from '@/lib/format';

interface CardRow {
  id: string; tier: string; amount: string; bonusPercent: string;
  status: 'LOCKED' | 'UNCLAIMED' | 'CLAIMED';
  threshold: string; unlockedAt: string | null; claimedAt: string | null;
}
interface Payload { cards: CardRow[]; totalEarned: string; unclaimed: number; invested: string }

/**
 * Milestone bonus cards.
 *
 * Locked tiers are shown alongside unlocked ones deliberately — a milestone
 * nobody can see is not a milestone, it is a surprise. Showing the threshold
 * and how far off it is turns the programme into something a member can aim at.
 */
export default function RewardsPage() {
  const qc = useQueryClient();
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  const data = useQuery<Payload>({
    queryKey: ['member', 'rewards'],
    queryFn: () => get('/rewards'),
  });

  const claim = useMoneyMutation({
    mutationFn: (id: string, key) =>
      post<{ tier: string; paid: string; faceValue: string; cappedOut: boolean }>(
        `/rewards/${id}/claim`, {}, key,
      ),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['member'] });
      if (d.cappedOut && Number(d.paid) === 0) {
        toast.warning('Nothing paid on this card', {
          description: 'Your earnings ceiling is reached. Invest again to lift it.',
        });
      } else if (d.cappedOut) {
        toast.success(`${usd(Number(d.paid))} added`, {
          description: `The card was worth ${usd(Number(d.faceValue))}, but your ceiling capped the payout.`,
        });
      } else {
        toast.success(`${usd(Number(d.paid))} added to your main wallet`);
      }
    },
    onError: (e) => toastError(e),
  });

  const invested = Number(data.data?.invested ?? 0);
  const cards = data.data?.cards ?? [];

  if (data.isLoading) {
    return <Card><div className="p-5"><Skeleton className="h-64" /></div></Card>;
  }

  if (!cards.length) {
    return (
      <Card>
        <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-canvas text-ink-3">
            <Gift size={22} />
          </span>
          <p className="text-[15px] font-medium text-ink">No reward tiers yet</p>
          <p className="max-w-sm text-[13px] leading-relaxed text-ink-2">
            Bonus cards unlock as your total investment grows. None have been set up on the platform
            yet — this page fills in as soon as they are.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Total rewards earned" value={usd(Number(data.data?.totalEarned ?? 0))} />
        <Metric label="Cards waiting" value={data.data?.unclaimed ?? 0}
                tone={data.data?.unclaimed ? 'good' : undefined} />
        <Metric label="Invested so far" value={usd(invested)} />
      </div>

      <Card>
        <CardHead
          title="Your cards"
          subtitle="Each tier unlocks once your total investment reaches its threshold."
        />
        <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => {
            const threshold = Number(c.threshold);
            const progress = threshold > 0 ? Math.min(100, (invested / threshold) * 100) : 0;
            const isRevealed = revealed.has(c.id);
            const busy = claim.isPending && claim.variables === c.id;

            if (c.status === 'LOCKED') {
              return (
                <div key={c.id}
                     className="rounded-[5px] border border-dashed border-line bg-canvas p-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="grid h-9 w-9 place-items-center rounded-[4px] bg-line/40 text-ink-3">
                      <Lock size={16} />
                    </span>
                    <Badge tone="neutral">Locked</Badge>
                  </div>
                  <p className="mt-2.5 text-[13.5px] font-semibold text-ink-2">{c.tier}</p>
                  <p className="mt-0.5 text-[12px] text-ink-3">
                    Unlocks at {usd(threshold)} invested
                  </p>

                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full bg-ink-3/50 transition-[width]"
                         style={{ width: `${progress}%` }} />
                  </div>
                  <p className="mt-1.5 text-[11px] text-ink-3">
                    {invested >= threshold
                      ? 'Unlocking shortly'
                      : `${usd(threshold - invested)} to go`}
                  </p>
                </div>
              );
            }

            const claimed = c.status === 'CLAIMED';

            return (
              <div
                key={c.id}
                className={clsx(
                  'relative overflow-hidden rounded-[5px] border p-4 transition',
                  claimed
                    ? 'border-line bg-card'
                    : 'border-gold/40 bg-gradient-to-br from-gold-soft to-card shadow-card',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className={clsx(
                    'grid h-9 w-9 place-items-center rounded-[4px]',
                    claimed ? 'bg-good-soft text-good' : 'bg-gold/20 text-gold-ink',
                  )}>
                    {claimed ? <Check size={16} /> : <Sparkles size={16} />}
                  </span>
                  <Badge tone={claimed ? 'good' : 'gold'}>{claimed ? 'Claimed' : 'Ready'}</Badge>
                </div>

                <p className="mt-2.5 text-[13.5px] font-semibold text-ink">{c.tier}</p>
                <p className="mt-0.5 text-[12px] text-ink-2">
                  {c.bonusPercent}% bonus · unlocked at {usd(threshold)}
                </p>

                {claimed ? (
                  <p className="mt-3 text-[20px] font-bold tabular-nums text-good">
                    {usd(Number(c.amount))}
                  </p>
                ) : isRevealed ? (
                  <div className="mt-3 space-y-2">
                    <p className="text-[24px] font-bold tabular-nums leading-none text-gold-ink">
                      {usd(Number(c.amount))}
                    </p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => claim.mutate(c.id)}
                      className="w-full rounded-[4px] bg-gradient-to-br from-gold to-gold-hi px-3 py-2 text-[13px] font-semibold text-navy transition hover:brightness-105 disabled:opacity-60"
                    >
                      {busy ? 'Adding…' : 'Add to my wallet'}
                    </button>
                  </div>
                ) : (
                  /* The scratch is theatre, not security — the amount is already
                     decided. It just makes claiming feel like the reward it is. */
                  <button
                    type="button"
                    onClick={() => setRevealed((prev) => new Set(prev).add(c.id))}
                    className="mt-3 w-full rounded-[4px] border border-dashed border-gold/50 bg-gold/10 px-3 py-4 text-[13px] font-semibold text-gold-ink transition hover:bg-gold/15"
                  >
                    Scratch to reveal
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <p className="px-1 text-[11.5px] leading-relaxed text-ink-3">
        Card bonuses count towards your earnings ceiling, like every other payout on the platform. If
        you have reached your ceiling a card will scratch but pay nothing — invest again to lift it.
      </p>
    </div>
  );
}
