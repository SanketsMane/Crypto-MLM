import type { Metadata } from 'next';
import { LegalPage } from '@/components/home/legal-page';
import { getPlan, planMoney } from '@/lib/platform-config.server';

export const metadata: Metadata = {
  title: 'Risk disclosure',
  description: 'The risks of trading and digital-asset products, and what the compensation plan does and does not promise.',
};

export default async function RiskPage() {
  const plan = await getPlan();

  return (
    <LegalPage
      current="/legal/risk-disclosure"
      updated="21 August 2026"
      title="Risk disclosure"
      summary="Read this before committing capital. It sets out, plainly, what can go wrong and what our published figures do and do not mean."
      sections={[
        {
          heading: 'Capital is at risk',
          body: (
            <>
              <p>
                Trading and digital-asset products carry risk, <strong>including the loss of some
                or all of the capital you commit</strong>. You should not commit funds you cannot
                afford to lose, and you should not commit funds you may need at short notice.
              </p>
              <p>
                No part of this website, the platform, or any communication from us is a promise
                that you will profit.
              </p>
            </>
          ),
        },
        {
          heading: 'What the published figures mean',
          body: (
            <>
              <p>
                The {plan.dailyReturnPercent}% daily trade bonus, the {plan.capPassivePercent}% earnings
                ceiling, the commission percentages and the rank rewards are <strong>the terms of
                our compensation plan</strong> — the rates at which the platform pays when it
                pays. They are not a forecast, a projection, or a guaranteed rate of return.
              </p>
              <p>
                Worked examples on this site are arithmetic applied to those published rates. They
                illustrate how the plan calculates, not what you will receive.
              </p>
              <p>
                <strong>Past performance never predicts future results.</strong>
              </p>
            </>
          ),
        },
        {
          heading: 'The earnings ceiling',
          body: (
            <>
              <p>
                Earnings from a position are capped at {plan.capPassivePercent}% of the capital
                committed to it. That ceiling covers the daily trade bonus <em>and</em> any network
                commissions credited while the position is active.
              </p>
              <p>
                When the ceiling is reached, the position stops accruing and commissions it would
                otherwise have paid you are reduced to nothing. This is a feature of the plan, not
                a fault, and it is applied to every member on the same terms.
              </p>
            </>
          ),
        },
        {
          heading: 'The trade bonus is not continuous',
          body: (
            <p>
              The daily trade bonus accrues on trading days only — {plan.tradingDays}.
              Weekends and any day the platform designates as non-trading do not accrue. Nothing
              obliges the platform to accrue on a day when it does not trade.
            </p>
          ),
        },
        {
          heading: 'Digital-asset and network risk',
          body: (
            <>
              <p>
                Deposits and withdrawals settle in {plan.withdraw.network}. That exposes you to risks
                outside our control, including:
              </p>
              <ul>
                <li>Blockchain congestion, reorganisation, or protocol changes delaying or altering a transfer.</li>
                <li>Sending funds to an incorrect or incompatible address — such transfers are generally irreversible and cannot be recovered by us.</li>
                <li>Movements in the value of the asset itself relative to any other currency.</li>
                <li>Loss of access to your own wallet, keys or credentials.</li>
              </ul>
            </>
          ),
        },
        {
          heading: 'Affiliate earnings depend on others',
          body: (
            <p>
              Network commissions depend on the activity of members you did not recruit and cannot
              control, and on meeting qualification thresholds at the moment a payout is
              calculated. Falling below a threshold stops that band paying until it is met again.
              Building a network requires effort and produces no guaranteed income.
            </p>
          ),
        },
        {
          heading: 'Operational and regulatory risk',
          body: (
            <>
              <p>
                Access to the platform may be interrupted by maintenance, technical failure or
                circumstances beyond our control. {plan.payout.sentence} Settlement is subject to
                identity verification and anti-money-laundering checks, which may take longer in
                individual cases.
              </p>
              <p>
                The regulatory treatment of digital assets differs by jurisdiction and continues
                to change. It is your responsibility to determine whether your participation is
                lawful where you live, and to meet any tax obligations arising from it.
              </p>
            </>
          ),
        },
        {
          heading: 'No advice',
          body: (
            <p>
              Nothing on this website or within the platform is investment, financial, legal or
              tax advice, and no communication from us should be treated as a personal
              recommendation. We do not assess whether a product is suitable for your
              circumstances. Take independent professional advice before committing capital.
              Minimum entry is {planMoney(plan.withdraw.min)} for a withdrawal and considerably more
              for a position — neither figure implies either is appropriate for you.
            </p>
          ),
        },
      ]}
    />
  );
}
