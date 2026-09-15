import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, LifeBuoy } from 'lucide-react';
import { Container, Panel, Section, SectionHead } from '@/components/site/primitives';
import { PageHero } from '@/components/site/page-hero';
import { FaqAccordion, type Faq } from '@/components/site/faq-accordion';
import { CtaBand } from '@/components/site/cta-band';
import { getPlan, planMoney } from '@/lib/platform-config.server';

/** What `getPlan()` returns — the live plan, in the shapes this page renders. */
type Plan = Awaited<ReturnType<typeof getPlan>>;

/**
 * Async, because the description quotes live figures. A title that says
 * one fee while the platform charges another is the same defect as a page
 * that does.
 */
export async function generateMetadata(): Promise<Metadata> {
  const plan = await getPlan();
  return {
  title: 'Frequently asked questions',
  description: 'Straight answers on returns, the earnings ceiling, withdrawals, verification and the affiliate plan.',
};
}

const GROUPS = (plan: Plan) => [
  {
    title: 'Getting started',
    items: [
      {
        q: 'What do I need to open an account?',
        a: 'An email address and a password. If someone introduced you, their sponsor code places you in their network — you cannot be moved afterwards, so enter it at registration. Identity verification is a separate one-time step you can complete before your first withdrawal.',
      },
      {
        q: 'What is the minimum to start?',
        a: `The entry tier is ${planMoney(plan.packages[0])}. There are ${plan.packages.length} tiers in total, up to ${planMoney(plan.packages[plan.packages.length - 1])}, and you can hold more than one at a time.`,
      },
      {
        q: 'How do I fund my account?',
        a: 'Send USDT on the BEP-20 network to your funding address and report the transaction in your account. An operator confirms it against the chain and the credit posts to your Fund wallet, which is the balance that purchases a tier.',
      },
    ],
  },
  {
    title: 'Earnings',
    items: [
      {
        q: 'How is the daily trade bonus calculated?',
        a: `${plan.dailyReturnPercent}% of the capital you have committed to a tier, credited on trading days only — ${plan.tradingDays}. Weekends do not accrue. The run happens at 00:10 UTC and pays every active position at once.`,
      },
      {
        q: 'What is the earnings ceiling, and what happens when I reach it?',
        a: `Each tier can pay you a maximum of ${plan.capPassivePercent}% of the capital committed to it, or ${plan.capActivePercent}% if you are an active affiliate. That total covers the daily trade bonus and any network commissions credited while the tier is active. When the ceiling is reached the tier is marked capped and stops accruing; purchasing another tier adds its own ceiling.`,
      },
      {
        q: 'Are returns guaranteed?',
        a: 'No. The percentages published here are the terms of the compensation plan — the rate at which the platform pays when it pays — not a guarantee of profit. Trading and digital-asset products carry risk including loss of the capital you commit. Nothing on this site is investment advice.',
      },
      {
        q: 'Why did a commission pay less than I expected?',
        a: 'Two reasons account for almost every case. Either the earning member had reached their ceiling, so the payout was clamped to the headroom left; or a generation band was not qualified at the moment of payment. Both are recorded, and the amount the cap withheld is stored rather than discarded, so support can show you exactly what happened.',
      },
    ],
  },
  {
    title: 'Withdrawals',
    items: [
      {
        q: 'How quickly are withdrawals processed?',
        a: `${plan.payout.sentence} Requests past that window are flagged as overdue in the operations queue so they are visible rather than forgotten.`,
      },
      {
        q: 'What are the limits and fees?',
        a: `A minimum of ${planMoney(plan.withdraw.min)} and a maximum of ${planMoney(plan.withdraw.max)} per request, with a ${plan.withdraw.feePercent}% fee deducted from the amount requested. You receive the net figure, which is shown to you before you confirm.`,
      },
      {
        q: 'What happens if a withdrawal is rejected?',
        a: 'The full amount is refunded to your Main wallet, fee included, and the operator must record a reason that is stored on the request. Your balance is debited when you submit rather than when it is approved, which is what prevents the same funds being committed twice while a request is pending.',
      },
    ],
  },
  {
    title: 'Network & verification',
    items: [
      {
        q: 'How deep does the network pay?',
        a: 'The direct sponsor bonus pays on purchases across your first three levels. The generation bonus pays on the daily trade bonus earned up to thirty levels beneath you, in bands with published qualification thresholds on active directs and team volume.',
      },
      {
        q: 'Why do I need to verify my identity?',
        a: 'Verification lets us meet anti-money-laundering obligations and keeps withdrawals moving without manual checks. Your documents are stored privately, are never given a public link, and are visible only to a reviewer with the compliance capability — whose decision is recorded against your submission.',
      },
      {
        q: 'Can I change my sponsor?',
        a: 'No. Network position is fixed at registration because every commission ever paid depends on it. Changing a placement would retroactively alter other members’ earnings, so the platform does not allow it.',
      },
    ],
  },
];

export default async function FaqPage() {
  const plan = await getPlan();

  return (
    <>
      <PageHero
        eyebrow="Help centre"
        title="Frequently asked questions"
        lead="The questions we are asked most, answered with the same figures the platform enforces. If something here is unclear, that is worth telling us — ambiguity in this material is our problem, not yours."
      />

      <Section>
        <Container>
          <div className="grid gap-12 lg:grid-cols-12 lg:gap-14">
            <div className="lg:col-span-4">
              <div className="lg:sticky lg:top-28">
                <SectionHead eyebrow="Contents" title="Four areas" />
                <ul className="mt-6 space-y-2">
                  {GROUPS(plan).map((g) => (
                    <li key={g.title}>
                      <a href={`#${g.title.toLowerCase().replace(/[^a-z]+/g, '-')}`}
                         className="text-[14px] text-white/55 transition hover:text-brand-gold">
                        {g.title}
                      </a>
                    </li>
                  ))}
                </ul>

                <Panel className="mt-8 p-5">
                  <span className="grid h-10 w-10 place-items-center rounded-xl border border-brand-gold/25 bg-brand-gold/10 text-brand-gold">
                    <LifeBuoy size={17} strokeWidth={1.9} />
                  </span>
                  <h3 className="mt-4 text-[15px] font-semibold text-white">Still stuck?</h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-white/55">
                    Members get a support desk inside the platform, where the operator answering
                    can see your ledger and your capping position.
                  </p>
                  <Link href="/contact"
                        className="mt-4 inline-flex items-center gap-2 text-[13.5px] font-medium text-brand-gold transition hover:gap-3">
                    Contact us <ArrowRight size={14} />
                  </Link>
                </Panel>
              </div>
            </div>

            <div className="space-y-12 lg:col-span-8">
              {GROUPS(plan).map((g) => (
                <div key={g.title} id={g.title.toLowerCase().replace(/[^a-z]+/g, '-')} className="scroll-mt-28">
                  <h2 className="mb-4 text-[19px] font-semibold tracking-[-0.02em] text-white">{g.title}</h2>
                  <FaqAccordion items={g.items} />
                </div>
              ))}
            </div>
          </div>
        </Container>
      </Section>

      <CtaBand />
    </>
  );
}
