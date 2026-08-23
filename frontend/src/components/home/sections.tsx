'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { CountUp, Reveal } from './motion';

/* ── shared bits ──────────────────────────────────────────────────────── */

export function Container({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[1320px] px-4 sm:px-6 ${className}`}>{children}</div>;
}

export function Heading({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={`text-[30px] font-bold leading-[1.15] tracking-[-0.02em] text-white sm:text-[40px] ${className}`}>
      {children}
    </h2>
  );
}

/** Near-black panel with the template's hairline border and orange hover lift. */
export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`group/card relative overflow-hidden rounded-2xl border border-[var(--home-line)] bg-[var(--home-surface)] transition-all duration-300 hover:-translate-y-1.5 hover:border-[var(--home-line-lit)] hover:shadow-[0_24px_60px_-30px_rgba(212,175,55,0.55)] ${className}`}>
      {children}
    </div>
  );
}

/* ── four feature cards ───────────────────────────────────────────────── */

const FEATURES = (daily: number, minimum: number, direct: number) => [
  { icon: '/home/icon/subscription.png', title: 'Getting Started',
    body: `Begin trading with just $${minimum} and unlock up to ${daily}% daily rewards.` },
  { icon: '/home/icon/crossmargin.png', title: 'Daily Trade Bonus',
    body: `Earn ${daily}% profit daily (Mon to Fri) with transparent profit sharing in USDT.` },
  { icon: '/home/icon/lottery.png', title: 'Rank Bonus',
    body: 'Earn instant rewards and quarterly bonuses while contributing to a trusted trading community.' },
  { icon: '/home/icon/redemption.png', title: 'Direct Sponsor Bonus',
    body: `Earn up to ${direct}% from direct referrals and grow your network with instant rewards.` },
];

export function Features({ daily, minimum, direct }: { daily: number; minimum: number; direct: number }) {
  return (
    <section className="py-20 sm:py-24">
      <Container>
        <Reveal>
          <Heading className="mx-auto max-w-[24ch] text-center">
            Smarter trading tools and AI insights for the decentralized future
          </Heading>
        </Reveal>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES(daily, minimum, direct).map((f, i) => (
            <Reveal key={f.title} delay={i * 110} className="h-full">
              <Card className="h-full p-7">
                <span className="grid h-[104px] w-[104px] place-items-center rounded-full bg-[var(--home-raised)] transition-transform duration-500 group-hover/card:scale-105">
                  <Image src={f.icon} alt="" aria-hidden width={58} height={58} className="object-contain" />
                </span>
                <h3 className="mt-6 text-[19px] font-bold leading-snug text-white">{f.title}</h3>
                <p className="mt-3 text-[13.5px] leading-[1.75] text-[var(--home-text-2)]">{f.body}</p>
              </Card>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ── how to get started ───────────────────────────────────────────────── */

const STEPS = [
  { n: '01', title: 'Create Your Account', body: 'Register in under a minute with an email address and a sponsor code.', cta: 'Register Now', href: '/register' },
  { n: '02', title: 'Activate Your Account', body: 'Verify your identity and fund your wallet with USDT on BEP-20.', cta: 'Activate Now', href: '/login' },
  { n: '03', title: 'Choose a Package', body: 'Pick the tier that matches your capital and start earning from the next trading day.', cta: 'View Packages', href: '/plans' },
  { n: '04', title: 'Withdraw Your Profit', body: 'Request a payout whenever you like — settled to your own wallet address.', cta: 'Withdraw Now', href: '/login' },
];

export function HowToStart() {
  return (
    <section className="relative isolate overflow-hidden py-20 sm:py-24">
      <Image src="/home/background-bg.jpeg" alt="" aria-hidden fill sizes="100vw"
             className="-z-20 object-cover opacity-50" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-black via-black/70 to-black" />
      <Container>
        <div className="grid items-end gap-6 lg:grid-cols-2">
          <Reveal from="left"><Heading>How to Get Started</Heading></Reveal>
          <Reveal from="right">
            <p className="text-[14.5px] leading-[1.8] text-[var(--home-text-2)] lg:text-right">
              Start your journey with <strong className="font-semibold text-white">FortuneX</strong> and unlock
              smarter trading solutions. Follow these simple steps to begin trading and earning daily profits.
            </p>
          </Reveal>
        </div>

        <ol className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 110} as="li" className="h-full">
              <Card className="flex h-full flex-col p-7">
                <span className="text-[38px] font-bold leading-none text-[var(--home-gold)]/35 transition-colors duration-300 group-hover/card:text-[var(--home-gold)]">
                  {s.n}
                </span>
                <h3 className="mt-5 text-[18px] font-bold text-white">{s.title}</h3>
                <p className="mt-2.5 text-[13.5px] leading-[1.75] text-[var(--home-text-2)]">{s.body}</p>
                <Link href={s.href}
                      className="mt-auto inline-flex w-fit items-center gap-2 pt-6 text-[13.5px] font-semibold text-[var(--home-gold)] transition hover:gap-3">
                  {s.cta} <ArrowRight size={14} strokeWidth={2.6} aria-hidden />
                </Link>
              </Card>
            </Reveal>
          ))}
        </ol>
      </Container>
    </section>
  );
}

/* ── trust and security ───────────────────────────────────────────────── */

export function Trust() {
  return (
    <section className="py-20 sm:py-24">
      <Container>
        <Reveal><Heading className="text-center">Trust and Security with FortuneX</Heading></Reveal>

        <div className="mt-14 grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <Reveal from="left">
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-[var(--home-line)]">
              <Image src="/home/trust-security.jpg" alt="" aria-hidden fill
                     sizes="(max-width: 1024px) 100vw, 600px" className="object-cover" />
            </div>
          </Reveal>

          <Reveal from="right">
            <h3 className="text-[26px] font-bold text-white sm:text-[32px]">Forex Trading</h3>
            <p className="mt-4 text-[14.5px] leading-[1.85] text-[var(--home-text-2)]">
              FortuneX pairs AI-assisted trading strategy with transparent transactions and fully
              segregated customer funds, so every position and every payout can be accounted for.
            </p>
            <ul className="mt-8 space-y-4">
              {[
                { t: '24/7 Customer Support', b: 'Assistance whenever you need it, with answers that arrive carrying your actual figures.' },
                { t: 'AI-Powered Trade Algorithm', b: 'Strategy and risk controls maintained by traders who have run them in live markets.' },
                { t: 'Trusted & Secure Platform', b: 'Bank-grade encryption, multi-layer access control and an append-only audit trail.' },
              ].map((f) => (
                <li key={f.t} className="flex gap-4">
                  <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--home-gold)]/12 text-[var(--home-gold)] ring-1 ring-[var(--home-gold)]/25">
                    <ShieldCheck size={18} strokeWidth={2} aria-hidden />
                  </span>
                  <div>
                    <h4 className="text-[15.5px] font-semibold text-white">{f.t}</h4>
                    <p className="mt-1 text-[13.5px] leading-[1.7] text-[var(--home-text-2)]">{f.b}</p>
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

/* ── counters ─────────────────────────────────────────────────────────── */

export function Stats() {
  return (
    <section className="relative isolate overflow-hidden border-y border-[var(--home-line)] py-20">
      <Image src="/home/noisy-background6.png" alt="" aria-hidden fill sizes="100vw"
             className="-z-20 object-cover opacity-30" />
      <Container>
        <Reveal>
          <Heading className="mx-auto max-w-[22ch] text-center">Life in the Digital Trading World</Heading>
        </Reveal>

        {/* A list, not a description list.
            `dl` allows one `div` between itself and its `dt`/`dd`, and this had
            two — a Reveal wrapper and a Card — plus a `p` alongside them, so the
            terms were not in a description list at all as far as a screen reader
            was concerned. Three stat cards carrying a figure, a label and a
            sentence are a list; `ul`/`li` says that without the constraint. */}
        <ul className="mt-14 grid gap-5 sm:grid-cols-3">
          {[
            { v: 48, suffix: 'M+', prefix: '$', label: 'Total Trading Volume (USD)',
              body: 'FortuneX processes millions in forex trades daily, making it one of the fastest-growing trading ecosystems.' },
            { v: 126, suffix: 'K+', prefix: '', label: 'Transactions',
              body: 'Thousands of secured trades are settled every single day through our execution layer.' },
            { v: 20, suffix: 'K+', prefix: '', label: 'Investors',
              body: 'Trusted by members worldwide to grow their earnings through forex trading.' },
          ].map((s, i) => (
            <li key={s.label} className="h-full">
              <Reveal delay={i * 130} className="h-full">
                <Card className="h-full p-8 text-center">
                  <p className="text-[42px] font-bold leading-none text-[var(--home-gold)] sm:text-[52px]">
                    <CountUp to={s.v} prefix={s.prefix} suffix={s.suffix} />
                  </p>
                  <p className="mt-4 text-[16px] font-semibold text-white">{s.label}</p>
                  <p className="mt-2.5 text-[13px] leading-[1.7] text-[var(--home-text-2)]">{s.body}</p>
                </Card>
              </Reveal>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

/* ── closing call to action ───────────────────────────────────────────── */

export function CtaBand() {
  return (
    <section className="relative isolate overflow-hidden py-20 sm:py-24">
      <div aria-hidden
           className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_50%,rgba(212,175,55,0.16),transparent_65%)]" />
      <Container className="text-center">
        <Reveal>
          <Heading className="mx-auto max-w-[18ch]">Ready to Start Trading</Heading>
          <p className="mx-auto mt-5 max-w-[62ch] text-[14.5px] leading-[1.8] text-[var(--home-text-2)]">
            Join FortuneX today and experience seamless forex trading — zero hidden fees, transparent
            settlement and round-the-clock market access.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
            <Link href="/register"
                  className="group inline-flex items-center gap-2.5 rounded-xl bg-[var(--home-gold)] px-8 py-4 text-[15px] font-semibold text-black transition hover:bg-[var(--home-gold-hi)]">
              Create your account
              <ArrowRight size={16} strokeWidth={2.6} aria-hidden
                          className="transition-transform group-hover:translate-x-1" />
            </Link>
            <Link href="/plans"
                  className="inline-flex items-center rounded-xl border border-white/25 px-8 py-4 text-[15px] font-semibold text-white transition hover:border-[var(--home-gold)] hover:text-[var(--home-gold)]">
              View the plan
            </Link>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
