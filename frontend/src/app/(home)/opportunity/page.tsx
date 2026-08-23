import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Plane, TrendingUp, Trophy, Users } from 'lucide-react';
import { getPlan, planMoney } from '@/lib/platform-config.server';
import { PageHero } from '@/components/home/page-hero';
import { Card, Container, Heading, CtaBand } from '@/components/home/sections';
import { Reveal } from '@/components/home/motion';

export const metadata: Metadata = {
  title: 'Opportunity | FortuneX',
  description: 'The FortuneX compensation plan in full — tiers, the daily trade bonus, direct and generation bonuses, executive ranks and the Roaming Club.',
};

export const revalidate = 60;

/** Dark table that scrolls inside its own box rather than the page. */
function PlanTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[var(--home-line)]">
      <table className="w-full min-w-[560px] border-collapse text-left">
        <thead>
          <tr className="bg-[var(--home-raised)]">
            {head.map((h) => (
              <th key={h} className="whitespace-nowrap px-5 py-3.5 text-[11.5px] font-semibold uppercase tracking-[0.07em] text-[var(--home-text-3)]">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-[var(--home-line)] transition-colors hover:bg-white/[0.03]">
              {r.map((c, j) => (
                <td key={j} className={`whitespace-nowrap px-5 py-3.5 text-[13.5px] tabular-nums ${
                  j === 0 ? 'font-semibold text-white' : 'text-[var(--home-text-2)]'}`}>
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
    { Icon: Plane, title: 'Roaming Club', figure: `${plan.roaming.affiliate.length}`,
      body: 'Travel rewards on performance, through two independent tracks — and outside your earnings cap.' },
  ];

  return (
    <main>
      <PageHero
        crumb="Opportunity"
        title="The plan, published in full"
        lead="Four income streams, each with its own rules, its own qualification and its own line in your ledger. Nothing below is an introductory rate — these are the constants the platform runs on."
      />

      {/* ── streams ──────────────────────────────────────────────────── */}
      <section className="py-20 sm:py-24">
        <Container>
          <Reveal><Heading className="text-center">Four ways the platform pays</Heading></Reveal>
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STREAMS.map(({ Icon, title, figure, body }, i) => (
              <Reveal key={title} delay={i * 110} className="h-full">
                <Card className="h-full p-7">
                  <span className="grid h-12 w-12 place-items-center rounded-xl bg-[var(--home-gold)]/12 text-[var(--home-gold)] ring-1 ring-[var(--home-gold)]/25">
                    <Icon size={20} strokeWidth={1.9} aria-hidden />
                  </span>
                  <p className="mt-5 text-[34px] font-bold leading-none text-[var(--home-display)]">{figure}</p>
                  <h3 className="mt-3 text-[16px] font-bold text-white">{title}</h3>
                  <p className="mt-2.5 text-[13px] leading-[1.75] text-[var(--home-text-2)]">{body}</p>
                </Card>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* ── tiers ────────────────────────────────────────────────────── */}
      <section className="border-t border-[var(--home-line)] py-20 sm:py-24">
        <Container>
          <Reveal>
            <Heading>Investment tiers</Heading>
            <p className="mt-4 max-w-[64ch] text-[14.5px] leading-[1.8] text-[var(--home-text-2)]">
              The tier sets the size of your position. The rate, the ceiling and every rule around
              them are identical at every level.
            </p>
          </Reveal>
          <Reveal delay={120} className="mt-10 block">
            <PlanTable
              head={['Tier', 'Capital', 'Daily bonus', 'Ceiling', 'Total return at cap']}
              rows={plan.packages.map((amount, i) => [
                `Tier ${i + 1}`,
                planMoney(amount),
                `${plan.dailyReturnPercent}%`,
                `${plan.capPassivePercent}%`,
                planMoney((amount * plan.capPassivePercent) / 100),
              ])}
            />
          </Reveal>
        </Container>
      </section>

      {/* ── generation bands ─────────────────────────────────────────── */}
      <section className="border-t border-[var(--home-line)] py-20 sm:py-24">
        <Container>
          <Reveal>
            <Heading>Generation bonus — thirty levels</Heading>
            <p className="mt-4 max-w-[64ch] text-[14.5px] leading-[1.8] text-[var(--home-text-2)]">
              Paid on the daily trade bonus earned beneath you. Each band has its own qualification
              on active directs and accumulated team volume.
            </p>
          </Reveal>
          <Reveal delay={120} className="mt-10 block">
            <PlanTable
              head={['Levels', 'Share', 'Active directs', 'Team volume']}
              rows={plan.generationBands.map((b) => [
                b.levels, `${b.percent}%`, b.directs, planMoney(b.volume),
              ])}
            />
          </Reveal>
        </Container>
      </section>

      {/* ── ranks ────────────────────────────────────────────────────── */}
      <section className="border-t border-[var(--home-line)] py-20 sm:py-24">
        <Container>
          <Reveal>
            <Heading>Executive ranks</Heading>
            <p className="mt-4 max-w-[64ch] text-[14.5px] leading-[1.8] text-[var(--home-text-2)]">
              Team business counts 50:50 — at most half may come from your strongest leg. Business
              already counted carries forward to the next rank.
            </p>
          </Reveal>
          <Reveal delay={120} className="mt-10 block">
            <PlanTable
              head={['Rank', 'Self capital', 'Team business', 'Reward']}
              rows={plan.ranks.map((r) => [r.name, planMoney(r.self), planMoney(r.team), planMoney(r.reward)])}
            />
          </Reveal>
        </Container>
      </section>

      {/* ── roaming club ─────────────────────────────────────────────── */}
      <section className="border-t border-[var(--home-line)] py-20 sm:py-24">
        <Container>
          <Reveal>
            <Heading>The Roaming Club</Heading>
            <p className="mt-4 max-w-[64ch] text-[14.5px] leading-[1.8] text-[var(--home-text-2)]">
              Two independent tracks — qualify on either. Roaming Club awards are travel
              entitlements rather than cash, and sit outside your earnings cap.
            </p>
          </Reveal>

          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <Reveal from="left">
              <h3 className="mb-4 text-[16px] font-bold text-white">Affiliate track</h3>
              <PlanTable
                head={['Destination', 'Self capital', 'Team business']}
                rows={plan.roaming.affiliate.map((r) => [r.destination, planMoney(r.self), planMoney(r.team)])}
              />
            </Reveal>
            <Reveal from="right">
              <h3 className="mb-4 text-[16px] font-bold text-white">Self-capitalist track</h3>
              <PlanTable
                head={['Destination', 'Self capital']}
                rows={plan.roaming.selfCapitalist.map((r) => [r.destination, planMoney(r.self)])}
              />
            </Reveal>
          </div>

          <Reveal delay={160}>
            <Link href="/plans"
                  className="mx-auto mt-12 inline-flex items-center gap-2.5 rounded-xl border border-[var(--home-line)] px-7 py-3.5 text-[14px] font-semibold text-white transition hover:border-[var(--home-gold)] hover:text-[var(--home-gold)]">
              See every tier in detail <ArrowRight size={15} strokeWidth={2.5} aria-hidden />
            </Link>
          </Reveal>
        </Container>
      </section>

      <CtaBand />
    </main>
  );
}
