import { getPlan, planMoney } from '@/lib/platform-config.server';
import { CurrencyBand, Hero } from '@/components/home/hero';
import { CtaBand, Features, HowToStart, Stats, Trust } from '@/components/home/sections';
import { Markets } from '@/components/home/markets';
import { Calculator } from '@/components/home/calculator';
import { OneStop, Rewards } from '@/components/home/rewards';
import { Faq } from '@/components/home/faq';

/**
 * FortuneX home page.
 *
 * A server component on purpose: every figure below is read from the live
 * platform config at render time and handed down to the client sections, so
 * this page cannot advertise a rate the engine does not actually pay.
 */
export const revalidate = 60;

export default async function FortuneXHome() {
  const plan = await getPlan();

  const minimum = plan.cfg.investment.minimum;
  const directTotal = plan.directBonus.reduce((sum, d) => sum + d.percent, 0);
  const topRank = plan.ranks.at(-1);
  const topBand = plan.generationBands[0];
  const thailand = plan.roaming.affiliate.find((r) => r.destination === 'Thailand') ?? plan.roaming.affiliate[0];
  const dubai = plan.roaming.affiliate.find((r) => r.destination === 'Dubai') ?? plan.roaming.affiliate[2];

  const tabs = [
    {
      label: 'Daily Bonus',
      cards: [
        {
          title: 'Daily Trade Bonus', badge: 'Fixed return',
          headline: `${plan.dailyReturnPercent}%`, sub: 'Daily profit on committed capital',
          stats: [
            { k: 'Time', v: plan.tradingDays },
            { k: 'Network', v: plan.withdraw.network },
            { k: 'Entry from', v: planMoney(minimum) },
            { k: 'Ceiling', v: `${plan.capPassivePercent}%` },
          ],
          cta: 'Start earning', href: '/register',
        },
        {
          title: 'Direct Sponsor Bonus', badge: 'Instant reward',
          headline: `${directTotal}%`, sub: 'On every direct referral purchase',
          stats: plan.directBonus.map((d) => ({ k: `Level ${d.level}`, v: `${d.percent}%` })),
          cta: 'Claim now', href: '/rewards',
        },
      ],
    },
    {
      label: 'Rank Bonus',
      cards: plan.ranks.slice(0, 2).map((r, i) => ({
        title: `${r.name} Rank`, badge: i === 0 ? 'Entry rank' : 'High bonus',
        headline: planMoney(r.reward), sub: 'One-off reward on qualification',
        stats: [
          { k: 'Self capital', v: planMoney(r.self) },
          { k: 'Team business', v: planMoney(r.team) },
        ],
        cta: 'Achieve rank', href: '/rewards',
      })),
    },
    {
      label: 'Generation Bonus',
      cards: [
        {
          title: 'Generation Bonus', badge: '30 levels',
          headline: `${topBand?.percent ?? 0}%`, sub: 'Of the daily bonus earned beneath you',
          stats: [
            { k: 'Depth', v: '30 levels' },
            { k: 'Bands', v: `${plan.generationBands.length}` },
            { k: 'Level 1', v: `${topBand?.percent ?? 0}%` },
            { k: 'Qualification', v: 'Per band' },
          ],
          cta: 'See the bands', href: '/rewards',
        },
        {
          title: 'Executive Ranks', badge: 'Leadership',
          headline: topRank ? planMoney(topRank.reward) : '—', sub: `Top of a ${plan.ranks.length}-rank ladder`,
          stats: [
            { k: 'Ranks', v: `${plan.ranks.length}` },
            { k: 'Highest', v: topRank?.name ?? '—' },
            { k: 'Self capital', v: topRank ? planMoney(topRank.self) : '—' },
            { k: 'Team business', v: topRank ? planMoney(topRank.team) : '—' },
          ],
          cta: 'View the ladder', href: '/rewards',
        },
      ],
    },
    {
      label: 'Roaming Club',
      cards: [thailand, dubai].filter(Boolean).map((t) => ({
        title: `${t.destination} Trip`, badge: 'Roaming Club',
        headline: planMoney(t.self), sub: 'Self capital required',
        stats: [
          { k: 'Team business', v: planMoney(t.team) },
          { k: 'Reward', v: 'Travel entitlement' },
        ],
        cta: 'See requirements', href: '/rewards',
      })),
    },
  ];

  const rewards = [
    { title: 'Daily Trade Bonus', primary: `${plan.dailyReturnPercent}%`,
      secondary: `Minimum ${planMoney(minimum)}`, icon: '/home/icon/crossmargin.png' },
    { title: 'Direct Sponsor Bonus', primary: `Up to ${directTotal}%`,
      secondary: 'Instant payouts', icon: '/home/icon/redemption.png' },
    { title: 'Generation Bonus', primary: 'Up to 30 levels',
      secondary: 'Team-based rewards', icon: '/home/icon/snapshot.png' },
    { title: 'Executive Rank Bonus', primary: topRank ? planMoney(topRank.reward) : '—',
      secondary: 'Leadership programme', icon: '/home/icon/lottery.png' },
  ];

  const solutions = [
    { title: 'Trade a published plan', figure: `${plan.packages.length}`, caption: 'Investment tiers',
      body: 'Every tier, rate, ceiling and fee is stated in public in the same terms the software applies them — so the return can be worked out before any capital is committed.' },
    { title: 'Build a network that pays', figure: '30', caption: 'Generation levels',
      body: 'A direct sponsor bonus on referrals and a generation bonus reaching thirty levels deep, each with its own stated qualification.' },
    { title: 'Earn inside a hard ceiling', figure: `${plan.capPassivePercent}%`, caption: 'Earnings ceiling',
      body: 'Earnings are capped as a percentage of committed capital, applied at the moment of every payout and consumed atomically so it cannot be exceeded.' },
  ];

  return (
    <main>
      <Hero />
      <CurrencyBand />
      <Features daily={plan.dailyReturnPercent} minimum={minimum} direct={directTotal} />
      <HowToStart />
      <Markets tabs={tabs} />
      <Calculator daily={plan.dailyReturnPercent} minimum={minimum} packages={plan.packages} />
      <Rewards rewards={rewards} />
      <Trust />
      <OneStop solutions={solutions} />
      <Stats />
      <Faq />
      <CtaBand />
    </main>
  );
}
