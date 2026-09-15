'use client';

import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { PageHeader } from '@/components/ui/primitives';
import { PackagesSection } from '@/components/admin/plans/packages-section';
import { CommissionsSection } from '@/components/admin/plans/commissions-section';
import { RanksSection } from '@/components/admin/plans/ranks-section';
import { RewardsSection } from '@/components/admin/plans/rewards-section';
import { RoamingSection } from '@/components/admin/plans/roaming-section';

/**
 * The compensation plan, as data.
 *
 * Split into tabs rather than the single nine-thousand-pixel column this
 * replaces. Each tab is one editing job with one shape of decision behind it,
 * and an operator looking for the Flyers Club no longer scrolls past thirty
 * rows of generation levels to reach it. The tab is in the URL hash so a
 * particular section can be linked to and survives a refresh.
 */
const TABS = [
  { id: 'packages', label: 'Packages', render: () => <PackagesSection /> },
  { id: 'commissions', label: 'Commissions', render: () => <CommissionsSection /> },
  { id: 'ranks', label: 'Ranks', render: () => <RanksSection /> },
  { id: 'rewards', label: 'Reward cards', render: () => <RewardsSection /> },
  { id: 'roaming', label: 'Offers', render: () => <RoamingSection /> },
] as const;

type TabId = (typeof TABS)[number]['id'];
const isTab = (v: string): v is TabId => TABS.some((t) => t.id === v);

export default function PlansPage() {
  const [tab, setTab] = useState<TabId>('packages');

  // Read on mount rather than during render: the hash does not exist on the
  // server, and reading it in state initialisation makes the first client
  // render disagree with the markup that was sent.
  useEffect(() => {
    const fromHash = window.location.hash.slice(1);
    if (isTab(fromHash)) setTab(fromHash);
  }, []);

  const select = (id: TabId) => {
    setTab(id);
    window.history.replaceState(null, '', `#${id}`);
  };

  const active = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <>
      <PageHeader
        title="Plans"
        subtitle="Investment tiers, commission levels, ranks, reward cards and affiliate offers. The plan is data — every change here is audited and applies from the next payout run, never retroactively."
      />

      <div
        role="tablist"
        aria-label="Plan sections"
        className="mb-4 flex flex-wrap items-center gap-1 border-b border-line"
      >
        {TABS.map((t) => {
          const on = t.id === tab;
          return (
            <button
              key={t.id}
              role="tab"
              id={`plans-tab-${t.id}`}
              aria-selected={on}
              aria-controls={`plans-panel-${t.id}`}
              onClick={() => select(t.id)}
              className={clsx(
                'relative -mb-px rounded-t-[7px] px-3.5 py-2.5 text-[13px] font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/25',
                on
                  ? 'border-b-2 border-gold text-ink'
                  : 'border-b-2 border-transparent text-ink-2 hover:text-ink',
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`plans-panel-${active.id}`}
        aria-labelledby={`plans-tab-${active.id}`}
      >
        {active.render()}
      </div>
    </>
  );
}
