'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight, BadgeCheck, Coins, Layers, LineChart, Lock, ShieldCheck, Users,
} from 'lucide-react';
import { CountUp, Figure, Reveal } from './motion';

/* ── shared bits ──────────────────────────────────────────────────────────

   These three are used ~138 times across the marketing site, so their
   signatures are fixed. What they RENDER is not, and changing it here is what
   restructures every page at once rather than section by section.            */

export function Container({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[1320px] px-4 sm:px-6 ${className}`}>{children}</div>;
}

export function Heading({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={`text-[28px] font-bold leading-[1.12] tracking-[-0.025em] text-[var(--home-text)] sm:text-[36px] ${className}`}>
      {children}
    </h2>
  );
}

/**
 * A panel.
 *
 * Was a floating card: a 16px radius, a 1.5px hover lift and a 60px orange
 * glow shadow — three separate signals that a static block of copy is
 * interactive, on a page where almost none of them are. A panel is a rectangle
 * with a rule around it; the border picks up the accent on hover, where
 * hovering means something.
 */
export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`group/card relative overflow-hidden rounded-[5px] border border-[var(--home-line)] bg-[var(--home-surface)] transition-colors duration-200 hover:border-[var(--home-line-lit)] ${className}`}>
      {children}
    </div>
  );
}

/**
 * A section header.
 *
 * Every section on this site opened with a centred heading over a centred
 * paragraph. Centred headers give a page no spine — each section restarts the
 * reading position, and with eight of them the page has no rhythm at all. An
 * aligned header with an eyebrow and a supporting line reads as a document.
 */
export function SectionHead({
  eyebrow, title, lead, align = 'left', className = '',
}: {
  eyebrow?: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  align?: 'left' | 'center';
  className?: string;
}) {
  return (
    <div className={`${align === 'center' ? 'mx-auto max-w-[62ch] text-center' : 'max-w-[68ch]'} ${className}`}>
      {eyebrow && (
        <span className="mb-3 flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.13em] text-[var(--home-gold)]">
          {align === 'left' && <span className="h-px w-6 bg-[var(--home-gold)]" />}
          {eyebrow}
        </span>
      )}
      <Heading>{title}</Heading>
      {lead && <p className="mt-4 text-[14.5px] leading-[1.8] text-[var(--home-text-2)]">{lead}</p>}
    </div>
  );
}

/* ── what the plan pays ───────────────────────────────────────────────────

   Was four cards, each with a 104px circle holding a decorative PNG. The
   circles carried no information and cost the vertical space that pushed
   everything below them off the first screen.

   Now a spec strip: figure first, separated by rules rather than floated as
   cards. A visitor scanning this wants the numbers, and the numbers are what
   they land on.                                                             */

const FEATURES = (daily: number, minimum: number, direct: number) => [
  { Icon: Coins, figure: `$${minimum}`, label: 'Minimum entry',
    body: 'The smallest tier the plan publishes. Every tier above it runs on the same terms.' },
  { Icon: LineChart, figure: `${daily}%`, label: 'Daily trade bonus',
    body: 'Paid on committed capital, Monday to Friday, settled in USDT.' },
  { Icon: Users, figure: `${direct}%`, label: 'Direct sponsor',
    body: 'Across the first three levels of your own referrals, credited on purchase.' },
  { Icon: Layers, figure: '30', label: 'Generation levels',
    body: 'Depth of the generation bonus, each band with its own stated qualification.' },
];

export function Features({ daily, minimum, direct }: { daily: number; minimum: number; direct: number }) {
  return (
    <section className="fx-glow py-16 sm:py-20">
      <Container>
        <Reveal>
          <SectionHead
            eyebrow="The plan, in four numbers"
            title="Everything priced before you commit"
            lead="These are not introductory rates. They are the constants the platform runs on, and a change to any of them is recorded against the operator who made it."
          />
        </Reveal>

        <dl className="mt-12 grid gap-px overflow-hidden rounded-[5px] border border-[var(--home-line)] bg-[var(--home-line)] sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES(daily, minimum, direct).map((f, i) => (
            <Reveal key={f.label} delay={i * 90}>
              <div className="fx-cell h-full bg-[var(--home-surface)] p-6">
                <f.Icon size={18} strokeWidth={1.9} aria-hidden className="fx-cell-icon text-[var(--home-gold)]" />
                <dd className="mt-5 tabular-nums text-[34px] font-bold leading-none tracking-[-0.03em] text-[var(--home-text)]">
                  <Figure value={f.figure} />
                </dd>
                <dt className="mt-2.5 text-[10.5px] font-semibold uppercase tracking-[0.11em] text-[var(--home-text-3)]">
                  {f.label}
                </dt>
                <p className="mt-3 text-[13px] leading-[1.7] text-[var(--home-text-2)]">{f.body}</p>
              </div>
            </Reveal>
          ))}
        </dl>
      </Container>
    </section>
  );
}

/* ── how to get started ───────────────────────────────────────────────────

   Was four separate cards, which read as four unrelated options rather than
   one sequence. A numbered rail with a connecting rule says "in this order",
   which is the only thing this section exists to say.                        */

const STEPS = [
  { title: 'Create your account', body: 'Register with an email address and a sponsor code. Under a minute.', cta: 'Register', href: '/register' },
  { title: 'Verify and fund', body: 'Confirm your identity and deposit USDT on BEP-20.', cta: 'Sign in', href: '/login' },
  { title: 'Choose a tier', body: 'Pick the tier matching your capital. Accrual starts the next trading day.', cta: 'View tiers', href: '/plans' },
  { title: 'Withdraw', body: 'Request a payout to your own wallet address, on the published schedule.', cta: 'See terms', href: '/terms' },
];

export function HowToStart() {
  return (
    <section className="border-y border-[var(--home-line)] bg-[var(--home-surface)] py-16 sm:py-20">
      <Container>
        <Reveal>
          <SectionHead
            eyebrow="Getting started"
            title="Four steps, in this order"
            lead="Nothing accrues until a tier is active, so the sequence matters more than any single step."
          />
        </Reveal>

        <ol className="mt-12 grid gap-y-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-x-6">
          {STEPS.map((s, i) => (
            <Reveal key={s.title} delay={i * 90} as="li">
              <div className="relative">
                {/* The rule that makes this a sequence rather than a grid.
                    Hidden on the last item and below lg, where the steps stack
                    and a horizontal connector would point at nothing. */}
                {i < STEPS.length - 1 && (
                  <span aria-hidden className="fx-draw absolute left-9 right-0 top-[13px] hidden h-px bg-[var(--home-line)] lg:block" />
                )}
                <span className="relative z-10 grid size-[26px] place-items-center rounded-full border border-[var(--home-gold)] bg-[var(--home-bg)] tabular-nums text-[10.5px] font-bold text-[var(--home-gold)]">
                  {i + 1}
                </span>
                <h3 className="mt-5 text-[16px] font-bold text-[var(--home-text)]">{s.title}</h3>
                <p className="mt-2 max-w-[34ch] text-[13px] leading-[1.7] text-[var(--home-text-2)]">{s.body}</p>
                <Link href={s.href}
                      className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--home-gold)] transition-all hover:gap-2.5">
                  {s.cta} <ArrowRight size={13} strokeWidth={2.4} aria-hidden />
                </Link>
              </div>
            </Reveal>
          ))}
        </ol>
      </Container>
    </section>
  );
}

/* ── trust and security ────────────────────────────────────────────────── */

const TRUST_POINTS = [
  { Icon: Users, t: '24/7 Customer Support', b: 'Assistance whenever you need it, with answers that arrive carrying your actual figures.' },
  { Icon: LineChart, t: 'AI-Powered Trade Algorithm', b: 'Strategy and risk controls maintained by traders who have run them in live markets.' },
  { Icon: Lock, t: 'Trusted & Secure Platform', b: 'Bank-grade encryption, multi-layer access control and an append-only audit trail.' },
];

export function Trust() {
  return (
    <section className="py-16 sm:py-20">
      <Container>
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <Reveal from="left">
            {/* The artwork's own 814×600 ratio, so nothing is cropped. */}
            <div className="relative aspect-[814/600] overflow-hidden rounded-[5px] border border-[var(--home-line)]">
              <Image src="/home/trust-security.png" alt="" aria-hidden fill
                     sizes="(max-width: 1024px) 100vw, 600px" className="object-cover" />
            </div>
          </Reveal>

          <Reveal from="right">
            <SectionHead eyebrow="Trust and Security with FortuneX" title="Forex Trading" />
            <p className="mt-4 text-[14.5px] leading-[1.85] text-[var(--home-text-2)]">
              FortuneX pairs AI-assisted trading strategy with transparent transactions and fully
              segregated customer funds, so every position and every payout can be accounted for.
            </p>

            {/* Rule-separated rows rather than floating list items — it reads
                as a specification, which is what it is. */}
            <ul className="mt-8 divide-y divide-[var(--home-line)] border-y border-[var(--home-line)]">
              {TRUST_POINTS.map((f) => (
                <li key={f.t} className="flex gap-4 py-4">
                  <f.Icon size={17} strokeWidth={1.9} aria-hidden className="mt-0.5 shrink-0 text-[var(--home-gold)]" />
                  <div>
                    <h3 className="text-[14.5px] font-semibold text-[var(--home-text)]">{f.t}</h3>
                    <p className="mt-1 text-[13px] leading-[1.7] text-[var(--home-text-2)]">{f.b}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}

/* ── counters ─────────────────────────────────────────────────────────────

   Was three centred cards over a noise-texture background. The texture is
   gone and so are the cards: a figure band divided by rules puts the numbers
   on one line where they can be compared, which is the point of showing
   three of them.                                                            */

const STATS = [
  { v: 48, prefix: '$', suffix: 'M+', label: 'Total trading volume',
    body: 'Processed through the execution layer since launch.' },
  { v: 126, prefix: '', suffix: 'K+', label: 'Settled transactions',
    body: 'Every one an append-only ledger entry you can open.' },
  { v: 20, prefix: '', suffix: 'K+', label: 'Members',
    body: 'Trading a plan whose terms are published in full.' },
];

export function Stats() {
  return (
    <section className="fx-glow fx-glow-r border-y border-[var(--home-line)] py-16 sm:py-20">
      <Container>
        <Reveal>
          <SectionHead eyebrow="By the numbers" title="Life in the digital trading world" />
        </Reveal>

        <ul className="mt-12 grid gap-px overflow-hidden rounded-[5px] border border-[var(--home-line)] bg-[var(--home-line)] sm:grid-cols-3">
          {STATS.map((s, i) => (
            <li key={s.label} className="h-full">
              <Reveal delay={i * 110} className="h-full">
                <div className="fx-cell h-full bg-[var(--home-surface)] p-7">
                  <p className="tabular-nums text-[40px] font-bold leading-none tracking-[-0.03em] text-[var(--home-gold)] sm:text-[46px]">
                    <CountUp to={s.v} prefix={s.prefix} suffix={s.suffix} />
                  </p>
                  <p className="mt-3.5 text-[10.5px] font-semibold uppercase tracking-[0.11em] text-[var(--home-text-3)]">
                    {s.label}
                  </p>
                  <p className="mt-2.5 text-[13px] leading-[1.7] text-[var(--home-text-2)]">{s.body}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

/* ── closing call to action ───────────────────────────────────────────────

   Was a centred stack inside a radial orange glow. Now a bordered band with
   the ask on the left and the actions on the right, so the page ends on a
   decision rather than on a decorative gradient.                            */

export function CtaBand() {
  return (
    <section className="py-16 sm:py-20">
      <Container>
        <Reveal>
          <div className="flex flex-col items-start justify-between gap-7 rounded-[5px] border border-[var(--home-line)] bg-[var(--home-surface)] px-6 py-8 sm:px-9 lg:flex-row lg:items-center">
            <div className="max-w-[54ch]">
              <Heading className="text-[24px] sm:text-[30px]">Ready to start trading</Heading>
              <p className="mt-3 text-[14px] leading-[1.75] text-[var(--home-text-2)]">
                No hidden fees, a published settlement schedule and a ceiling stated in advance.
                Read the terms first — they are written to be read.
              </p>
              <p className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
                {['Published plan', 'Audited operator actions', 'USDT · BEP-20'].map((t) => (
                  <span key={t} className="flex items-center gap-1.5 text-[12px] text-[var(--home-text-3)]">
                    <BadgeCheck size={14} strokeWidth={2} aria-hidden className="text-[var(--home-gold)]" />
                    {t}
                  </span>
                ))}
              </p>
            </div>

            <div className="flex w-full shrink-0 flex-wrap items-center gap-3 lg:w-auto">
              <Link href="/register"
                    className="group inline-flex items-center gap-2 rounded-[4px] bg-[var(--home-gold)] px-6 py-3.5 text-[14px] font-semibold text-[var(--color-gold-on)] transition-colors hover:bg-[var(--home-gold-hi)]">
                Create your account
                <ArrowRight size={15} strokeWidth={2.4} aria-hidden className="transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link href="/plans"
                    className="inline-flex items-center rounded-[4px] border border-[var(--home-line)] px-6 py-3.5 text-[14px] font-semibold text-[var(--home-text)] transition-colors hover:border-[var(--home-gold)] hover:text-[var(--home-gold)]">
                View the plan
              </Link>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

/** Re-exported for pages that pull the icon from here. */
export { ShieldCheck };
