'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { adminGet, adminPost } from '@/lib/admin-api';
import { toastError } from '@/lib/toast';
import { Card, CardHead, Table, Badge, Button } from '@/components/ui/primitives';
import { ActionDialog } from '@/components/ui/dialog';
import { usd, num, shortDate } from '@/lib/format';
import { SectionBody } from '@/components/admin/plan-editor';
import type { Tier, Award } from './types';

export function RoamingSection() {
  const qc = useQueryClient();
  const [fulfil, setFulfil] = useState<Award | null>(null);

  const tiers = useQuery({ queryKey: ['admin', 'tiers'], queryFn: () => adminGet<Tier[]>('/admin/roaming-tiers') });
  const awards = useQuery({
    queryKey: ['admin', 'roaming-awards'],
    queryFn: () => adminGet<{ total: number; pending: number; rows: Award[] }>('/admin/roaming-awards', { take: 50 }),
  });

  const markFulfilled = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) => adminPost(`/admin/roaming-awards/${id}/fulfil`, { notes }),
    onSuccess: () => {
      toast.success('Award marked fulfilled');
      setFulfil(null);
      qc.invalidateQueries({ queryKey: ['admin', 'roaming-awards'] });
    },
    onError: (e) => toastError(e),
  });

  const pending = awards.data?.pending ?? 0;

  return (
    <div className="space-y-3.5">
      <Card>
        <CardHead
          title="Affiliate offers"
          subtitle="Travel awards, on two tracks. These sit outside the earnings ceiling — qualifying for a trip never counts against a member's cap."
        />
        <SectionBody q={tiers} rows={5}>
          <Table
            head={['Track', 'Destination', 'Self capital required', 'Team business required']}
            empty="No offers configured. Nobody can qualify until at least one exists."
            rows={(tiers.data ?? []).map((t) => [
              <Badge key="a" tone={t.track === 'AFFILIATE' ? 'info' : 'neutral'}>{t.track.replace('_', ' ')}</Badge>,
              <span key="b" className="font-medium">{t.destination}</span>,
              <span key="c" className="tabular-nums">{usd(t.selfRequirement, 0)}</span>,
              <span key="d" className="tabular-nums text-ink-2">
                {Number(t.teamRequirement) > 0 ? usd(t.teamRequirement, 0) : <span className="text-ink-3">Not required</span>}
              </span>,
            ])}
          />
        </SectionBody>
      </Card>

      <Card>
        <CardHead
          title="Fulfilment queue"
          subtitle="Trips members have earned. Marking one fulfilled records the delivery — no money moves through the wallet here."
          action={pending > 0
            ? <Badge tone="warn">{num(pending)} awaiting fulfilment</Badge>
            : awards.data ? <Badge tone="good">All fulfilled</Badge> : undefined}
        />
        <SectionBody q={awards} rows={4}>
          <Table
            head={['Earned', 'Member', 'Destination', 'Status', '']}
            empty="No trips earned yet. Members qualify automatically against the tiers above."
            rows={(awards.data?.rows ?? []).map((a) => [
              <span key="a" className="text-ink-2">{shortDate(a.achievedAt)}</span>,
              <span key="b" className="font-medium">{a.userCode}</span>,
              <span key="c">{a.destination}</span>,
              <span key="d" className="inline-flex items-center gap-1.5">
                <Badge tone={a.status === 'PROCESSED' ? 'good' : 'warn'}>
                  {a.status === 'PROCESSED' ? 'Fulfilled' : 'Pending'}
                </Badge>
                {a.notes && <span title={a.notes} className="max-w-[150px] truncate text-[11px] text-ink-3">{a.notes}</span>}
              </span>,
              a.status === 'PROCESSED'
                ? <span key="e" className="text-ink-3">—</span>
                : <Button key="e" size="sm" onClick={() => setFulfil(a)}>Mark fulfilled</Button>,
            ])}
          />
        </SectionBody>
      </Card>

      <ActionDialog
        open={!!fulfil}
        onClose={() => setFulfil(null)}
        pending={markFulfilled.isPending}
        title={fulfil ? `Mark ${fulfil.destination} fulfilled?` : ''}
        body={fulfil
          ? `Records the trip for ${fulfil.userCode} as delivered. The Flyers Club sits outside the earnings cap, so nothing is credited to a wallet here.`
          : undefined}
        confirmLabel="Mark fulfilled"
        fields={[{
          name: 'notes', label: 'Fulfilment note', required: true, minLength: 3, multiline: true,
          placeholder: 'e.g. booked via Emirates, ref AB1234, departing 12 Mar',
          help: 'Stored on the award and written to the audit log.',
        }]}
        onConfirm={(v) => fulfil && markFulfilled.mutate({ id: fulfil.id, notes: v.notes })}
      />
    </div>
  );
}
