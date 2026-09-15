'use client';

import { useState } from 'react';
import { Check, Copy, UserRound } from 'lucide-react';
import { usd, shortDate } from '@/lib/format';
import { rankLabel } from '@/lib/rank';

/**
 * Who the member is, in one panel — a plain premium information card, not the
 * metallic membership card that lives on /profile.
 *
 * `sponsor` is optional because the dashboard aggregate does not carry it; the
 * caller supplies it when it has it and the row reads "—" until then, rather
 * than inventing a value.
 */
export function MemberSummary({ profile, invested, earned, sponsor, joinedAt }: {
  profile?: { name: string; userCode: string; rank: { name: string; level: number } | null };
  invested?: string;
  earned?: string;
  sponsor?: string;
  joinedAt?: string;
}) {
  const [copied, setCopied] = useState(false);

  // Unchanged from the panel this replaces: same clipboard call, same 1.6s
  // confirmation window.
  const copy = async () => {
    if (!profile?.userCode) return;
    try {
      await navigator.clipboard.writeText(profile.userCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard unavailable */ }
  };

  const facts = [
    { k: 'Rank', v: profile?.rank ? rankLabel(profile.rank.level) : 'Unranked' },
    { k: 'Sponsor', v: sponsor ?? '—' },
    { k: 'Invested', v: usd(invested) },
    { k: 'Earned', v: usd(earned) },
  ];

  return (
    <section className="dash-card flex flex-col gap-5 p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[5px] bg-[linear-gradient(135deg,var(--color-gold-hi)_0%,var(--color-gold)_100%)] text-navy">
          <UserRound size={19} strokeWidth={2.2} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[16px] font-semibold leading-tight text-ink">
            {profile?.name ?? '—'}
          </p>
          <button
            onClick={copy}
            className="mt-0.5 flex items-center gap-1.5 whitespace-nowrap rounded text-[12px] tabular-nums text-ink-3 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2"
            aria-label={profile?.userCode ? `Copy member ID ${profile.userCode}` : 'Copy member ID'}
          >
            ID: {profile?.userCode ?? '—'}
            {copied ? <Check size={12} className="text-good" /> : <Copy size={12} />}
          </button>
        </div>
      </div>

      {/* Hairline grid: one rule under the header, one between the two rows. */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 border-t border-[var(--dash-border)] pt-4">
        {facts.map((x, i) => (
          <div
            key={x.k}
            className={`min-w-0 ${i > 1 ? 'border-t border-[var(--dash-border)] pt-4' : ''}`}
          >
            <dt className="text-[10px] font-medium uppercase tracking-[0.1em] text-ink-3">{x.k}</dt>
            <dd className="mt-1 truncate text-[15px] font-semibold tabular-nums text-ink">{x.v}</dd>
          </div>
        ))}
      </dl>

      <p className="text-[11.5px] text-ink-3">
        Member since {joinedAt ? shortDate(joinedAt) : '—'}
      </p>
    </section>
  );
}
