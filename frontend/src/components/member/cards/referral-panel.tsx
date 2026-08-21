'use client';

import { useState } from 'react';
import { Check, Copy, Share2, Users } from 'lucide-react';
import { Card, CardHead } from '@/components/ui/primitives';
import { num, usd } from '@/lib/format';

export function ReferralPanel({ profile, team, className }: {
  profile?: { userCode: string; referralLink: string };
  team?: { directCount: number; activeDirectCount: number; teamSize: number; directBusiness: string };
  /** Surface style from the caller — /team and the dashboard differ. */
  className?: string;
}) {
  const [copied, setCopied] = useState<'link' | 'code' | null>(null);
  const copy = async (what: 'link' | 'code', value: string) => {
    try { await navigator.clipboard.writeText(value); setCopied(what); setTimeout(() => setCopied(null), 1800); } catch {}
  };

  const share = async () => {
    if (!profile?.referralLink) return;
    if (navigator.share) {
      await navigator.share({ title: 'Join me on FortuneX', url: profile.referralLink }).catch(() => undefined);
    } else void copy('link', profile.referralLink);
  };

  return (
    <Card className={`h-full ${className ?? ''}`}>
      <CardHead title="Invite & Earn" />
      <div className="px-5 pb-5">
        <p className="text-[12.5px] leading-relaxed text-ink-2">
          Share your link. You earn on their investment and on every level beneath them.
        </p>

        <div className="mt-3.5 space-y-2">
          <div className="flex items-center gap-2 rounded-[10px] border border-line bg-canvas px-3 py-2.5">
            <span className="min-w-0 flex-1 truncate text-[12px] text-ink">{profile?.referralLink ?? '—'}</span>
            <button onClick={() => profile && copy('link', profile.referralLink)} aria-label="Copy referral link"
                    className="shrink-0 rounded-md p-1.5 text-ink-2 transition hover:bg-card hover:text-ink">
              {copied === 'link' ? <Check size={15} className="text-good" /> : <Copy size={15} />}
            </button>
          </div>

          <div className="flex gap-2">
            <button onClick={() => profile && copy('code', profile.userCode)}
                    className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-line px-3 py-2.5 text-[12.5px] font-medium text-ink-2 transition hover:border-ink-3 hover:text-ink">
              {copied === 'code' ? <Check size={14} className="shrink-0 text-good" /> : <Copy size={14} className="shrink-0" />}
              <span className="truncate">{profile?.userCode ?? '—'}</span>
            </button>
            <button onClick={share}
                    className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-violet px-3 py-2.5 text-[12.5px] font-semibold text-white transition hover:bg-violet-hi">
              <Share2 size={14} className="shrink-0" /> Share
            </button>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-[10px] border border-line bg-line">
          {[
            { k: 'Directs', v: num(team?.directCount ?? 0), s: `${team?.activeDirectCount ?? 0} active` },
            { k: 'Team', v: num(team?.teamSize ?? 0), s: 'members' },
            { k: 'Direct vol.', v: usd(team?.directBusiness, 0), s: 'invested' },
          ].map((x) => (
            <div key={x.k} className="min-w-0 bg-card px-2 py-2.5 text-center">
              <dt className="truncate text-[10px] uppercase tracking-[0.04em] text-ink-2">{x.k}</dt>
              <dd className="mt-1 text-[16px] font-semibold tabular-nums text-ink">{x.v}</dd>
              <dd className="truncate text-[10.5px] text-ink-3">{x.s}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-ink-3">
          <Users size={12} /> Direct sponsor pays 4% · 0.5% · 0.5% across three levels.
        </p>
      </div>
    </Card>
  );
}
