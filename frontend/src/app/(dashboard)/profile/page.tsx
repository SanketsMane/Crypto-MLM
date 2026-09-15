'use client';

import Link from 'next/link';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { toastError } from '@/lib/toast';
import { Check, Copy, ShieldCheck, ChevronRight } from 'lucide-react';
import { get, patch, apiErrorMessage } from '@/lib/api';
import { Card, CardHead, Button, Badge, controlCls } from '@/components/ui/primitives';
import { MemberCard } from '@/components/member/member-card';
import { usd, shortDate } from '@/lib/format';
import { rankLabel } from '@/lib/rank';

interface Profile {
  id: string; userCode: string; email: string; phone: string | null;
  firstName: string; lastName: string | null; status: string; affiliateMode: string;
  walletAddress: string | null; totalInvested: string; totalEarned: string;
  directCount: number; rank: { code: string; name: string; level: number } | null;
  sponsor: { userCode: string; firstName: string } | null;
  teamBusiness: string; joinedAt: string;
}

export default function ProfilePage() {
  const qc = useQueryClient();
  const { data: p } = useQuery({ queryKey: ['member', 'profile'], queryFn: () => get<Profile>('/customer/profile') });
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', walletAddress: '' });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (p) setForm({
      firstName: p.firstName ?? '', lastName: p.lastName ?? '',
      phone: p.phone ?? '', walletAddress: p.walletAddress ?? '',
    });
  }, [p]);

  const save = useMutation({
    mutationFn: () => patch('/customer/profile', form),
    onSuccess: () => { toast.success('Profile updated'); qc.invalidateQueries({ queryKey: ['member'] }); },
    onError: (e) => toastError(e),
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const copyCode = async () => {
    if (!p) return;
    try { await navigator.clipboard.writeText(p.userCode); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch {}
  };

  const validAddress = !form.walletAddress || /^0x[a-fA-F0-9]{40}$/.test(form.walletAddress);

  return (
    <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-12">
      <div className="lg:col-span-5">
        <MemberCard
          name={[p?.firstName, p?.lastName].filter(Boolean).join(' ') || '—'}
          userCode={p?.userCode}
          rank={p?.rank ? rankLabel(p.rank.level) : 'Unranked'}
          sponsor={p?.sponsor?.userCode ?? 'Root account'}
          invested={p?.totalInvested}
          earned={p?.totalEarned}
          joinedAt={p?.joinedAt}
          copied={copied}
          onCopy={copyCode}
        />

        <Card className="mt-3.5">
          <CardHead title="Account status" />
          <dl className="space-y-2.5 px-3.5 pb-3.5 text-[13px]">
            {[
              { k: 'Status', v: <Badge tone={p?.status === 'ACTIVE' ? 'good' : 'neutral'}>{p?.status ?? '—'}</Badge> },
              { k: 'Earnings cap', v: <Badge tone="info">{p?.affiliateMode === 'ACTIVE' ? '300%' : '250%'}</Badge> },
              { k: 'Direct referrals', v: <span className="tabular-nums">{p?.directCount ?? 0}</span> },
              { k: 'Team business', v: <span className="tabular-nums">{usd(p?.teamBusiness)}</span> },
            ].map((x) => (
              <div key={x.k} className="flex items-center justify-between">
                <dt className="text-ink-2">{x.k}</dt><dd>{x.v}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      <div className="space-y-3.5 lg:col-span-7">
        <Card>
          <CardHead title="Personal details" />
          <form className="space-y-3.5 px-3.5 pb-3.5" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[12.5px] font-medium text-ink">First name</span>
                <input value={form.firstName} onChange={set('firstName')} required className={`${controlCls} h-11 w-full`} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12.5px] font-medium text-ink">Last name</span>
                <input value={form.lastName} onChange={set('lastName')} className={`${controlCls} h-11 w-full`} />
              </label>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-[12.5px] font-medium text-ink">Email</span>
              <input value={p?.email ?? ''} disabled className={`${controlCls} h-11 w-full opacity-60`} />
              <span className="mt-1 block text-[11.5px] text-ink-3">Contact support to change your email.</span>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[12.5px] font-medium text-ink">Phone</span>
              <input value={form.phone} onChange={set('phone')} className={`${controlCls} h-11 w-full`} />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[12.5px] font-medium text-ink">Payout wallet (BEP-20)</span>
              <input value={form.walletAddress} onChange={set('walletAddress')} placeholder="0x…"
                     className={`${controlCls} h-11 w-full`} />
              {!validAddress && <span className="mt-1 block text-[11.5px] text-bad">That is not a valid BEP-20 address.</span>}
            </label>

            <Button type="submit" loading={save.isPending} disabled={!validAddress}>Save changes</Button>
          </form>
        </Card>

        <Card>
          <CardHead title="Security" />
          <div className="px-3.5 pb-3.5">
            <Link href="/security"
                  className="flex items-start gap-3 rounded-[5px] border border-line bg-canvas px-4 py-3.5 transition hover:border-line-strong hover:bg-line/20">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[4px] bg-gold-soft text-gold">
                <ShieldCheck size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium text-ink">Password &amp; two-factor</p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-ink-2">
                  Change your password, turn on two-factor authentication, review the devices you are
                  signed in on, and check recent account activity.
                </p>
              </div>
              <ChevronRight size={16} className="mt-1 shrink-0 text-ink-3" />
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
