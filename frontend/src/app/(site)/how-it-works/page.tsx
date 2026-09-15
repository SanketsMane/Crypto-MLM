import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ArrowRightLeft, BadgeCheck, CalendarClock, Clock, Coins, CreditCard, Layers, Wallet } from 'lucide-react';
import { Container, Panel, Section, SectionHead } from '@/components/site/primitives';
import { PageHero } from '@/components/site/page-hero';
import { CtaBand } from '@/components/site/cta-band';
import { getPlan, planMoney } from '@/lib/platform-config.server';

/** What `getPlan()` returns — the live plan, in the shapes this page renders. */
type Plan = Awaited<ReturnType<typeof getPlan>>;

export const metadata: Metadata = {
  title: 'How it works',
  description:
    'From deposit to withdrawal: how the daily trade bonus accrues, how the earnings ceiling is applied, and how money moves through the platform.',
};

const WALLETS = [
  { Icon: CreditCard, name: 'Fund wallet', body: 'Where confirmed deposits land, and the balance that buys a tier. Money enters here and leaves as an investment.' },
  { Icon: Coins, name: 'Main wallet', body: 'Where every form of income is credited — the daily trade bonus, direct and generation commissions, and rank rewards. Withdrawals are taken from here.' },
  { Icon: Wallet, name: 'Digital wallet', body: 'Held for digital-asset balances kept separately from trading capital and income.' },
];

const JOURNEY = (plan: Plan) => [
  {
    n: '01', Icon: BadgeCheck, title: 'Register and verify',
    body: 'Create an account with an email address, and a sponsor code if someone introduced you. Identity verification is a one-time step: upload an ID document and a selfie, and a compliance reviewer makes a decision that is recorded against your submission.',
    note: 'Your documents are stored privately and never given a public link.',
  },
  {
    n: '02', Icon: ArrowRightLeft, title: 'Deposit in USDT',
    body: `Send USDT on the BEP-20 network to your funding address and report the transaction. An operator confirms it against the chain, and the credit posts to your Fund wallet as a ledger entry with the balance it produced.`,
    note: 'A deposit is never credited twice — the reference on the entry makes a replay impossible.',
  },
  {
    n: '03', Icon: Layers, title: 'Choose a tier',
    body: `Ten tiers run from ${planMoney(plan.packages[0])} to ${planMoney(plan.packages[plan.packages.length - 1])}. Purchasing debits your Fund wallet and creates the investment in a single transaction: if any part fails, none of it happens. Your earnings ceiling is fixed at that moment.`,
    note: `${plan.capPassivePercent}% of committed capital, or ${plan.capActivePercent}% as an active affiliate.`,
  },
  {
    n: '04', Icon: CalendarClock, title: 'Earn each trading day',
    body: `At 00:10 UTC on ${plan.tradingDays}, the platform accrues ${plan.dailyReturnPercent}% of your invested capital and credits it to your Main wallet. The same run pays the generation bonus to everyone above you who qualifies. Weekends do not accrue.`,
    note: 'The run is idempotent by day — a retry can never pay the same day twice.',
  },
  {
    n: '05', Icon: Clock, title: 'Withdraw',
    body: `Request from ${planMoney(plan.withdraw.min)} up to ${planMoney(plan.withdraw.max)} per request. Your balance is debited the moment you submit — in the same transaction that creates the request — so the funds cannot be spent twice while it is pending.`,
    note: `${plan.withdraw.feePercent}% fee, processed within ${plan.withdraw.slaHours} hours. A rejected request is refunded in full, fee included.`,
  },
];

export default async function HowItWorksPage() {
  const plan = await getPlan();

  const example = plan.packages[3];
  const daily = (example * plan.dailyReturnPercent) / 100;
  const ceiling = (example * plan.capPassivePercent) / 100;

  return (
    <>
      <PageHero
        eyebrow="How it works"
        title="From deposit to settlement, step by step"
        lead="Every stage below describes what the platform actually does, in the order it does it. Where a rule protects you — an atomic debit, an idempotent payout run, a full refund on rejection — it is named rather than assumed."
      />

      {/* ── journey ───────────────────────────────────────────────────── */}
      <Section>
        <Container>
          <ol className="space-y-4">
            {JOURNEY(plan).map((s) => (
              <li key={s.n}>
                <Panel className="grid gap-5 p-6 sm:grid-cols-12 sm:p-8">
                  <div className="flex items-center gap-4 sm:col-span-4 sm:block">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-brand-gold/25 bg-brand-gold/10 text-brand-gold">
                      <s.Icon size={19} strokeWidth={1.9} />
                    </span>
                    <div className="sm:mt-4">
                      <span className="text-[11.5px] font-semibold tracking-[0.14em] text-brand-gold tabular-nums">{s.n}</span>
                      <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-white sm:mt-1">{s.title}</h2>
                    </div>
                  </div>
                  <div className="sm:col-span-8">
                    <p className="text-[14px] leading-[1.8] text-white/62">{s.body}</p>
                    <p className="mt-3 flex items-start gap-2 border-l-2 border-brand-gold/35 pl-3 text-[12.5px] leading-relaxed text-white/60">
                      {s.note}
                    </p>
                  </div>
                </Panel>
              </li>
            ))}
          </ol>
        </Container>
      </Section>

      {/* ── worked example ────────────────────────────────────────────── */}
      <Section tone="raised">
        <Container>
          <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-5">
              <SectionHead
                eyebrow="A worked example"
                title="What a tier actually produces"
                lead="The arithmetic is deliberately simple, because the plan is. Here is one tier followed through to its ceiling."
              />
              <p className="mt-6 text-[13px] leading-relaxed text-white/60">
                This is arithmetic on the published rates, not a forecast. Accrual stops when the
                ceiling is reached, and the platform does not promise a timeframe.
              </p>
            </div>

            <Panel className="p-7 sm:p-8 lg:col-span-7">
              <dl className="divide-y divide-white/[0.07]">
                {[
                  { k: 'Capital committed', v: `$${example.toLocaleString('en-US')}`, note: 'Tier 4' },
                  { k: `Daily trade bonus at ${plan.dailyReturnPercent}%`, v: `$${daily.toFixed(2)}`, note: `${plan.tradingDays} only` },
                  { k: 'Per five-day trading week', v: `$${(daily * 5).toFixed(2)}`, note: 'Weekends do not accrue' },
                  { k: `Earnings ceiling at ${plan.capPassivePercent}%`, v: `$${ceiling.toLocaleString('en-US')}`, note: 'Total lifetime earnings from this tier' },
                ].map((r) => (
                  <div key={r.k} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-4 first:pt-0 last:pb-0">
                    <dt className="text-[13.5px] text-white/62">
                      {r.k}
                      <span className="mt-0.5 block text-[11.5px] text-white/55">{r.note}</span>
                    </dt>
                    <dd className="text-[19px] font-semibold tabular-nums text-white">{r.v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-6 rounded-xl border border-white/[0.07] bg-navy-deep/60 px-4 py-3 text-[12.5px] leading-relaxed text-white/60">
                Once total earnings from a tier reach its ceiling, that tier is marked capped and
                stops accruing. Commissions your network would have paid you are limited by the
                same ceiling, and the platform records the amount the cap withheld rather than
                quietly dropping it.
              </p>
            </Panel>
          </div>
        </Container>
      </Section>

      {/* ── wallets ───────────────────────────────────────────────────── */}
      <Section>
        <Container>
          <SectionHead
            eyebrow="Your wallets"
            title="Three balances, each with one job"
            lead="Keeping funding separate from income is what makes a statement readable — you can always tell what you put in from what the platform paid you."
          />
          <div className="mt-12 grid gap-4 lg:grid-cols-3">
            {WALLETS.map(({ Icon, name, body }) => (
              <Panel key={name} hover className="p-6 sm:p-7">
                <span className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/[0.03] text-brand-gold">
                  <Icon size={19} strokeWidth={1.9} />
                </span>
                <h3 className="mt-5 text-[16.5px] font-semibold text-white">{name}</h3>
                <p className="mt-2.5 text-[13.5px] leading-[1.75] text-white/58">{body}</p>
              </Panel>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/[0.07] bg-navy-card/60 px-6 py-5">
            <p className="text-[14px] text-white/62">
              Want the numbers for every tier side by side?
            </p>
            <Link href="/plans" className="inline-flex items-center gap-2 text-[14px] font-medium text-brand-gold transition hover:gap-3">
              Compare all {plan.packages.length} tiers <ArrowRight size={15} />
            </Link>
          </div>
        </Container>
      </Section>

      <CtaBand />
    </>
  );
}
