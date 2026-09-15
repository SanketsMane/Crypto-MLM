import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Plane, TrendingUp, Trophy, Users } from 'lucide-react';
import { getPlan, planMoney, offerDate } from '@/lib/platform-config.server';
import { PageHero } from '@/components/home/page-hero';
import { Container, SectionHead, CtaBand } from '@/components/home/sections';
import { Figure, Reveal } from '@/components/home/motion';

export const metadata: Metadata = {
  title: 'Opportunity | FortuneX',
  description: 'The four ways FortuneX pays — a daily trade bonus on invested capital, direct and generation bonuses, executive ranks and the affiliate offers.',
};

export const revalidate = 60;

/** Dark table that scrolls inside its own box rather than the page. */
function PlanTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto rounded-[5px] border border-[var(--home-line)]">
      <table className="w-full min-w-[560px] border-collapse text-left">
        <thead>
          <tr className="bg-[var(--home-raised)]">
            {head.map((h) => (
              <th key={h} className="whitespace-nowrap px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.11em] text-[var(--home-text-3)]">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-[var(--home-line)] transition-colors hover:bg-[var(--home-surface)]">
              {/* Cells wrap. A reward reads "$1,565 car purchase fund, or a new
                  ID top-up"; forcing that onto one line stretched the table far
                  past the width anyone reads it at. */}
              {r.map((c, j) => (
                <td key={j} className={`px-5 py-3 text-[13px] ${
                  j === 0 ? 'font-semibold text-[var(--home-text)]' : 'tabular-nums text-[var(--home-text-2)]'}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function OpportunityPage() {
  const plan = await getPlan();
  const directTotal = plan.directBonus.reduce((s, d) => s + d.percent, 0);

  const STREAMS = [
    { Icon: TrendingUp, title: 'Daily trade bonus', figure: `${plan.dailyReturnPercent}%`,
      body: `Paid on your own committed capital, ${plan.tradingDays.toLowerCase()}, up to the published ceiling of ${plan.capPassivePercent}%.` },
    { Icon: Users, title: 'Direct sponsor bonus', figure: `${directTotal}%`,
      body: `Split across your first three levels on every referred purchase — ${plan.directBonus.map((d) => `${d.percent}%`).join(' / ')}.` },
    { Icon: Trophy, title: 'Executive ranks', figure: `${plan.ranks.length}`,
      body: `A ladder from ${plan.ranks[0]?.name} to ${plan.ranks[plan.ranks.length - 1]?.name}, each with a one-off reward on qualification.` },
    { Icon: Plane, title: 'Affiliate offers', figure: `${plan.roaming.affiliate.length}`,
      body: 'Campaign rewards on team performance — a trip or a cash fund, each open for a limited window and outside your earnings cap.' },
  ];

  return (
    <main>
      <PageHero
        crumb="Opportunity"
        title="How the platform pays"
        lead="Four income streams, each with its own rules, its own qualification and its own line in your ledger. Every rate below is a constant the platform runs on, not an introductory offer."
      />

      {/* ── streams ──────────────────────────────────────────────────── */}
      <section className="fx-glow py-16 sm:py-20">
        <Container>
          <Reveal>
            <SectionHead
              eyebrow="Income streams"
              title="Four ways the platform pays"
              lead="Each has its own qualification and its own line in your ledger."
            />
          </Reveal>
          <dl className="mt-12 grid gap-px overflow-hidden rounded-[5px] border border-[var(--home-line)] bg-[var(--home-line)] sm:grid-cols-2 lg:grid-cols-4">
            {STREAMS.map(({ Icon, title, figure, body }, i) => (
              <Reveal key={title} delay={i * 90}>
                <div className="fx-cell h-full bg-[var(--home-surface)] p-6">
                  <Icon size={18} strokeWidth={1.9} aria-hidden className="fx-cell-icon text-[var(--home-gold)]" />
                  <dd className="mt-5 tabular-nums text-[34px] font-bold leading-none tracking-[-0.03em] text-[var(--home-text)]">
                    <Figure value={figure} />
                  </dd>
                  <dt className="mt-2.5 text-[10.5px] font-semibold uppercase tracking-[0.11em] text-[var(--home-text-3)]">{title}</dt>
                  <p className="mt-3 text-[13px] leading-[1.7] text-[var(--home-text-2)]">{body}</p>
                </div>
              </Reveal>
            ))}
          </dl>
        </Container>
      </section>

      {/* ── affiliate offers ────────────────────────────────────────── */}
      <section className="border-t border-[var(--home-line)] py-16 sm:py-20">
        <Container>
          <Reveal>
            <SectionHead
              eyebrow="Campaigns"
              title="Affiliate offers"
              lead="Rewards for team performance, each open for a limited window and sitting outside your earnings cap. They are entitlements rather than credited income — a trip is arranged, a fund is paid toward its purpose."
            />
          </Reveal>

          {/* One table, and only the columns that exist.
              This was two tables headed "Affiliate track" and "Self-capitalist
              track". The offers replaced that split: the second track has no
              tiers, so it rendered an empty table under a heading promising a
              programme, and the first quoted "$0 self capital" for every row
              because the offers qualify on team business alone. */}
          <div className="mt-10">
            <Reveal from="left">
              <PlanTable
                head={['Offer', 'Team business', 'Reward', 'Closes']}
                rows={plan.roaming.affiliate.map((r) => [
                  r.destination,
                  planMoney(r.team),
                  r.reward ?? '—',
                  r.validUntil ? offerDate(r.validUntil) : 'No closing date',
                ])}
              />
            </Reveal>
          </div>

          <Reveal delay={160}>
            <Link href="/plans"
                  className="mt-10 inline-flex items-center gap-2 rounded-[4px] border border-[var(--home-line)] px-6 py-3.5 text-[14px] font-semibold text-[var(--home-text)] transition-colors hover:border-[var(--home-gold)] hover:text-[var(--home-gold)]">
              See every tier in detail <ArrowRight size={15} strokeWidth={2.5} aria-hidden />
            </Link>
          </Reveal>
        </Container>
      </section>

      <CtaBand />
    </main>
  );
}
