'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { clsx } from 'clsx';
import { adminGet, adminPost } from '@/lib/admin-api';
import { toastError } from '@/lib/toast';
import { Card, CardHead, Table, Badge, Button } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/modal';
import { useConfirmOk } from '@/components/ui/confirm';
import { usd, num, pct } from '@/lib/format';
import { SectionBody, isValidPlanNumber, MONEY_MAX } from '@/components/admin/plan-editor';
import type { RewardTier } from './types';

const EMPTY = { name: '', threshold: '', bonusPercent: '', maxBonus: '' };
type Form = typeof EMPTY & { id?: string };

const FIELDS = [
  { key: 'name', label: 'Card name', mode: 'text', max: 0, hint: 'Shown to the member on the Rewards page.' },
  { key: 'threshold', label: 'Unlocks at', mode: 'decimal', prefix: '$', max: MONEY_MAX, hint: 'Capital a member must reach for the card to appear.' },
  { key: 'bonusPercent', label: 'Bonus', mode: 'decimal', suffix: '%', max: 100, hint: 'Percent of their capital the card is worth.' },
  { key: 'maxBonus', label: 'Capped at', mode: 'decimal', prefix: '$', max: MONEY_MAX, hint: 'The most this card can ever pay, whatever the percent works out to.' },
] as const;

export function RewardsSection() {
  const qc = useQueryClient();
  const askConfirm = useConfirmOk();
  const [form, setForm] = useState<Form | null>(null);

  const q = useQuery({ queryKey: ['admin', 'reward-tiers'], queryFn: () => adminGet<RewardTier[]>('/admin/reward-tiers') });

  const save = useMutation({
    mutationFn: (t: Form) => adminPost('/admin/reward-tiers', t),
    onSuccess: (_d, t) => {
      toast.success(t.id ? 'Reward tier updated' : 'Reward tier created');
      setForm(null);
      qc.invalidateQueries({ queryKey: ['admin', 'reward-tiers'] });
    },
    onError: (e) => toastError(e),
  });

  const rows = q.data ?? [];
  const bad = (f: Form) =>
    f.name.trim().length < 2 ||
    FIELDS.some((x) => x.mode !== 'text' && !isValidPlanNumber(String(f[x.key as keyof Form] ?? ''), x.max));

  return (
    <>
      <Card>
        <CardHead
          title="Reward cards"
          subtitle="Milestones that unlock a bonus card. A card already issued keeps the amount it was issued with, so retuning a tier never rewrites what a member is holding."
          action={<Button size="sm" onClick={() => setForm({ ...EMPTY })}><Plus size={14} /> New tier</Button>}
        />
        <SectionBody q={q} rows={3}>
          <Table
            head={['Tier', 'Unlocks at', 'Bonus', 'Capped at', 'Status', '']}
            empty="No reward tiers configured. The members’ Rewards page stays empty until at least one exists."
            rows={rows.map((t) => [
              <span key="n" className={clsx('font-medium', !t.isActive && 'text-ink-2')}>{t.name}</span>,
              <span key="t" className="tabular-nums">{usd(t.threshold, 0)}</span>,
              <span key="p" className="tabular-nums">{pct(t.bonusPercent, 2)}</span>,
              <span key="m" className="tabular-nums text-ink-2">{usd(t.maxBonus, 0)}</span>,
              <Badge key="s" tone={t.isActive ? 'good' : 'neutral'}>{t.isActive ? 'Active' : 'Off'}</Badge>,
              <Button key="e" size="sm" variant="outline" onClick={() => setForm({
                id: t.id, name: t.name, threshold: String(t.threshold),
                bonusPercent: String(t.bonusPercent), maxBonus: String(t.maxBonus),
              })}>Edit</Button>,
            ])}
          />
        </SectionBody>
      </Card>

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        width="lg"
        title={form?.id ? `Edit ${form.name || 'reward tier'}` : 'New reward tier'}
        description="Cards already issued are unaffected — they keep the amount recorded on them when they were earned."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setForm(null)}>Cancel</Button>
            <Button size="sm" loading={save.isPending} disabled={!form || bad(form)}
                    onClick={async () => {
                      if (!form) return;
                      if (!(await askConfirm({
                        title: form.id ? `Update ${form.name}?` : `Create ${form.name}?`,
                        body: `Members reaching ${usd(form.threshold, 0)} will unlock a card worth ${pct(form.bonusPercent, 2)} of their capital, up to ${usd(form.maxBonus, 0)}.`,
                        confirmLabel: form.id ? 'Update tier' : 'Create tier',
                        tone: 'primary',
                      }))) return;
                      save.mutate(form);
                    }}>
              {form?.id ? 'Save tier' : 'Create tier'}
            </Button>
          </>
        }
      >
        {form && (
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map((f) => {
              const value = String(form[f.key as keyof Form] ?? '');
              const invalid = f.mode === 'text'
                ? value.trim().length > 0 && value.trim().length < 2
                : value !== '' && !isValidPlanNumber(value, f.max);
              return (
                <label key={f.key} className={clsx('block', f.key === 'name' && 'sm:col-span-2')}>
                  <span className="mb-1 block text-[12px] font-medium text-ink-2">{f.label}</span>
                  <span className={clsx(
                    'flex h-10 items-center gap-1 rounded-[9px] border bg-field px-3 transition',
                    'focus-within:ring-4 focus-within:ring-gold/15',
                    invalid ? 'border-bad ring-2 ring-bad/25' : 'border-field-line focus-within:border-gold',
                  )}>
                    {'prefix' in f && f.prefix && <span aria-hidden className="text-[13px] text-ink-3">{f.prefix}</span>}
                    <input
                      value={value}
                      aria-invalid={invalid || undefined}
                      inputMode={f.mode === 'text' ? undefined : 'decimal'}
                      onChange={(e) => setForm((s) => s && { ...s, [f.key]: e.target.value })}
                      className={clsx('w-full min-w-0 bg-transparent text-[13px] text-ink outline-none', f.mode !== 'text' && 'tabular-nums')}
                    />
                    {'suffix' in f && f.suffix && <span aria-hidden className="text-[13px] text-ink-3">{f.suffix}</span>}
                  </span>
                  <span className="mt-1 block text-[11.5px] leading-relaxed text-ink-3">{f.hint}</span>
                </label>
              );
            })}
          </div>
        )}
      </Modal>
    </>
  );
}
