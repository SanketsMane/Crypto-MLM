'use client';

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { clsx } from 'clsx';
import { adminGet, adminPatch, adminError } from '@/lib/admin-api';
import { toastError } from '@/lib/toast';
import { Card, CardHead, Table, Button } from '@/components/ui/primitives';
import { useConfirmOk } from '@/components/ui/confirm';
import { usd, num, shortDate } from '@/lib/format';
import { rankLabel } from '@/lib/rank';
import {
  SectionBody, SaveBar, NumField, Toggle, useDraft,
  sameValue, isValidPlanNumber, MONEY_MAX,
} from '@/components/admin/plan-editor';
import type { Rank, Achievement } from './types';

interface RankWrite { id: string; level: number; selfCapital: string; teamBusiness: string; reward: string }

export function RanksSection() {
  const qc = useQueryClient();
  const askConfirm = useConfirmOk();
  const { draft, set, reset } = useDraft();

  const q = useQuery({ queryKey: ['admin', 'ranks'], queryFn: () => adminGet<Rank[]>('/admin/ranks') });
  const achievements = useQuery({
    queryKey: ['admin', 'rank-achievements'],
    queryFn: () => adminGet<{
      total: number; awarded: string; credited: string; outstanding: string; rows: Achievement[];
    }>('/admin/rank-achievements', { take: 25 }),
  });

  const ranks = useMemo(() => [...(q.data ?? [])].sort((a, b) => a.level - b.level), [q.data]);

  const writes = useMemo<RankWrite[]>(() => ranks.flatMap((r) => {
    const self = draft[`${r.id}:self`] ?? r.selfCapital;
    const team = draft[`${r.id}:team`] ?? r.teamBusiness;
    const reward = draft[`${r.id}:reward`] ?? r.reward;
    const changed = !sameValue(self, r.selfCapital) || !sameValue(team, r.teamBusiness) || !sameValue(reward, r.reward);
    return changed ? [{ id: r.id, level: r.level, selfCapital: self.trim(), teamBusiness: team.trim(), reward: reward.trim() }] : [];
  }), [ranks, draft]);

  const invalid = writes.filter((w) =>
    !isValidPlanNumber(w.selfCapital, MONEY_MAX) ||
    !isValidPlanNumber(w.teamBusiness, MONEY_MAX) ||
    !isValidPlanNumber(w.reward, MONEY_MAX)).length;

  /**
   * Ranks are independent rows, not a span that must stay uniform, so they are
   * written one at a time. If one fails the rest still stand — and the toast
   * says exactly how many landed rather than claiming the batch succeeded.
   */
  const save = useMutation({
    mutationFn: async (rows: RankWrite[]) => {
      let done = 0;
      for (const w of rows) {
        await adminPatch(`/admin/ranks/${w.id}`, {
          selfCapital: w.selfCapital, teamBusiness: w.teamBusiness, reward: w.reward,
        });
        done += 1;
      }
      return done;
    },
    onSuccess: (done) => {
      toast.success(`${done} ${done === 1 ? 'rank' : 'ranks'} updated`);
      reset();
      qc.invalidateQueries({ queryKey: ['admin', 'ranks'] });
    },
    onError: (e, rows) => {
      qc.invalidateQueries({ queryKey: ['admin', 'ranks'] });
      toast.error(`Could not save all ${rows.length} ranks — ${adminError(e)}. Some may have been written; reload to see the current values.`);
    },
  });

  const toggle = useMutation({
    mutationFn: (r: Rank) => adminPatch(`/admin/ranks/${r.id}`, { isActive: !r.isActive }),
    onSuccess: () => { toast.success('Rank updated'); qc.invalidateQueries({ queryKey: ['admin', 'ranks'] }); },
    onError: (e) => toastError(e),
  });

  const totalReward = ranks.filter((r) => r.isActive).reduce((s, r) => s + Number(r.reward || 0), 0);

  return (
    <div className="space-y-3.5">
      <Card>
        <CardHead
          title="Executive ranks"
          subtitle={
            q.isLoading || q.isError
              ? 'The rank ladder and the one-off reward each pays.'
              : `${num(ranks.length)} ranks. A member qualifies on their own capital and their team's business; the reward is paid once, the first time they reach it. ${usd(totalReward, 0)} if a member climbed the whole ladder.`
          }
        />
        <SectionBody q={q} rows={6}>
          <Table
            head={['Rank', 'Self capital', 'Team business', 'Reward', 'Status']}
            empty="No ranks configured. Nobody can qualify for a rank reward until at least one exists."
            rows={ranks.map((r) => {
              const self = draft[`${r.id}:self`] ?? r.selfCapital;
              const team = draft[`${r.id}:team`] ?? r.teamBusiness;
              const reward = draft[`${r.id}:reward`] ?? r.reward;
              return [
                <span key="a" className={clsx('font-medium tabular-nums', !r.isActive && 'text-ink-2')}>
                  {rankLabel(r.level)}
                </span>,
                <NumField key="b" label={`Self capital, ${rankLabel(r.level)}`} value={self} prefix="$" width="w-[120px]"
                          dirty={!sameValue(self, r.selfCapital)} invalid={!isValidPlanNumber(self, MONEY_MAX)}
                          onChange={(v) => set(`${r.id}:self`, v)} />,
                <NumField key="c" label={`Team business, ${rankLabel(r.level)}`} value={team} prefix="$" width="w-[140px]"
                          dirty={!sameValue(team, r.teamBusiness)} invalid={!isValidPlanNumber(team, MONEY_MAX)}
                          onChange={(v) => set(`${r.id}:team`, v)} />,
                <NumField key="d" label={`Reward, ${rankLabel(r.level)}`} value={reward} prefix="$" width="w-[128px]"
                          dirty={!sameValue(reward, r.reward)} invalid={!isValidPlanNumber(reward, MONEY_MAX)}
                          onChange={(v) => set(`${r.id}:reward`, v)} />,
                <span key="e" className="inline-flex items-center gap-2">
                  <Toggle
                    on={r.isActive}
                    busy={toggle.isPending}
                    label={`${r.isActive ? 'Retire' : 'Reinstate'} ${rankLabel(r.level)}`}
                    onChange={async () => {
                      if (r.isActive && !(await askConfirm({
                        title: `Retire ${rankLabel(r.level)}?`,
                        body: `No member will qualify for ${rankLabel(r.level)} or its ${usd(r.reward, 0)} reward while it is retired. Rewards already paid are not affected.`,
                        confirmLabel: 'Retire rank',
                        tone: 'danger',
                      }))) return;
                      toggle.mutate(r);
                    }}
                  />
                  <span className={clsx('text-[12px]', r.isActive ? 'text-ink-2' : 'text-ink-3')}>
                    {r.isActive ? 'Live' : 'Retired'}
                  </span>
                </span>,
              ];
            })}
          />
        </SectionBody>
        <SaveBar
          dirtyCount={writes.length}
          invalidCount={invalid}
          saving={save.isPending}
          noun="rank"
          note="applies to members who qualify from now on"
          onDiscard={reset}
          onSave={async () => {
            if (!(await askConfirm({
              title: `Change ${writes.length} ${writes.length === 1 ? 'rank' : 'ranks'}?`,
              body: `${writes.map((w) => rankLabel(w.level)).join(', ')} will be rewritten. Requirements and rewards apply to every member who qualifies from now on; rewards already paid are untouched.`,
              confirmLabel: 'Save ranks',
              tone: 'primary',
            }))) return;
            save.mutate(writes);
          }}
        />
      </Card>

      <Card>
        <CardHead
          title="Rank achievements"
          subtitle="Every rank a member has reached, newest first. Each rank pays once."
          action={achievements.data ? (
            <span className="text-[12.5px] text-ink-2">
              {/* Awarded and credited are different figures once rewards vest.
                  One line saying "paid" for the award total tells an operator
                  money has left the platform when it has not. */}
              {num(achievements.data.total)} achieved ·{' '}
              <span className="tabular-nums">{usd(achievements.data.credited)}</span> credited{' '}
              of <span className="tabular-nums">{usd(achievements.data.awarded)}</span> awarded
            </span>
          ) : undefined}
        />
        <SectionBody q={achievements} rows={4}>
          <Table
            head={['Achieved', 'Member', 'Rank', 'Reward']}
            empty="No ranks achieved yet. Members qualify automatically against the ladder above."
            rows={(achievements.data?.rows ?? []).map((a) => [
              <span key="a" className="text-ink-2">{shortDate(a.achievedAt)}</span>,
              <span key="b" className="font-medium">{a.userCode}</span>,
              <span key="c" className="tabular-nums">{rankLabel(a.rankLevel)}</span>,
              <span key="d" className="font-medium tabular-nums text-good">+{usd(a.reward)}</span>,
            ])}
          />
        </SectionBody>
      </Card>
    </div>
  );
}
