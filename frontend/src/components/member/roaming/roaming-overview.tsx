'use client';

import { Sparkles, User, Users } from 'lucide-react';
import { usd } from '@/lib/format';
import { QualificationTrack } from './qualification-track';
import { TRACK_META, type TierView } from './types';

/**
 * What the Roaming Club is, and the two independent routes into it — the
 * explanation and the member's live standing on each route in one panel.
 */
export function RoamingOverview({ tiers }: { tiers: TierView[] }) {
  const forTrack = (track: string) => tiers.filter((t) => t.track === track);

  const self = forTrack('SELF_CAPITALIST');
  const affiliate = forTrack('AFFILIATE');

  const selfNext = self.find((t) => !t.achieved) ?? null;
  const affiliateNext = affiliate.find((t) => !t.achieved) ?? null;

  return (
    <section className="overflow-hidden rounded-[16px] border border-line bg-card shadow-card">
      <header className="flex items-start gap-3 px-5 pb-4 pt-5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-gold to-gold-hi text-gold-on ring-1 ring-gold/40">
          <Sparkles size={18} strokeWidth={2.2} aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold leading-tight tracking-[-0.01em] text-ink">Roaming Club</h2>
          <p className="mt-1 max-w-[70ch] text-[12.5px] leading-relaxed text-ink-2">
            Travel rewards are earned through performance. You can qualify through two independent
            tracks — <span className="font-medium text-ink">either one</span> is enough. Roaming Club
            rewards sit outside your earnings cap.
          </p>
        </div>
      </header>

      <div className="border-t border-line-soft p-4 sm:p-5">
        <div className="grid gap-3.5 md:grid-cols-2">
          {self.length > 0 && (
            <QualificationTrack
              title={TRACK_META.SELF_CAPITALIST.title}
              description={TRACK_META.SELF_CAPITALIST.description}
              icon={User}
              tone="gold"
              current={Number(self[0].selfActual)}
              target={selfNext ? Number(selfNext.selfRequirement) : null}
              nextDestination={selfNext?.destination}
              unlocked={self.filter((t) => t.achieved).length}
              total={self.length}
              footnote={TRACK_META.SELF_CAPITALIST.blurb}
            />
          )}

          {affiliate.length > 0 && (
            <QualificationTrack
              title={TRACK_META.AFFILIATE.title}
              description={TRACK_META.AFFILIATE.description}
              icon={Users}
              tone="violet"
              current={Number(affiliate[0].teamActual)}
              target={affiliateNext ? Number(affiliateNext.teamRequirement) : null}
              nextDestination={affiliateNext?.destination}
              unlocked={affiliate.filter((t) => t.achieved).length}
              total={affiliate.length}
              footnote={
                affiliateNext
                  ? `${affiliateNext.destination} also needs ${usd(affiliateNext.selfRequirement, 0)} of self capital.`
                  : TRACK_META.AFFILIATE.blurb
              }
            />
          )}
        </div>
      </div>
    </section>
  );
}
