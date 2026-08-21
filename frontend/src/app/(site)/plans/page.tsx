import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BadgeCheck, Info } from 'lucide-react';
import { Container, Panel, Section, SectionHead } from '@/components/site/primitives';
import { PageHero } from '@/components/site/page-hero';
import { CtaBand } from '@/components/site/cta-band';
import { getPlan, planMoney } from '@/lib/platform-config.server';

/**
 * Async, because the description quotes live figures. A title that says
 * one fee while the platform charges another is the same defect as a page
 * that does.
 */
export async function generateMetadata(): Promise<Metadata> {
  const plan = await getPlan();
  return {
  title: 'Investment plans',
  description: `Ten FortuneX tiers from ${planMoney(plan.packages[0])} to ${planMoney(plan.packages[plan.packages.length - 1])}, each accruing ${plan.dailyReturnPercent}% per trading day up to a ${plan.capPassivePercent}% earnings ceiling.`,
};
}

const HIGHLIGHT = 4; // the tier used in the worked example elsewhere

export default async function PlansPage() {
  const plan = await getPlan();

  const rows = plan.packages.map((amount, i) => {
    const daily = (amount * plan.dailyReturnPercent) / 100;
    return {
      tier: i + 1,
      amount,
      daily,
      weekly: daily * 5,
      ceiling: (amount * plan.capPassivePercent) / 100,
      ceilingActive: (amount * plan.capActivePercent) / 100,
    };
  });

  const usd = (n: number) =>
    `$${n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

  return (
    <>
      <PageHero
        eyebrow="Investment plans"
        title={`Ten tiers. One set of terms.`}
        lead={`Every tier accrues the same ${plan.dailyReturnPercent}% daily trade bonus and carries the same ${plan.capPassivePercent}% earnings ceiling. Choosing a tier decides the scale of your position, never the rules that govern it.`}
      />

      {/* ── the terms, stated once ────────────────────────────────────── */}
      <Section>
        <Container>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { k: 'Daily trade bonus', v: `${plan.dailyReturnPercent}%`, note: `Of invested capital, ${plan.tradingDays}` },
              { k: 'Earnings ceiling', v: `${plan.capPassivePercent}%`, note: `${plan.capActivePercent}% for active affiliates` },
              { k: 'Withdrawal fee', v: `${plan.withdraw.feePercent}%`, note: `From ${planMoney(plan.withdraw.min)}, up to ${planMoney(plan.withdraw.max)} per request` },
              { k: 'Processing', v: `${plan.withdraw.slaHours}h`, note: plan.withdraw.network },
            ].map((s) => (
              <Panel key={s.k} className="p-6">
                <p className="text-[12px] uppercase tracking-[0.1em] text-white/45">{s.k}</p>
                <p className="mt-2 text-[30px] font-semibold tracking-[-0.03em] text-brand-gold tabular-nums">{s.v}</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-white/50">{s.note}</p>
              </Panel>
            ))}
          </div>
        </Container>
      </Section>

      {/* ── full table ────────────────────────────────────────────────── */}
      <Section tone="raised" className="pt-0 sm:pt-0 lg:pt-0">
        <Container>
          <SectionHead
            eyebrow="Every tier"
            title="The full ladder, with the arithmetic done"
            lead="These figures are the published rates applied to each tier. They describe how the plan pays, not how much you will earn — accrual stops at the ceiling and trading carries risk."
          />

          <div className="mt-10 overflow-x-auto rounded-2xl border border-white/[0.07]">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <caption className="sr-only">
                FortuneX investment tiers with daily bonus, weekly bonus and earnings ceiling
              </caption>
              <thead>
                <tr className="bg-navy-deep/70">
                  {['Tier', 'Capital', `Daily at ${plan.dailyReturnPercent}%`, 'Per trading week', `Ceiling at ${plan.capPassivePercent}%`, `Active at ${plan.capActivePercent}%`, ''].map((h) => (
                    <th key={h} scope="col"
                        className="whitespace-nowrap px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/50">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.tier}
                      className={`border-t border-white/[0.06] transition-colors hover:bg-white/[0.03] ${r.tier === HIGHLIGHT ? 'bg-brand-gold/[0.045]' : ''}`}>
                    <td className="whitespace-nowrap px-5 py-4 text-[13px] tabular-nums text-white/55">
                      {String(r.tier).padStart(2, '0')}
                      {r.tier === HIGHLIGHT && (
                        <span className="ml-2 rounded-full bg-brand-gold/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-gold">
                          popular
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-[15px] font-semibold tabular-nums text-white">{usd(r.amount)}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-[13.5px] tabular-nums text-brand-gold">{usd(r.daily)}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-[13.5px] tabular-nums text-white/70">{usd(r.weekly)}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-[13.5px] tabular-nums text-white/70">{usd(r.ceiling)}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-[13.5px] tabular-nums text-white/45">{usd(r.ceilingActive)}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-right">
                      <Link href="/register"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 px-3 py-1.5 text-[12.5px] font-medium text-white transition hover:border-brand-gold/45 hover:text-brand-gold">
                        Select <ArrowRight size={13} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4 flex items-start gap-2.5 text-[12.5px] leading-relaxed text-white/45">
            <Info size={15} className="mt-px shrink-0 text-brand-gold/70" />
            The ceiling is the total a tier can ever pay you, across the daily trade bonus and any
            network commissions credited while it is active. When it is reached the tier is marked
            capped and stops accruing. Purchasing an additional tier raises your ceiling by that
            tier&apos;s own amount.
          </p>
        </Container>
      </Section>

      {/* ── what every tier includes ──────────────────────────────────── */}
      <Section>
        <Container>
          <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-5">
              <SectionHead
                eyebrow="Included at every level"
                title="The tier sets the size — nothing else"
                lead="There is no premium tier with better terms, no rate that improves with volume, and no feature held back from smaller positions."
              />
            </div>
            <ul className="grid gap-3 sm:grid-cols-2 lg:col-span-7">
              {[
                { t: `${plan.dailyReturnPercent}% daily trade bonus`, b: `Applied ${plan.tradingDays} to your invested capital.` },
                { t: 'Full network eligibility', b: 'Direct bonus across three levels and generation bonus to thirty, subject to the published qualifications.' },
                { t: 'Rank progression', b: 'All ten executive ranks are reachable from any tier — they qualify on self capital and team business.' },
                { t: 'Roaming Club access', b: 'Travel awards sit outside the earnings ceiling and do not consume your cap.' },
                { t: 'Same withdrawal terms', b: `${plan.withdraw.feePercent}% fee and a ${plan.withdraw.slaHours}-hour processing window, whatever your tier.` },
                { t: 'Full ledger visibility', b: 'Every accrual, commission and fee is a line you can open in your own account.' },
              ].map((f) => (
                <li key={f.t}>
                  <Panel className="h-full p-5">
                    <p className="flex items-start gap-2.5 text-[14px] font-medium text-white">
                      <BadgeCheck size={16} className="mt-0.5 shrink-0 text-brand-gold/85" />
                      {f.t}
                    </p>
                    <p className="mt-1.5 pl-[26px] text-[12.5px] leading-relaxed text-white/50">{f.b}</p>
                  </Panel>
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </Section>

      <CtaBand
        title="Choose your tier"
        lead={`Entry starts at ${planMoney(plan.packages[0])}. You can add tiers later — each one brings its own ceiling with it.`}
      />
    </>
  );
}
