import { Check, Copy } from 'lucide-react';
import { usd, shortDate } from '@/lib/format';
import { BrandMark } from '@/components/layout/brand-mark';

interface MemberCardProps {
  name: string;
  userCode: string | undefined;
  rank: string;
  sponsor: string;
  invested: string | undefined;
  earned: string | undefined;
  joinedAt: string | undefined;
  copied: boolean;
  onCopy: () => void;
}

/**
 * The member's identity, as a physical object.
 *
 * Everything visual lives in `.metal-card` (globals.css), including the type
 * scale — the card is a CSS container, so its contents size against the card
 * rather than the viewport and it shrinks as one piece. This file only lays
 * out the facts a membership card carries. Dark in both themes on purpose:
 * see the note on `.metal-card`.
 */
export function MemberCard({
  name, userCode, rank, sponsor, invested, earned, joinedAt, copied, onCopy,
}: MemberCardProps) {
  const facts = [
    { k: 'Rank', v: rank },
    { k: 'Sponsor', v: sponsor },
    { k: 'Invested', v: usd(invested) },
    { k: 'Earned', v: usd(earned) },
  ];

  return (
    <div className="metal-card overflow-hidden rounded-[5px]">
      {/* The mark is the one place gold appears — the rest of the card is
          steel, so the branding lands without shouting. */}
      {/* Just "Member". The mark sits beside it and already says whose card
          this is — naming the brand twice in one row was redundant even
          before it became an operator setting. */}
      <div className="flex items-start justify-between gap-3">
        <p className="metal-card-brand font-medium uppercase tracking-[0.22em]">
          Member
        </p>
        <BrandMark ink="onDark" />
      </div>

      <div className="min-w-0">
        <p className="metal-card-name truncate font-semibold leading-tight tracking-[-0.01em]">
          {name}
        </p>
        <button
          onClick={onCopy}
          className="metal-card-id metal-card-muted mt-0.5 flex items-center gap-1.5 whitespace-nowrap rounded tracking-[0.08em] tabular-nums transition-colors hover:text-[#D8DCE0] focus-visible:outline-2 focus-visible:outline-offset-2"
          aria-label={userCode ? `Copy member ID ${userCode}` : 'Copy member ID'}
        >
          {userCode ?? '—'}
          {copied
            ? <Check className="size-[1em] shrink-0 text-good" />
            : <Copy className="size-[1em] shrink-0" />}
        </button>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-[3cqw]">
        {facts.map((x) => (
          <div key={x.k} className="min-w-0">
            <dt className="metal-card-label font-medium uppercase tracking-[0.16em]">
              {x.k}
            </dt>
            <dd className="metal-card-value mt-[0.5cqw] truncate font-semibold tabular-nums">
              {x.v}
            </dd>
          </div>
        ))}
      </dl>

      <p className="metal-card-date metal-card-muted">
        Member since {joinedAt ? shortDate(joinedAt) : '—'}
      </p>
    </div>
  );
}
