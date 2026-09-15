import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/home/legal-page';
import { getPlan, planMoney } from '@/lib/platform-config.server';

export const metadata: Metadata = {
  title: 'AML & KYC policy',
  description: 'How FortuneX verifies identity, monitors activity and meets anti-money-laundering obligations.',
};

export default async function AmlPage() {
  const plan = await getPlan();

  return (
    <LegalPage
      current="/legal/aml-kyc"
      updated="21 August 2026"
      title="AML & KYC policy"
      summary="How we verify who our members are, what we monitor, and what we are obliged to do when something does not add up."
      sections={[
        {
          heading: 'Our commitment',
          body: (
            <p>
              FortuneX does not knowingly facilitate money laundering, terrorist financing,
              sanctions evasion or any other financial crime. We apply identity verification,
              ongoing monitoring and record-keeping proportionate to the risk a member presents,
              and we cooperate with lawful requests from competent authorities.
            </p>
          ),
        },
        {
          heading: 'Identity verification',
          body: (
            <>
              <p>Members are asked to provide:</p>
              <ul>
                <li>A government-issued photographic identity document.</li>
                <li>A selfie holding that document, so the person and the document can be matched.</li>
                <li>Where risk requires it, proof of address dated within the last three months.</li>
              </ul>
              <p>
                Submissions are reviewed by a named operator holding the compliance capability. A
                decision — approval or rejection with a reason — is recorded against the
                submission and cannot be amended silently afterwards. A rejected member may
                correct the problem and submit again; earlier attempts are retained.
              </p>
            </>
          ),
        },
        {
          heading: 'When verification is required',
          body: (
            <p>
              Verification may be required before a withdrawal is processed, and may be requested
              at any time where activity or risk indicators warrant it. {plan.payout.sentence} A
              request awaiting verification will take longer, and we will tell you what is
              outstanding.
            </p>
          ),
        },
        {
          heading: 'Ongoing monitoring',
          body: (
            <>
              <p>We monitor for patterns that commonly indicate abuse, including:</p>
              <ul>
                <li>Deposits and withdrawals inconsistent with a member&apos;s stated profile.</li>
                <li>Attempts to operate multiple accounts, or to register on another person&apos;s behalf.</li>
                <li>Rapid movement of funds in and out without a corresponding economic purpose.</li>
                <li>Payout addresses shared across otherwise unrelated accounts.</li>
              </ul>
            </>
          ),
        },
        {
          heading: 'Restricted persons and jurisdictions',
          body: (
            <p>
              We do not accept members who are subject to applicable sanctions, and we may decline
              or restrict service where local law prohibits it or where we cannot satisfy our
              obligations. Members must not use the platform where doing so would breach the law
              that applies to them.
            </p>
          ),
        },
        {
          heading: 'Reporting and record keeping',
          body: (
            <p>
              Where we are required to report suspicious activity, we will do so. Law may prevent
              us from telling you that a report has been made. Identity records, transaction
              history and the reasoning behind compliance decisions are retained for the period
              required by law — typically five years from the closure of an account.
            </p>
          ),
        },
        {
          heading: 'Consequences',
          body: (
            <p>
              Where verification fails, is refused, or where we reasonably suspect financial
              crime, we may suspend account activity, decline a withdrawal, or close the account.
              We take these steps only where we have grounds, and the reason is recorded. If you
              believe a decision about your account is wrong,{' '}
              <Link href="/contact">tell us</Link> — a person will review it.
            </p>
          ),
        },
      ]}
    />
  );
}
