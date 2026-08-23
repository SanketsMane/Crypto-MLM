import type { Metadata } from 'next';
import { getPlan, planMoney } from '@/lib/platform-config.server';
import { PageHero } from '@/components/home/page-hero';
import { Faq, type QA } from '@/components/home/faq';
import { CtaBand } from '@/components/home/sections';

export const metadata: Metadata = {
  title: 'FAQ | FortuneX',
  description: 'Answers on trading, packages, deposits, withdrawals, the network and security.',
};

export const revalidate = 60;

export default async function FaqPage() {
  const plan = await getPlan();
  const w = plan.withdraw;

  const items: QA[] = [
    { q: 'What is FortuneX and how does it work?',
      a: `FortuneX is a trading and affiliate platform. You commit capital to a tier and earn a published daily trade bonus of ${plan.dailyReturnPercent}% on trading days, alongside an affiliate structure that pays on the network you build.` },
    { q: 'What is the minimum to start?',
      a: `Entry starts at ${planMoney(plan.cfg.investment.minimum)}. There are ${plan.packages.length} tiers in total, the largest being ${planMoney(plan.packages[plan.packages.length - 1])}. The tier sets the size of your position — the rate and the rules are identical at every level.` },
    { q: 'When is the daily trade bonus paid?',
      a: `${plan.dailyReturnPercent}% of your invested capital, ${plan.tradingDays.toLowerCase()}. It is credited to your wallet as a ledger entry, so you can trace any balance back to the entries that produced it.` },
    { q: 'Is there a limit on what I can earn?',
      a: `Yes, and it is published rather than buried. Earnings are capped at ${plan.capPassivePercent}% of committed capital for passive income and ${plan.capActivePercent}% where the active qualification is met. The cap is applied at the moment of every payout.` },
    { q: 'How do deposits and withdrawals work?',
      a: `Both settle in ${w.network}. Withdrawals carry a ${w.feePercent}% fee, a minimum of ${planMoney(w.min)} and a maximum of ${planMoney(w.max)} per request, and are processed within ${w.slaHours} hours.` },
    { q: 'How does the affiliate network pay?',
      a: `Two ways. A direct sponsor bonus splits ${plan.directBonus.reduce((s, d) => s + d.percent, 0)}% across your first three levels, and a generation bonus pays on the daily trade bonus earned beneath you, reaching thirty levels with a stated qualification at each band.` },
    { q: 'What are executive ranks?',
      a: `A ${plan.ranks.length}-rank ladder from ${plan.ranks[0]?.name} to ${plan.ranks[plan.ranks.length - 1]?.name}, each with a self-capital and team-business requirement and a one-off reward on qualification. Business already counted carries forward to the next rank.` },
    { q: 'What is the Roaming Club?',
      a: 'Travel rewards earned on performance, through two independent tracks — one on your own capital alone, one on capital plus team business. Roaming Club awards sit outside your earnings cap and are travel entitlements rather than cash.' },
    { q: 'Do I need to verify my identity?',
      a: 'Yes. Documents are held privately, outside any public path, and are visible only to a reviewer holding the compliance capability. Every decision records who made it and why.' },
    { q: 'Is FortuneX secure?',
      a: 'No balance is ever written directly — every movement of value is an append-only ledger entry. Operator actions are audited with who, what, when and from where, and the log has no update or delete path.' },
    { q: 'Does FortuneX have a mobile app?',
      a: 'Not yet. The platform is built mobile-first and works in any browser; a native app is on the roadmap rather than available today.' },
  ];

  return (
    <main>
      <PageHero
        crumb="FAQ"
        title="Frequently asked questions"
        lead="Everything that governs an account is published before you open one. If something below is still unclear, the support desk answers with figures rather than platitudes."
      />
      <div className="py-20 sm:py-24">
        <Faq items={items} heading="Everything, answered"
             lead="Trading, packages, payouts, the network and the controls behind them." />
      </div>
      <CtaBand />
    </main>
  );
}
