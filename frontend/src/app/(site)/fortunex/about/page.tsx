import type { Metadata } from 'next';
import Image from 'next/image';
import { Building2, Compass, Eye, Layers, Lock, ScrollText, ShieldCheck, Users } from 'lucide-react';
import { Container, Panel, Section, SectionHead } from '@/components/site/primitives';
import { PageHero } from '@/components/site/page-hero';
import { CtaBand } from '@/components/site/cta-band';
import { getPlan, planMoney } from '@/lib/platform-config.server';

/** What `getPlan()` returns — the live plan, in the shapes this page renders. */
type Plan = Awaited<ReturnType<typeof getPlan>>;

export const metadata: Metadata = {
  title: 'About',
  description:
    'FortuneX is a trading and affiliate platform built on a published compensation plan, a double-entry ledger and an append-only audit trail.',
};

const VALUES = (plan: Plan) => [
  {
    Icon: Eye,
    title: 'Publish the whole rule',
    body: 'A member should be able to calculate their own earnings before committing capital. Every percentage, ceiling, qualification and fee on this site is the figure the software enforces — not a marketing approximation of it.',
  },
  {
    Icon: ScrollText,
    title: 'Make money movement provable',
    body: 'No balance is ever written directly. Deposits, bonuses, commissions, adjustments and withdrawals are all append-only ledger entries carrying the balance they produced, so any figure can be reconstructed from first principles.',
  },
  {
    Icon: Layers,
    title: 'Enforce the ceiling honestly',
    body: `Earnings are capped at ${plan.capPassivePercent}% of committed capital. The cap is applied at the moment of every payout and consumed atomically, so it cannot be exceeded by two payouts landing at once.`,
  },
  {
    Icon: Lock,
    title: 'Leave a trail behind operators',
    body: 'Anything an operator does to an account — a status change, a manual adjustment, a payout approval — records who, what, when and from where. The log has no update or delete path, including for the person who wrote it.',
  },
];

const MILESTONES = [
  { year: 'Foundation', title: 'A plan worth building', body: 'FortuneX began with a compensation plan written before a line of code: ten tiers, a daily trade bonus, a thirty-level network and a hard earnings ceiling.' },
  { year: 'The ledger', title: 'Money as records, not balances', body: 'The platform was built on double-entry principles from day one. A balance is the sum of its entries, which is why every figure a member sees can be traced.' },
  { year: 'Controls', title: 'Roles, audit and idempotency', body: 'Operator capability is granted per action rather than per job title, every mutation is audited, and money-moving endpoints refuse a replayed request.' },
  { year: 'Today', title: 'Compliance and scale', body: 'Identity verification, a support desk, runtime-tunable business rules and a payout engine an operator can actually see are all part of the running platform.' },
];

/**
 * The people behind the platform, carried over from the Fyntrust about page.
 *
 * Only the technical role arrived with an actual biography; the founder entry
 * there was company copy under a name badge, so the second `body` below is
 * ours to write once someone supplies it. Named individuals on a regulated
 * financial site should be confirmed before this ships.
 */
const LEADERSHIP = [
  {
    role: 'Founder',
    name: 'Victor Robello',
    body: 'Set the compensation plan before the platform existed, on the principle that a member should be able to work out their own return before committing anything. The published-plan approach the rest of this page describes starts there.',
  },
  {
    role: 'Chief Technical Officer',
    name: 'Ivon Tudor',
    body: 'A forex trader and risk-management specialist by background, with years spent in global currency markets. Owns the trading strategy behind the daily bonus and the risk controls that sit around it.',
  },
];

const FACTS = (plan: Plan) => [
  { k: 'Investment tiers', v: `${plan.packages.length}` },
  { k: 'Entry from', v: planMoney(plan.packages[0]) },
  { k: 'Daily trade bonus', v: `${plan.dailyReturnPercent}%` },
  { k: 'Network depth', v: '30 levels' },
];

export default async function AboutPage() {
  const plan = await getPlan();

  return (
    <>
      <PageHero
        eyebrow="About FortuneX"
        title="A trading platform that publishes its own rules"
        lead="Most platforms in this space ask you to trust a number. We would rather you checked ours — so the compensation plan, the earnings ceiling, the fees and the controls behind them are all stated in public, in the same terms the software applies them."
      />

      {/* ── story ─────────────────────────────────────────────────────── */}
      <Section>
        <Container>
          <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-6">
              <SectionHead eyebrow="Our position" title="Built for people who read the terms" />
              <div className="mt-6 space-y-4 text-[14.5px] leading-[1.8] text-white/62">
                <p>
                  FortuneX combines a trading return on committed capital with an affiliate
                  structure that rewards members for building a network. Both of those things
                  exist elsewhere. What is unusual is how little of it is left to interpretation.
                </p>
                <p>
                  The daily trade bonus is {plan.dailyReturnPercent}% of invested capital on trading
                  days. The earnings ceiling is {plan.capPassivePercent}% of that capital. The
                  generation bonus reaches thirty levels with stated qualifications at each band.
                  None of these are introductory rates or promotional figures — they are the
                  constants the platform runs on, and when an operator changes one, the change is
                  recorded with the name of the person who made it.
                </p>
                <p>
                  We take the same approach to the parts that are less comfortable to say out
                  loud. Trading carries risk. A ceiling means earnings stop. A fee is deducted
                  from what you withdraw. All of that is on this site because a member who is
                  surprised later was not properly informed earlier.
                </p>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-white/[0.07]">
                <Image src="/brand/grow-network.png" alt="" aria-hidden fill sizes="(max-width: 1024px) 100vw, 560px"
                       className="object-cover" />
                <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-navy-deep via-transparent to-transparent" />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3">
                {FACTS(plan).map((f) => (
                  <div key={f.k} className="rounded-xl border border-white/[0.07] bg-navy-card/60 px-4 py-3.5">
                    <dd className="text-[22px] font-semibold tracking-[-0.02em] text-brand-gold tabular-nums">{f.v}</dd>
                    <dt className="mt-0.5 text-[12px] text-white/50">{f.k}</dt>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </Container>
      </Section>

      {/* ── principles ────────────────────────────────────────────────── */}
      <Section tone="raised" id="security">
        <Container>
          <SectionHead
            eyebrow="What we hold ourselves to"
            title="Four commitments, each of them testable"
            lead="A value that cannot be checked is decoration. Each of these describes something you could verify from your own account history."
          />
          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {VALUES(plan).map(({ Icon, title, body }) => (
              <Panel key={title} hover className="p-6 sm:p-7">
                <span className="grid h-11 w-11 place-items-center rounded-xl border border-brand-gold/25 bg-brand-gold/10 text-brand-gold">
                  <Icon size={19} strokeWidth={1.9} />
                </span>
                <h3 className="mt-5 text-[16.5px] font-semibold text-white">{title}</h3>
                <p className="mt-2.5 text-[13.5px] leading-[1.75] text-white/58">{body}</p>
              </Panel>
            ))}
          </div>
        </Container>
      </Section>

      {/* ── how we got here ───────────────────────────────────────────── */}
      <Section>
        <Container>
          <SectionHead eyebrow="How we got here" title="The order things were built in" lead="Not a company timeline so much as an engineering one — the sequence matters, because each layer depends on the one before it." />
          <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {MILESTONES.map((m, i) => (
              <li key={m.title}>
                <Panel className="h-full p-6">
                  <span className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-brand-gold">{m.year}</span>
                  <span aria-hidden className="mt-4 block h-px w-full bg-gradient-to-r from-brand-gold/40 to-transparent" />
                  <h3 className="mt-4 text-[15.5px] font-semibold text-white">{m.title}</h3>
                  <p className="mt-2 text-[13px] leading-[1.75] text-white/55">{m.body}</p>
                  <span className="sr-only">Step {i + 1}</span>
                </Panel>
              </li>
            ))}
          </ol>
        </Container>
      </Section>

      {/* ── leadership ────────────────────────────────────────────────── */}
      <Section id="leadership">
        <Container>
          <SectionHead
            eyebrow="Who runs it"
            title="The people accountable for the plan"
            lead="A published plan needs someone whose name is attached to it. These are the two roles that decide what the platform pays and how it trades."
          />
          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {LEADERSHIP.map(({ role, name, body }) => (
              <Panel key={name} hover className="p-6 sm:p-7">
                <span className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-brand-gold">{role}</span>
                <h3 className="mt-3 text-[18px] font-semibold tracking-[-0.015em] text-white">{name}</h3>
                <span aria-hidden className="mt-4 block h-px w-full bg-gradient-to-r from-brand-gold/40 to-transparent" />
                <p className="mt-4 text-[13.5px] leading-[1.75] text-white/58">{body}</p>
              </Panel>
            ))}
          </div>
        </Container>
      </Section>

      {/* ── operations ────────────────────────────────────────────────── */}
      <Section tone="raised">
        <Container>
          <div className="grid gap-10 lg:grid-cols-3">
            {[
              { Icon: Building2, title: 'Where we are', body: 'FortuneX operates from Business Bay, Dubai, with members across more than twenty countries. Support is handled in-platform so every exchange stays attached to the account it concerns.' },
              { Icon: Users, title: 'How support works', body: 'Tickets are answered by named operators, not a shared mailbox. The person replying can see your ledger, your capping position and your network — which is why answers arrive with figures in them.' },
              { Icon: ShieldCheck, title: 'Verification', body: 'Identity documents are held privately, outside any public path, and are visible only to a reviewer with the compliance capability. A decision records who made it and why.' },
            ].map(({ Icon, title, body }) => (
              <div key={title}>
                <span className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/[0.03] text-brand-gold">
                  <Icon size={19} strokeWidth={1.9} />
                </span>
                <h3 className="mt-5 text-[16.5px] font-semibold text-white">{title}</h3>
                <p className="mt-2.5 text-[13.5px] leading-[1.75] text-white/58">{body}</p>
              </div>
            ))}
          </div>
        </Container>
      </Section>

      <CtaBand
        title="Read the plan, then decide"
        lead="Everything that governs an account on FortuneX is published before you open one. Start with the tiers, or talk to us first."
      />
    </>
  );
}
