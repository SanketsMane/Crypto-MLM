'use client';

import { Plane } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/primitives';
import { usd, shortDate } from '@/lib/format';
import { RequirementProgress } from './requirement-progress';
import { trackMeta, windowLabel, type TierView } from './types';

/**
 * Requirement breakdown for one tier. Read-only by design: the platform has no
 * claim or booking flow for Flyers Club, so this reports the position rather
 * than offering an action that does not exist.
 */
export function DestinationDetail({ tier, onClose }: { tier: TierView | null; onClose: () => void }) {
  if (!tier) return null;

  const meta = trackMeta(tier.track);
  const shortfall = (actual: string, required: string) => Math.max(0, Number(required) - Number(actual));
  const selfLeft = shortfall(tier.selfActual, tier.selfRequirement);
  const teamLeft = shortfall(tier.teamActual, tier.teamRequirement);

  return (
    <Modal
      open
      onClose={onClose}
      title={tier.destination}
      description={`${meta.title} · ${meta.blurb}`}
      width="lg"
      icon={
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-gold-soft text-gold-on-soft ring-1 ring-gold/30">
          <Plane size={16} strokeWidth={2.2} aria-hidden />
        </span>
      }
      footer={<Button variant="outline" onClick={onClose}>Close</Button>}
    >
      <div className="space-y-4 pb-2">
        {/* What is being won, and by when — stated before the requirements,
            because both decide whether the requirements are worth meeting. */}
        {(tier.rewardLabel || windowLabel(tier)) && (
          <div className="rounded-[11px] border border-gold/35 bg-gold-soft p-4">
            {tier.rewardLabel && (
              <p className="text-[13px] font-semibold leading-snug text-gold-on-soft">
                {tier.rewardLabel}
              </p>
            )}
            {windowLabel(tier) && (
              <p className="mt-1 text-[11.5px] text-gold-on-soft/80">
                {tier.expired
                  ? `This offer ${windowLabel(tier)} and can no longer be earned.`
                  : tier.upcoming
                    ? `This offer ${windowLabel(tier)}.`
                    : `Qualify before it ${windowLabel(tier)}.`}
              </p>
            )}
          </div>
        )}

        {tier.needsSelf && (
          <div className="rounded-[11px] border border-line bg-canvas-2 p-4">
            <RequirementProgress
              label="Self capital"
              actual={tier.selfActual}
              required={tier.selfRequirement}
              tone="gold"
            />
            <p className="mt-2 text-[11.5px] text-ink-3">
              {selfLeft > 0
                ? `${usd(selfLeft, 0)} of further personal investment qualifies this requirement.`
                : 'Requirement met.'}
            </p>
          </div>
        )}

        {tier.needsTeam && (
          <div className="rounded-[11px] border border-line bg-canvas-2 p-4">
            <RequirementProgress
              label="Team business"
              actual={tier.teamActual}
              required={tier.teamRequirement}
              tone="violet"
            />
            <p className="mt-2 text-[11.5px] text-ink-3">
              {teamLeft > 0
                ? `${usd(teamLeft, 0)} of further team business qualifies this requirement.`
                : 'Requirement met.'}
            </p>
          </div>
        )}

        <p className="text-[12.5px] leading-relaxed text-ink-2">
          {tier.achieved
            ? `Qualified${tier.achievedAt ? ` on ${shortDate(tier.achievedAt)}` : ''}${tier.status ? ` · award status: ${tier.status.toLowerCase()}` : ''}. Flyers Club awards are travel entitlements, not cash — the FortuneX team arranges fulfilment and will be in touch.`
            : tier.needsTeam
              ? 'Both requirements must be met before this destination is awarded. Qualification is evaluated automatically as your capital and team business grow.'
              : 'This destination is awarded on your own capital alone. Qualification is evaluated automatically as your capital grows.'}
        </p>
      </div>
    </Modal>
  );
}
