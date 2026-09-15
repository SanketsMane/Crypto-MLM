import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, FileText, Lock, ScrollText } from 'lucide-react';
import { getPlan, planMoney } from '@/lib/platform-config.server';
import { PageHero } from '@/components/home/page-hero';
import { Card, Container, Heading } from '@/components/home/sections';
import { Reveal } from '@/components/home/motion';

export const metadata: Metadata = {
  title: 'Terms & Conditions',
  description: 'The documents that govern an account, and the commercial terms as the platform currently enforces them.',
};

export const revalidate = 60;

/**
 * A hub, not a copy.
 *
 * The four legal documents live at /legal/* and are the canonical text.
 * Restating them here would give the platform two versions of its own terms
 * and a guarantee that one drifts. This page points at them, and shows the
 * commercial figures live from the config so the summary cannot go stale.
 */
const DOCS = [
  { Icon: ScrollText, title: 'Terms of service', href: '/legal/terms',
    body: 'The agreement between you and the platform — eligibility, accounts, the compensation plan, and how the relationship can end.' },
  { Icon: Lock, title: 'Privacy policy', href: '/legal/privacy',
    body: 'What we collect, why, how long it is kept, who can see it inside the company and what you can ask us to delete.' },
  { Icon: FileText, title: 'AML & KYC policy', href: '/legal/aml-kyc',
    body: 'Identity verification, source-of-funds checks, monitoring and the circumstances in which an account is restricted.' },
  { Icon: AlertTriangle, title: 'Risk disclosure', href: '/legal/risk-disclosure',
    body: 'Trading carries risk and returns are not guaranteed. This is the document that says so plainly, and it is worth reading first.' },
];

export default async function TermsPage() {
  const plan = await getPlan();
  const w = plan.withdraw;

  const COMMERCIAL = [
    { k: 'Daily trade bonus', v: `${plan.dailyReturnPercent}%`, n: plan.tradingDays },
    { k: 'Earnings ceiling', v: `${plan.capPassivePercent}%`, n: `${plan.capActivePercent}% where the active qualification is met` },
    { k: 'Minimum entry', v: planMoney(plan.cfg.investment.minimum), n: `${plan.packages.length} tiers available` },
    { k: 'Withdrawal fee', v: `${w.feePercent}%`, n: 'Deducted from the requested amount' },
    { k: 'Withdrawal limits', v: `${planMoney(w.min)} – ${planMoney(w.max)}`, n: 'Per request' },
    { k: 'Payout schedule', v: plan.payout.label ?? `${w.slaHours} hours`, n: `Requests any time · settled in ${w.network}` },
  ];

  return (
    <main>
      <PageHero
        crumb="Terms"
        title="Terms & conditions"
        lead="Four documents govern an account here. They are written to be read, not to be survived — and the commercial figures below are pulled from the running platform rather than typed into a page."
      />

      <section className="py-16 sm:py-20">
        <Container>
          <Reveal><Heading className="text-center">The documents</Heading></Reveal>
          <div className="mt-14 grid gap-5 sm:grid-cols-2">
            {DOCS.map(({ Icon, title, href, body }, i) => (
              <Reveal key={title} delay={i * 110} className="h-full">
                <Link href={href} className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--home-gold)] rounded-2xl">
                  <Card className="flex h-full flex-col p-7">
                    <span className="grid h-12 w-12 place-items-center rounded-xl bg-[var(--home-gold)]/12 text-[var(--home-gold)] ring-1 ring-[var(--home-gold)]/25">
                      <Icon size={20} strokeWidth={1.9} aria-hidden />
                    </span>
                    <h3 className="mt-5 text-[18px] font-bold text-[var(--home-text)]">{title}</h3>
                    <p className="mt-3 flex-1 text-[13.5px] leading-[1.75] text-[var(--home-text-2)]">{body}</p>
                    <span className="mt-6 inline-flex items-center gap-2 text-[13.5px] font-semibold text-[var(--home-gold)]">
                      Read it <ArrowRight size={14} strokeWidth={2.6} aria-hidden />
                    </span>
                  </Card>
                </Link>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      <section className="border-t border-[var(--home-line)] py-16 sm:py-20">
        <Container>
          <Reveal>
            <Heading className="text-center">Commercial terms, as enforced today</Heading>
            <p className="mx-auto mt-4 max-w-[62ch] text-center text-[14.5px] leading-[1.8] text-[var(--home-text-2)]">
              Every figure here is read from the live platform configuration. If an operator changes
              one, this page changes with it — and the change is recorded against their name.
            </p>
          </Reveal>

          <dl className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {COMMERCIAL.map((c, i) => (
              <Reveal key={c.k} delay={i * 80} className="h-full">
                <Card className="h-full p-6">
                  <dt className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--home-text-3)]">{c.k}</dt>
                  <dd className="mt-2 text-[26px] font-bold leading-none text-[var(--home-gold)]">{c.v}</dd>
                  <p className="mt-2.5 text-[12.5px] leading-relaxed text-[var(--home-text-2)]">{c.n}</p>
                </Card>
              </Reveal>
            ))}
          </dl>

          <Reveal delay={200}>
            <p className="mx-auto mt-12 max-w-[70ch] rounded-2xl border border-[var(--home-line)] bg-[var(--home-surface)] px-6 py-5 text-center text-[13px] leading-[1.8] text-[var(--home-text-2)]">
              Where this summary and the legal documents differ, the documents govern. Trading carries
              risk, past performance does not indicate future results, and an earnings ceiling means
              earnings stop.
            </p>
          </Reveal>
        </Container>
      </section>
    </main>
  );
}
