'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMoneyMutation } from '../../../lib/money-mutation';
import { toast } from 'sonner';
import { toastError } from '@/lib/toast';
import { TrendingUp } from 'lucide-react';
import { get, post, apiErrorMessage } from '@/lib/api';
import { Card, CardHead, Table, Badge, toneFor } from '@/components/ui/primitives';
import { InvestmentPackageCard } from '@/components/packages/investment-package-card';
import { usd, shortDate, pct } from '@/lib/format';

interface Plan { id: string; name: string; amount: string; dailyRoiPercent: string; capPercent: string }
interface Mine { id: string; amount: string; capLimit: string; totalEarned: string; status: string; startedAt: string; package: { name: string } }
interface Wallets { wallets: { type: string; available: string }[] }

/** Position in the ladder that carries the Popular badge. */
const POPULAR_INDEX = 3;

export default function PackagesPage() {
  const qc = useQueryClient();
  const plans = useQuery({ queryKey: ['member', 'plans'], queryFn: () => get<Plan[]>('/packages') });
  const mine = useQuery({ queryKey: ['member', 'investments'], queryFn: () => get<Mine[]>('/investments') });
  const w = useQuery({ queryKey: ['member', 'wallet'], queryFn: () => get<Wallets>('/wallet') });

  const fund = Number(w.data?.wallets.find((x) => x.type === 'FUND')?.available ?? 0);

  const buy = useMoneyMutation({
    mutationFn: (packageId: string, key) => post('/investments/purchase', { packageId }, key),
    onSuccess: () => { toast.success('Package activated — daily returns begin on the next trading day'); qc.invalidateQueries({ queryKey: ['member'] }); },
    onError: (e) => toastError(e),
  });

  return (
    <>
      {/* Four across from 1280. The cards lost the 142px of artwork that used
          to set their minimum width, so four now fit where three did without
          the metric labels wrapping. */}
      <div className="grid grid-cols-1 items-stretch gap-2.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {(plans.data ?? []).map((p, i) => {
          const affordable = fund >= Number(p.amount);
          return (
            <InvestmentPackageCard
              key={p.id}
              plan={{
                id: p.id,
                name: p.name,
                amount: p.amount,
                dailyReturnPercent: p.dailyRoiPercent,
                earnLimit: (Number(p.amount) * Number(p.capPercent)) / 100,
                tradingDays: 'Mon – Fri',
                // The tier the public plans page also highlights, so the two
                // surfaces recommend the same thing.
                isPopular: i === POPULAR_INDEX,
              }}
              affordable={affordable}
              fundAvailable={fund}
              pending={buy.isPending && buy.variables === p.id}
              disabled={buy.isPending}
              onInvest={() => buy.mutate(p.id)}
            />
          );
        })}

        {plans.isLoading && Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="min-h-[232px] animate-pulse rounded-[5px] border border-line bg-card" />
        ))}
      </div>

      <Card className="mt-2.5">
        <CardHead title={`My packages — ${mine.data?.length ?? 0}`} />
        <Table
          head={['Started', 'Plan', 'Amount', 'Earned', 'Earn limit', 'Progress', 'Status']}
          empty="You have no packages yet. Choose a plan above to start earning."
          rows={(mine.data ?? []).map((i) => {
            const p = Number(i.capLimit) > 0 ? Math.min(100, (Number(i.totalEarned) / Number(i.capLimit)) * 100) : 0;
            return [
              <span key="a" className="text-ink-2">{shortDate(i.startedAt)}</span>,
              <span key="b" className="font-medium">{i.package.name}</span>,
              <span key="c" className="font-semibold tabular-nums">{usd(i.amount)}</span>,
              <span key="d" className="tabular-nums text-good">{usd(i.totalEarned)}</span>,
              <span key="e" className="tabular-nums text-ink-2">{usd(i.capLimit)}</span>,
              <span key="f" className="flex items-center gap-2">
                <span className="h-1.5 w-20 overflow-hidden rounded-full bg-line-soft">
                  <span className="block h-full rounded-full bg-gold" style={{ width: `${Math.max(2, p)}%` }} />
                </span>
                <span className="text-[11.5px] tabular-nums text-ink-2">{pct(p, 0)}</span>
              </span>,
              <Badge key="g" tone={toneFor(i.status)}>{i.status}</Badge>,
            ];
          })}
        />
      </Card>

      <p className="mt-3 flex items-center gap-1.5 text-[12px] text-ink-2">
        <TrendingUp size={13} /> Returns accrue Monday to Friday and stop once a package reaches its earn limit.
      </p>
    </>
  );
}
