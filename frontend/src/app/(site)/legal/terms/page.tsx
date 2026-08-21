import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalDoc } from '@/components/site/legal-doc';
import { getPlan, planMoney } from '@/lib/platform-config.server';

export const metadata: Metadata = {
  title: 'Terms of service',
  description: 'The terms governing your use of FortuneX, your account, the compensation plan and withdrawals.',
};

export default async function TermsPage() {
  const plan = await getPlan();

  return (
    <LegalDoc
      current="/legal/terms"
      updated="21 August 2026"
      title="Terms of service"
      summary="These terms govern your account and your use of the platform. By opening an account you accept them."
      sections={[
        {
          heading: 'Eligibility',
          body: (
            <>
              <p>
                You must be at least 18 years old and legally able to enter into a contract where
                you live. You must not use the platform where doing so would breach the law of
                your jurisdiction, and you are responsible for determining whether that is the
                case.
              </p>
              <p>One person may hold one account. Accounts are personal and may not be transferred, sold or shared.</p>
            </>
          ),
        },
        {
          heading: 'Your account',
          body: (
            <>
              <p>
                You are responsible for the security of your credentials and for everything done
                through your account. Tell us immediately if you believe it has been accessed
                without your permission.
              </p>
              <p>
                <strong>We will never ask for your password, a recovery phrase, a private key or a
                one-time code.</strong> Any message that does is not from us.
              </p>
              <p>
                Your position in the affiliate network is set when you register and cannot be
                changed afterwards, because every commission already paid depends on it.
              </p>
            </>
          ),
        },
        {
          heading: 'Verification',
          body: (
            <p>
              We may require identity verification before processing withdrawals, and may request
              further information at any time to meet our legal obligations. Accounts that cannot
              be verified may be restricted. See our{' '}
              <Link href="/legal/aml-kyc">AML and KYC policy</Link>.
            </p>
          ),
        },
        {
          heading: 'Deposits and positions',
          body: (
            <>
              <p>
                Deposits settle in {plan.withdraw.network} and are credited once confirmed. Sending an
                unsupported asset, or sending on the wrong network, may result in permanent loss
                that we cannot reverse.
              </p>
              <p>
                Purchasing a tier debits your funding wallet and creates a position in a single
                transaction. Your earnings ceiling — {plan.capPassivePercent}% of committed capital,
                or {plan.capActivePercent}% as an active affiliate — is fixed at that moment and
                shown to you before you confirm.
              </p>
            </>
          ),
        },
        {
          heading: 'The compensation plan',
          body: (
            <>
              <p>
                The daily trade bonus of {plan.dailyReturnPercent}% accrues on trading days only
                ({plan.tradingDays}). Commissions, rank rewards and Roaming Club awards
                are paid on the terms published on this site and are subject to the qualification
                rules stated there.
              </p>
              <p>
                We may amend the plan. Changes apply prospectively — from the date they take
                effect — and every change is recorded in our internal audit log with the person
                who made it. Amendments do not retroactively reduce amounts already credited to
                your ledger.
              </p>
              <p>
                All earnings are subject to the ceiling. When a position reaches it, that position
                stops accruing.
              </p>
            </>
          ),
        },
        {
          heading: 'Withdrawals',
          body: (
            <>
              <p>
                Withdrawals are requested from your main wallet, from {planMoney(plan.withdraw.min)} to{' '}
                {planMoney(plan.withdraw.max)} per request, with a {plan.withdraw.feePercent}% fee deducted
                from the requested amount. Your balance is debited when the request is made.
              </p>
              <p>
                Requests are processed within {plan.withdraw.slaHours} hours in the normal course. If a
                request is rejected, the full amount including the fee is returned to your wallet
                and the reason is recorded on the request.
              </p>
              <p>
                We may delay or decline a withdrawal where we are required to do so by law, where
                verification is outstanding, or where we reasonably suspect fraud.
              </p>
            </>
          ),
        },
        {
          heading: 'Acceptable use',
          body: (
            <>
              <p>You must not:</p>
              <ul>
                <li>Open more than one account, or register on someone else&apos;s behalf without authority.</li>
                <li>Misrepresent the platform, the plan or expected earnings when introducing others.</li>
                <li>Promise guaranteed returns to anyone. The plan makes no such promise and neither may you.</li>
                <li>Attempt to interfere with, probe or overload the platform, or to circumvent its access controls.</li>
                <li>Use the platform for money laundering, sanctions evasion or any other unlawful purpose.</li>
              </ul>
              <p>Breach may result in suspension or closure of your account and forfeiture of unqualified rewards.</p>
            </>
          ),
        },
        {
          heading: 'Suspension and closure',
          body: (
            <p>
              We may suspend or close an account that breaches these terms, that we are required to
              restrict, or where we reasonably suspect fraud or unlawful activity. Where we do,
              your ledger remains intact and lawfully withdrawable balances remain payable to you,
              subject to verification and any legal obligation preventing payment.
            </p>
          ),
        },
        {
          heading: 'Liability',
          body: (
            <p>
              To the fullest extent permitted by law, we are not liable for indirect or
              consequential loss, for loss of profit or anticipated earnings, or for loss arising
              from blockchain-network behaviour, from an incorrect address you supplied, or from
              circumstances beyond our reasonable control. Nothing in these terms excludes
              liability that cannot lawfully be excluded.
            </p>
          ),
        },
        {
          heading: 'Changes to these terms',
          body: (
            <p>
              We may update these terms. The current version is always published here with the
              date it was last updated. Continuing to use the platform after a change takes effect
              means you accept the updated terms.
            </p>
          ),
        },
      ]}
    />
  );
}
