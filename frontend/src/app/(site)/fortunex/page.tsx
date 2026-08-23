import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight, BadgeCheck, CandlestickChart, Globe2, Layers,
  LineChart, Lock, Network, ScrollText, Trophy, Wallet,
} from 'lucide-react';
import { Container, Eyebrow, Heading, Lead, Panel, Section, SectionHead } from '@/components/site/primitives';
import { CtaBand } from '@/components/site/cta-band';
import { getPlan, planMoney } from '@/lib/platform-config.server';

/** What `getPlan()` returns — the live plan, in the shapes this page renders. */
type Plan = Awaited<ReturnType<typeof getPlan>>;

const PILLARS = (plan: Plan) => [
  {
    Icon: CandlestickChart,
    title: 'A daily trade bonus',
    body: `Capital you commit to a tier accrues ${plan.dailyReturnPercent}% every trading day, ${plan.tradingDays}. Weekends do not accrue, and the figure is applied to your invested capital — not to a projection.`,
  },
  {
    Icon: Network,
    title: 'A thirty-level network',
    body: `Introduce members and earn on their purchases across three levels, then on their daily bonus thirty generations deep. Each band has published qualification rules.`,
  },
  {
    Icon: Trophy,
    title: 'Ranks and the Roaming Club',
    body: `Ten executive ranks pay one-off rewards from ${planMoney(plan.ranks[0].reward)} to ${planMoney(plan.ranks[plan.ranks.length - 1].reward)}. Travel awards sit outside the earnings ceiling entirely.`,
  },
];

const NUMBERS = (plan: Plan) => [
  { value: `${plan.dailyReturnPercent}%`, label: 'Daily trade bonus', sub: `${plan.tradingDays} only` },
  { value: '30', label: 'Generations deep', sub: 'On network trade bonus' },
  { value: `${plan.packages.length}`, label: 'Investment tiers', sub: `${planMoney(plan.packages[0])} to ${planMoney(plan.packages[plan.packages.length - 1])}` },
  { value: `${plan.withdraw.slaHours}h`, label: 'Withdrawal SLA', sub: plan.withdraw.network },
];

const STEPS = (plan: Plan) => [
  { n: '01', title: 'Open your account', body: 'Register in minutes with an email and a sponsor code if you have one. Verify your identity once, and withdrawals stay frictionless afterwards.' },
  { n: '02', title: 'Fund in USDT', body: `Send USDT on BEP-20 to your funding wallet. A confirmed deposit is credited by an operator and lands as a ledger entry you can see.` },
  { n: '03', title: 'Choose a tier', body: `Ten tiers from ${planMoney(plan.packages[0])} to ${planMoney(plan.packages[plan.packages.length - 1])}. Your earnings ceiling is set the moment you purchase, and it is shown to you before you confirm.` },
  { n: '04', title: 'Earn and withdraw', body: `The trade bonus accrues each trading day. Withdraw from ${planMoney(plan.withdraw.min)}, processed within ${plan.withdraw.slaHours} hours, ${plan.withdraw.feePercent}% fee.` },
];

const TRUST = (plan: Plan) => [
  { Icon: ScrollText, title: 'Every movement is a ledger entry', body: 'Deposits, bonuses, commissions and withdrawals are append-only records carrying the balance they produced. Nothing is written to a balance directly.' },
  { Icon: Layers, title: 'A published earnings ceiling', body: `Earnings are capped at ${plan.capPassivePercent}% of the capital you commit — ${plan.capActivePercent}% for active affiliates. The cap is enforced on every payout, not reconciled later.` },
  { Icon: Lock, title: 'Operator actions are audited', body: 'Any change an operator makes to an account records who did it, what changed and from where. The trail is append-only; there is no delete path.' },
  { Icon: BadgeCheck, title: 'Identity verification', body: 'Documents are stored privately, never given a public URL, and reviewed by a named operator whose decision is recorded against the submission.' },
];

export default async function HomePage() {
  const plan = await getPlan();

  const topTiers = [plan.packages[2], plan.packages[4], plan.packages[6]];

  return (
    <>
      {/* ── hero ──────────────────────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden">
        <Image
          src="/brand/sidebar-promo.png" alt="" aria-hidden fill priority sizes="100vw"
          className="-z-20 object-cover object-[70%_center]"
        />
        {/* the artwork carries its subject on the right, so the scrim runs the
            other way and the copy always has a dark ground beneath it */}
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-navy-deep via-navy-deep/94 to-navy-deep/40" />
        <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-32 bg-gradient-to-t from-navy-deep to-transparent" />

        <Container className="relative py-20 sm:py-28 lg:py-36">
          <div className="max-w-[680px]">
            <Eyebrow>Trade · Invest · Earn</Eyebrow>

            <Heading level={1} size="xl" className="mt-5">
              Your capital, working to a plan you can{' '}
              <span className="bg-gradient-to-r from-brand-gold via-brand-gold-hi to-brand-gold bg-clip-text text-transparent">
                read in full
              </span>
            </Heading>

            <Lead className="mt-6 max-w-[560px] text-[16px] sm:text-[17.5px]">
              FortuneX pays a {plan.dailyReturnPercent}% daily trade bonus on invested capital,
              {' '}{plan.tradingDays}, alongside a thirty-level affiliate network,
              executive ranks and international travel rewards. Every rule is published, every
              payout is a ledger entry.
            </Lead>

            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href="/register"
                className="inline-flex w-full items-center justify-center gap-2 rounded-[11px] bg-[linear-gradient(135deg,#D4AF37_0%,#C49A2C_100%)] px-6 py-3.5 text-[14.5px] font-semibold text-navy shadow-[0_12px_34px_-12px_rgba(212,175,55,0.75)] transition hover:brightness-110 sm:w-auto"
              >
                Open your account
                <ArrowRight size={16} strokeWidth={2.5} />
              </Link>
              <Link
                href="/how-it-works"
                className="inline-flex w-full items-center justify-center gap-2 rounded-[11px] border border-white/16 px-6 py-3.5 text-[14.5px] font-medium text-white transition hover:border-white/32 hover:bg-white/[0.04] sm:w-auto"
              >
                See how it works
              </Link>
            </div>

            <ul className="mt-10 flex flex-wrap items-center gap-x-7 gap-y-3 text-[12.5px] text-white/50">
              {[
                { Icon: Wallet, text: plan.withdraw.network },
                { Icon: Globe2, text: 'Members across 20+ countries' },
                { Icon: LineChart, text: `${plan.capPassivePercent}% earnings ceiling, enforced` },
              ].map(({ Icon, text }) => (
                <li key={text} className="flex items-center gap-2">
                  <Icon size={14} className="text-brand-gold/70" />
                  {text}
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </section>

      {/* ── numbers band ──────────────────────────────────────────────── */}
      <div className="border-y border-white/[0.07] bg-navy">
        <Container>
          <dl className="grid grid-cols-2 gap-px lg:grid-cols-4">
            {NUMBERS(plan).map((n) => (
              /* A `dl` may group with `div`, but each group may hold only
                 `dt` and `dd` — the `p` made this an invalid list, and the
                 term has to precede its description in the DOM. Reordered
                 with flex so the figure still reads first on screen. */
              <div key={n.label} className="flex flex-col px-1 py-7 sm:px-5 lg:py-9">
                <dt className="order-2 mt-1.5 text-[13.5px] font-medium text-white">{n.label}</dt>
                <dd className="order-1 text-[30px] font-semibold tracking-[-0.03em] text-brand-gold tabular-nums sm:text-[38px]">
                  {n.value}
                </dd>
                <dd className="order-3 mt-0.5 text-[12px] text-white/60">{n.sub}</dd>
              </div>
            ))}
          </dl>
        </Container>
      </div>

      {/* ── three pillars ─────────────────────────────────────────────── */}
      <Section>
        <Container>
          <SectionHead
            eyebrow="What FortuneX is"
            title="Three income streams, one published plan"
            lead="The platform does not blend its economics into a single opaque number. Each stream has its own rules, its own qualification and its own line in your ledger."
          />

          <div className="mt-12 grid gap-4 lg:grid-cols-3">
            {PILLARS(plan).map(({ Icon, title, body }) => (
              <Panel key={title} hover className="p-6 sm:p-7">
                <span className="grid h-11 w-11 place-items-center rounded-xl border border-brand-gold/25 bg-brand-gold/10 text-brand-gold">
                  <Icon size={19} strokeWidth={1.9} />
                </span>
                <h3 className="mt-5 text-[17px] font-semibold tracking-[-0.01em] text-white">{title}</h3>
                <p className="mt-2.5 text-[13.5px] leading-[1.75] text-white/58">{body}</p>
              </Panel>
            ))}
          </div>
        </Container>
      </Section>

      {/* ── how it works ──────────────────────────────────────────────── */}
      <Section tone="raised">
        <Container>
          <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-5">
              <SectionHead
                eyebrow="Getting started"
                title="Four steps from sign-up to settlement"
                lead="No application process, no waiting list. What takes time is the identity check, and that happens once."
              />
              <Link
                href="/how-it-works"
                className="mt-7 inline-flex items-center gap-2 text-[14px] font-medium text-brand-gold transition hover:gap-3"
              >
                Read the full mechanics <ArrowRight size={15} />
              </Link>
            </div>

            <ol className="lg:col-span-7">
              {STEPS(plan).map((s, i) => (
                <li key={s.n} className="relative flex gap-5 pb-8 last:pb-0">
                  {i < STEPS(plan).length - 1 && (
                    <span aria-hidden className="absolute left-[19px] top-11 h-[calc(100%-2.75rem)] w-px bg-gradient-to-b from-brand-gold/30 to-white/5" />
                  )}
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-brand-gold/25 bg-navy-deep text-[12.5px] font-semibold tabular-nums text-brand-gold">
                    {s.n}
                  </span>
                  <div className="pt-1.5">
                    <h3 className="text-[16px] font-semibold text-white">{s.title}</h3>
                    <p className="mt-1.5 text-[13.5px] leading-[1.75] text-white/58">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </Container>
      </Section>

      {/* ── plans preview ─────────────────────────────────────────────── */}
      <Section>
        <Container>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionHead
              eyebrow="Investment tiers"
              title={`${plan.packages.length} tiers, from ${planMoney(plan.packages[0])} to ${planMoney(plan.packages[plan.packages.length - 1])}`}
              lead={`Every tier accrues the same ${plan.dailyReturnPercent}% daily bonus and carries the same ${plan.capPassivePercent}% ceiling. The tier decides the scale, not the terms.`}
            />
            <Link href="/plans" className="inline-flex items-center gap-2 text-[14px] font-medium text-brand-gold transition hover:gap-3">
              All tiers <ArrowRight size={15} />
            </Link>
          </div>

          <div className="mt-11 grid gap-4 sm:grid-cols-3">
            {topTiers.map((amount, i) => (
              <Panel key={amount} hover className={i === 1 ? 'relative p-6 ring-1 ring-brand-gold/25 sm:p-7' : 'p-6 sm:p-7'}>
                {i === 1 && (
                  <span className="absolute -top-2.5 left-6 rounded-full bg-[linear-gradient(135deg,#D4AF37_0%,#C49A2C_100%)] px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-navy">
                    Most chosen
                  </span>
                )}
                <p className="text-[12px] uppercase tracking-[0.1em] text-white/60">
                  Tier {plan.packages.indexOf(amount) + 1}
                </p>
                <p className="mt-2 text-[32px] font-semibold tracking-[-0.03em] text-white tabular-nums">
                  ${amount.toLocaleString('en-US')}
                </p>
                <ul className="mt-5 space-y-2.5 border-t border-white/[0.07] pt-5 text-[13px] text-white/60">
                  {[
                    `${plan.dailyReturnPercent}% daily trade bonus`,
                    `${plan.capPassivePercent}% earnings ceiling`,
                    `Up to $${(amount * plan.capPassivePercent / 100).toLocaleString('en-US')} lifetime`,
                    'Full network eligibility',
                  ].map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <BadgeCheck size={15} className="mt-px shrink-0 text-brand-gold/80" />
                      {f}
                    </li>
                  ))}
                </ul>
              </Panel>
            ))}
          </div>
        </Container>
      </Section>

      {/* ── network ───────────────────────────────────────────────────── */}
      <Section tone="raised">
        <Container>
          <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-5">
              <SectionHead
                eyebrow="The network"
                title="Paid on introductions, and on the network beneath them"
                lead="Two distinct commissions. The direct bonus pays on what your referrals purchase; the generation bonus pays on what their networks earn, every trading day."
              />
              <Link href="/rewards" className="mt-7 inline-flex items-center gap-2 text-[14px] font-medium text-brand-gold transition hover:gap-3">
                Rewards in detail <ArrowRight size={15} />
              </Link>
            </div>

            <div className="grid gap-4 lg:col-span-7">
              <Panel className="p-6 sm:p-7">
                <h3 className="text-[15.5px] font-semibold text-white">Direct sponsor bonus</h3>
                <p className="mt-1.5 text-[13px] text-white/55">
                  {plan.directBonus.reduce((a, b) => a + b.percent, 0)}% of every purchase in your first three levels.
                </p>
                <div className="mt-5 grid grid-cols-3 gap-3">
                  {plan.directBonus.map((d) => (
                    <div key={d.level} className="rounded-xl border border-white/[0.07] bg-navy-deep/60 px-4 py-3.5 text-center">
                      <p className="text-[11px] uppercase tracking-[0.08em] text-white/60">Level {d.level}</p>
                      <p className="mt-1 text-[21px] font-semibold text-brand-gold tabular-nums">{d.percent}%</p>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel className="p-6 sm:p-7">
                <h3 className="text-[15.5px] font-semibold text-white">Generation bonus — 30 levels</h3>
                <p className="mt-1.5 text-[13px] text-white/55">
                  A share of the daily trade bonus earned anywhere in your network, banded by depth.
                  Deeper bands unlock as your active directs and team volume grow.
                </p>
                <ul className="mt-5 space-y-1.5">
                  {plan.generationBands.map((b) => (
                    <li key={b.levels} className="flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] odd:bg-white/[0.03]">
                      <span className="w-[72px] shrink-0 tabular-nums text-white/70">Level {b.levels}</span>
                      <span className="w-14 shrink-0 font-semibold tabular-nums text-brand-gold">{b.percent}%</span>
                      <span className="text-[12px] text-white/58">
                        {b.directs === 0 ? 'No qualification' : `${b.directs} active directs · ${planMoney(b.volume)} team volume`}
                      </span>
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>
          </div>
        </Container>
      </Section>

      {/* ── trust ─────────────────────────────────────────────────────── */}
      <Section>
        <Container>
          <SectionHead
            align="center"
            eyebrow="How the platform is built"
            title="Transparency is an engineering decision, not a slogan"
            lead="These are properties of the system itself — the reason we can publish the plan in full is that the software enforces it the same way for everyone."
          />

          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {TRUST(plan).map(({ Icon, title, body }) => (
              <Panel key={title} hover className="flex gap-4 p-6">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.03] text-brand-gold">
                  <Icon size={17} strokeWidth={1.9} />
                </span>
                <div>
                  <h3 className="text-[15.5px] font-semibold text-white">{title}</h3>
                  <p className="mt-1.5 text-[13.5px] leading-[1.75] text-white/58">{body}</p>
                </div>
              </Panel>
            ))}
          </div>
        </Container>
      </Section>

      <CtaBand />
    </>
  );
}
