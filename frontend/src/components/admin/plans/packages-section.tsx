'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { clsx } from 'clsx';
import { Plus } from 'lucide-react';
import { adminGet, adminPost } from '@/lib/admin-api';
import { toastError } from '@/lib/toast';
import { Card, CardHead, Table, Button } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/modal';
import { useConfirmOk } from '@/components/ui/confirm';
import { usd, num, pct } from '@/lib/format';
import {
  SectionBody, Toggle, isValidPlanNumber, MONEY_MAX,
} from '@/components/admin/plan-editor';
import { ceilingUsd, daysToCap, type Pkg } from './types';

const EMPTY = { name: '', amount: '', dailyRoiPercent: '0.5', capPercent: '250', sortOrder: '0', isActive: true };
type Form = typeof EMPTY & { id?: string };

const FIELDS = [
  { key: 'name', label: 'Plan name', mode: 'text', hint: 'What members see when they buy. Shown on invoices and in their portfolio.' },
  { key: 'amount', label: 'Capital', mode: 'decimal', prefix: '$', max: MONEY_MAX, hint: 'The one-off amount a member pays to open this plan.' },
  { key: 'dailyRoiPercent', label: 'Daily trade bonus', mode: 'decimal', suffix: '%', max: 100, hint: 'Accrued on trading days only — Mon to Fri by default.' },
  { key: 'capPercent', label: 'Earn limit', mode: 'decimal', suffix: '%', max: 10_000, hint: 'Total a member may earn from this plan, as a percent of capital.' },
  { key: 'sortOrder', label: 'Display order', mode: 'numeric', max: 9_999, hint: 'Low numbers first, in the members’ plan list.' },
] as const;

export function PackagesSection() {
  const qc = useQueryClient();
  const askConfirm = useConfirmOk();
  const [form, setForm] = useState<Form | null>(null);

  const q = useQuery({ queryKey: ['admin', 'packages'], queryFn: () => adminGet<Pkg[]>('/admin/packages') });
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'packages'] });

  const save = useMutation({
    mutationFn: (p: Form) => adminPost('/admin/packages', {
      ...(p.id ? { id: p.id } : {}),
      name: p.name.trim(), amount: p.amount, dailyRoiPercent: p.dailyRoiPercent,
      capPercent: p.capPercent, sortOrder: Number(p.sortOrder) || 0, isActive: p.isActive,
    }),
    onSuccess: (_d, p) => { toast.success(p.id ? 'Package updated' : 'Package created'); setForm(null); refresh(); },
    onError: (e) => toastError(e),
  });

  const toggle = useMutation({
    mutationFn: (p: Pkg) => adminPost('/admin/packages', { ...p, isActive: !p.isActive }),
    onSuccess: (_d, p) => { toast.success(p.isActive ? 'Package retired' : 'Package back on sale'); refresh(); },
    onError: (e) => toastError(e),
  });

  const rows = q.data ?? [];
  const live = rows.filter((p) => p.isActive).length;

  const invalid = (f: Form) =>
    !f.name.trim() ||
    FIELDS.some((x) => x.mode !== 'text' && !isValidPlanNumber(String(f[x.key as keyof Form] ?? ''), x.max as number));

  const preview = form && ceilingUsd(form.amount, form.capPercent);
  const days = form && daysToCap(form.capPercent, form.dailyRoiPercent);

  return (
    <>
      <Card>
        <CardHead
          title="Investment packages"
          subtitle={
            q.isLoading || q.isError
              ? 'The tiers a member can buy.'
              : `${num(rows.length)} configured · ${num(live)} on sale. Retiring a tier stops new purchases; investments already open keep the rate stored on them.`
          }
          action={<Button size="sm" onClick={() => setForm({ ...EMPTY })}><Plus size={14} /> New package</Button>}
        />

        <SectionBody q={q} rows={6}>
          <Table
            head={['#', 'Plan', 'Capital', 'Daily bonus', 'Earn limit', 'Lifetime ceiling', 'Status', '']}
            empty="No packages configured. Members cannot buy anything until at least one exists."
            rows={rows.map((p) => {
              const ceiling = ceilingUsd(p.amount, p.capPercent);
              return [
                <span key="n" className="tabular-nums text-ink-3">{p.sortOrder}</span>,
                <span key="a" className={clsx('font-medium', !p.isActive && 'text-ink-2')}>{p.name}</span>,
                <span key="b" className="font-medium tabular-nums">{usd(p.amount, 0)}</span>,
                <span key="c" className="tabular-nums">{pct(p.dailyRoiPercent, 2)}</span>,
                <span key="d" className="tabular-nums text-ink-2">{pct(p.capPercent, 0)}</span>,
                <span key="e" className="tabular-nums text-ink-2">{ceiling === null ? '—' : usd(ceiling, 0)}</span>,
                <span key="f" className="inline-flex items-center gap-2">
                  <Toggle
                    on={p.isActive}
                    busy={toggle.isPending}
                    label={`${p.isActive ? 'Retire' : 'Reinstate'} ${p.name}`}
                    onChange={async () => {
                      if (p.isActive && !(await askConfirm({
                        title: `Retire ${p.name}?`,
                        body: 'Members will no longer be able to buy this tier. Investments already open are unaffected and keep earning to their ceiling.',
                        confirmLabel: 'Retire package',
                        tone: 'primary',
                      }))) return;
                      toggle.mutate(p);
                    }}
                  />
                  <span className={clsx('text-[12px]', p.isActive ? 'text-ink-2' : 'text-ink-3')}>
                    {p.isActive ? 'On sale' : 'Retired'}
                  </span>
                </span>,
                <Button key="g" size="sm" variant="outline" onClick={() => setForm({
                  id: p.id, name: p.name, amount: p.amount, dailyRoiPercent: p.dailyRoiPercent,
                  capPercent: p.capPercent, sortOrder: String(p.sortOrder), isActive: p.isActive,
                })}>Edit</Button>,
              ];
            })}
          />
        </SectionBody>
      </Card>

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        width="lg"
        title={form?.id ? `Edit ${form.name || 'package'}` : 'New investment package'}
        description="Changing a tier affects new purchases only. Every investment already open keeps the rate and ceiling recorded on it at the time it was bought."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setForm(null)}>Cancel</Button>
            <Button
              size="sm"
              loading={save.isPending}
              disabled={!form || invalid(form)}
              onClick={async () => {
                if (!form) return;
                const c = ceilingUsd(form.amount, form.capPercent);
                if (!(await askConfirm({
                  title: form.id ? `Update ${form.name}?` : `Create ${form.name}?`,
                  body: c === null
                    ? 'This tier will be available to members immediately.'
                    : `A member paying ${usd(form.amount, 0)} can earn up to ${usd(c, 0)} from this tier before it caps.${form.id ? '' : ' It goes on sale immediately.'}`,
                  confirmLabel: form.id ? 'Update package' : 'Create package',
                  tone: 'primary',
                }))) return;
                save.mutate(form);
              }}
            >
              {form?.id ? 'Save package' : 'Create package'}
            </Button>
          </>
        }
      >
        {form && (
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map((f) => {
              const value = String(form[f.key as keyof Form] ?? '');
              const bad = f.mode === 'text'
                ? f.key === 'name' && value.trim().length > 0 && value.trim().length < 2
                : value !== '' && !isValidPlanNumber(value, f.max as number);
              return (
                <label key={f.key} className={clsx('block', f.key === 'name' && 'sm:col-span-2')}>
                  <span className="mb-1 block text-[12px] font-medium text-ink-2">{f.label}</span>
                  <span className={clsx(
                    'flex h-10 items-center gap-1 rounded-[4px] border bg-field px-3 transition',
                    'focus-within:ring-4 focus-within:ring-gold/15',
                    bad ? 'border-bad ring-2 ring-bad/25' : 'border-field-line focus-within:border-gold',
                  )}>
                    {'prefix' in f && f.prefix && <span aria-hidden className="text-[13px] text-ink-3">{f.prefix}</span>}
                    <input
                      value={value}
                      aria-invalid={bad || undefined}
                      inputMode={f.mode === 'text' ? undefined : f.mode}
                      onChange={(e) => setForm((s) => s && { ...s, [f.key]: e.target.value })}
                      className={clsx(
                        'w-full min-w-0 bg-transparent text-[13px] text-ink outline-none placeholder:text-field-ph',
                        f.mode !== 'text' && 'tabular-nums',
                      )}
                    />
                    {'suffix' in f && f.suffix && <span aria-hidden className="text-[13px] text-ink-3">{f.suffix}</span>}
                  </span>
                  <span className="mt-1 block text-[11.5px] leading-relaxed text-ink-3">{f.hint}</span>
                </label>
              );
            })}

            {/* What the numbers above actually commit the platform to. */}
            <div className="rounded-[5px] border border-line bg-canvas px-4 py-3 sm:col-span-2">
              <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-ink-2">What this tier pays out</p>
              {preview === null || days === null ? (
                <p className="mt-1 text-[13px] text-ink-3">Enter capital, daily bonus and earn limit to see the ceiling.</p>
              ) : (
                <p className="mt-1 text-[13px] leading-relaxed text-ink">
                  <span className="font-semibold tabular-nums">{usd(form.amount, 0)}</span> in, up to{' '}
                  <span className="font-semibold tabular-nums text-good">{usd(preview, 0)}</span> out —
                  reached in about <span className="font-semibold tabular-nums">{num(days)}</span> trading days
                  at {pct(form.dailyRoiPercent, 2)} a day.
                </p>
              )}
            </div>

            <label className="flex items-center gap-2.5 sm:col-span-2">
              <Toggle on={form.isActive} label="Package on sale"
                      onChange={(v) => setForm((s) => s && { ...s, isActive: v })} />
              <span className="text-[13px] text-ink-2">Available for members to buy</span>
            </label>
          </div>
        )}
      </Modal>
    </>
  );
}
