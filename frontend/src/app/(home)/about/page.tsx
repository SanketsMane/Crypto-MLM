import type { Metadata } from 'next';
import Image from 'next/image';
import { Eye, Layers, Lock, ScrollText } from 'lucide-react';
import { getPlan, planMoney } from '@/lib/platform-config.server';
import { PageHero } from '@/components/home/page-hero';
import { Card, Container, Heading } from '@/components/home/sections';
import { Reveal, CountUp } from '@/components/home/motion';

export const metadata: Metadata = {
  title: 'About | FortuneX',
  description:
    'FortuneX is a trading and affiliate platform built on a published compensation plan, a double-entry ledger and an append-only audit trail.',
};

export const revalidate = 60;

/** The people accountable for the plan. */
const LEADERSHIP = [
  { role: 'Founder', name: 'Victor Robello',
    body: 'Set the compensation plan before the platform existed, on the principle that a member should be able to work out their own return before committing anything.' },
  { role: 'Chief Technical Officer', name: 'Ivon Tudor',
    body: 'A forex trader and risk-management specialist by background, with years spent in global currency markets. Owns the trading strategy and the risk controls around it.' },
];

export default async function AboutPage() {
  const plan = await getPlan();

  const VALUES = [
    { Icon: Eye, title: 'Publish the whole rule',
      body: 'Every percentage, ceiling, qualification and fee on this site is the figure the software enforces — not a marketing approximation of it.' },
    { Icon: ScrollText, title: 'Make money movement provable',
      body: 'No balance is ever written directly. Every movement of value is an append-only ledger entry carrying the balance it produced.' },
    { Icon: Layers, title: 'Enforce the ceiling honestly',
      body: `Earnings are capped at ${plan.capPassivePercent}% of committed capital, applied at every payout and consumed atomically so two payouts cannot exceed it.` },
    { Icon: Lock, title: 'Leave a trail behind operators',
      body: 'Any operator action records who, what, when and from where. The log has no update or delete path, including for the person who wrote it.' },
  ];

  const FACTS = [
    { v: plan.packages.length, suffix: '', label: 'Investment tiers' },
    { v: plan.dailyReturnPercent, suffix: '%', label: 'Daily trade bonus', decimals: 1 },
    { v: 30, suffix: '', label: 'Network levels' },
    { v: plan.ranks.length, suffix: '', label: 'Executive ranks' },
  ];

  return (
    <main>
      <PageHero
        crumb="About"
        title="A trading platform that publishes its own rules"
        lead="Most platforms in this space ask you to trust a number. We would rather you checked ours — so the plan, the ceiling, the fees and the controls behind them are all stated in public, in the same terms the software applies them."
      />

      {/* ── position ─────────────────────────────────────────────────── */}
      <section className="py-20 sm:py-24">
        <Container>
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <Reveal from="left">
              <Heading>Built for people who read the terms</Heading>
              <div className="mt-6 space-y-4 text-[14.5px] leading-[1.85] text-[var(--home-text-2)]">
                <p>
                  FortuneX combines a trading return on committed capital with an affiliate structure
                  that rewards members for building a network. Both exist elsewhere. What is unusual
                  is how little of it is left to interpretation.
                </p>
                <p>
                  The daily trade bonus is {plan.dailyReturnPercent}% of invested capital on trading days.
                  The earnings ceiling is {plan.capPassivePercent}% of that capital. The generation bonus
                  reaches thirty levels with stated qualifications at each band. None of these are
                  introductory rates — they are the constants the platform runs on, and when an
                  operator changes one, the change is recorded with their name against it.
                </p>
                <p>
                  We take the same approach to the parts that are less comfortable to say out loud.
                  Trading carries risk. A ceiling means earnings stop. A fee is deducted from what you
                  withdraw. All of it is on this site, because a member surprised later was not
                  properly informed earlier.
                </p>
              </div>
            </Reveal>

            <Reveal from="right">
              <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-[var(--home-line)]">
                <Image src="/brand/about-growth.jpg" alt="" aria-hidden fill
                       sizes="(max-width: 1024px) 100vw, 600px" className="object-cover" />
                {/* Much lighter than it was. The old overlay ran to 85% black to
                    tame a bright illustration; this artwork is already navy and
                    gold, and that much black buried the bull and the chart. */}
                <div aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.10),rgba(0,0,0,0.35))]" />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3">
                {FACTS.map((f) => (
                  <div key={f.label} className="rounded-xl border border-[var(--home-line)] bg-[var(--home-surface)] px-4 py-3.5">
                    <dd className="text-[24px] font-bold leading-none text-[var(--home-gold)]">
                      <CountUp to={f.v} suffix={f.suffix} decimals={f.decimals ?? 0} />
                    </dd>
                    <dt className="mt-1 text-[12px] text-[var(--home-text-3)]">{f.label}</dt>
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>
        </Container>
      </section>

      {/* ── commitments ──────────────────────────────────────────────── */}
      <section className="border-y border-[var(--home-line)] py-20 sm:py-24">
        <Container>
          <Reveal>
            <Heading className="mx-auto max-w-[22ch] text-center">
              Four commitments, each of them testable
            </Heading>
            <p className="mx-auto mt-4 max-w-[60ch] text-center text-[14.5px] leading-[1.8] text-[var(--home-text-2)]">
              A value that cannot be checked is decoration. Each of these describes something you
              could verify from your own account history.
            </p>
          </Reveal>

          <div className="mt-14 grid gap-5 sm:grid-cols-2">
            {VALUES.map(({ Icon, title, body }, i) => (
              <Reveal key={title} delay={i * 110} className="h-full">
                <Card className="h-full p-7">
                  <span className="grid h-12 w-12 place-items-center rounded-xl bg-[var(--home-gold)]/12 text-[var(--home-gold)] ring-1 ring-[var(--home-gold)]/25">
                    <Icon size={20} strokeWidth={1.9} aria-hidden />
                  </span>
                  <h3 className="mt-5 text-[18px] font-bold text-white">{title}</h3>
                  <p className="mt-3 text-[13.5px] leading-[1.75] text-[var(--home-text-2)]">{body}</p>
                </Card>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* ── leadership ───────────────────────────────────────────────── */}
      <section className="py-20 sm:py-24">
        <Container>
          <Reveal>
            <span className="block text-center text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[var(--home-gold)]">
              Who runs it
            </span>
            <Heading className="mt-3 text-center">The people accountable for the plan</Heading>
          </Reveal>

          <div className="mx-auto mt-14 grid max-w-[900px] gap-5 sm:grid-cols-2">
            {LEADERSHIP.map((l, i) => (
              <Reveal key={l.name} delay={i * 130} from="zoom" className="h-full">
                <Card className="h-full p-8">
                  <span className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-[var(--home-gold)]">
                    {l.role}
                  </span>
                  <h3 className="mt-3 text-[22px] font-bold tracking-[-0.015em] text-white">{l.name}</h3>
                  <span aria-hidden className="mt-4 block h-px w-full bg-gradient-to-r from-[var(--home-gold)]/45 to-transparent" />
                  <p className="mt-4 text-[13.5px] leading-[1.8] text-[var(--home-text-2)]">{l.body}</p>
                </Card>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* ── operations ───────────────────────────────────────────────── */}
      <section className="border-t border-[var(--home-line)] py-20 sm:py-24">
        <Container>
          <div className="grid gap-10 lg:grid-cols-3">
            {[
              { t: 'Where we are', b: 'FortuneX operates from Business Bay, Dubai, with members across more than twenty countries. Support is handled in-platform so every exchange stays attached to the account it concerns.' },
              { t: 'How support works', b: 'Tickets are answered by named operators, not a shared mailbox. The person replying can see your ledger, your capping position and your network — which is why answers arrive with figures in them.' },
              { t: 'Verification', b: 'Identity documents are held privately, outside any public path, and are visible only to a reviewer with the compliance capability. A decision records who made it and why.' },
            ].map((o, i) => (
              <Reveal key={o.t} delay={i * 120}>
                <h3 className="text-[18px] font-bold text-white">{o.t}</h3>
                <span aria-hidden className="mt-4 block h-px w-16 bg-[var(--home-gold)]" />
                <p className="mt-4 text-[13.5px] leading-[1.8] text-[var(--home-text-2)]">{o.b}</p>
              </Reveal>
            ))}
          </div>
          <Reveal delay={200}>
            <p className="mt-14 text-center text-[13px] text-[var(--home-text-3)]">
              Entry starts at {planMoney(plan.cfg.investment.minimum)} · Settlement in {plan.withdraw.network}
            </p>
          </Reveal>
        </Container>
      </section>
    </main>
  );
}
