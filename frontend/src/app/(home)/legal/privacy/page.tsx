import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/home/legal-page';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description: 'What personal data FortuneX collects, why it is held, how long it is kept and the rights you have over it.',
};

export default function PrivacyPage() {
  return (
    <LegalPage
      current="/legal/privacy"
      updated="21 August 2026"
      title="Privacy policy"
      summary="What we collect, why we hold it, how long we keep it, and what you can ask us to do with it."
      sections={[
        {
          heading: 'What we collect',
          body: (
            <>
              <ul>
                <li><strong>Account data</strong> — name, email address, phone number and the password hash. We never store your password itself.</li>
                <li><strong>Verification data</strong> — identity documents, a selfie, document number, country of issue and date of birth, where you submit them.</li>
                <li><strong>Financial data</strong> — deposits, positions, earnings, commissions, withdrawals and the payout address you supply.</li>
                <li><strong>Network data</strong> — who introduced you and who you introduce, because the compensation plan is calculated from it.</li>
                <li><strong>Technical data</strong> — IP address, browser user-agent and session records, used for security and fraud prevention.</li>
                <li><strong>Correspondence</strong> — support tickets and messages sent through our contact form.</li>
              </ul>
            </>
          ),
        },
        {
          heading: 'Why we hold it',
          body: (
            <ul>
              <li>To operate your account and calculate what the plan owes you.</li>
              <li>To meet anti-money-laundering and counter-terrorist-financing obligations.</li>
              <li>To detect and prevent fraud, and to secure accounts against unauthorised access.</li>
              <li>To answer your support enquiries.</li>
              <li>To keep the audit and ledger records that make our figures reconstructable.</li>
            </ul>
          ),
        },
        {
          heading: 'How identity documents are handled',
          body: (
            <p>
              Verification documents are stored outside any publicly reachable path and are never
              given a public URL. They can be retrieved only through an authenticated request by
              an operator holding the compliance capability, and every decision records the
              reviewer who made it. Documents are not used for marketing and are not shared with
              other members.
            </p>
          ),
        },
        {
          heading: 'Who we share it with',
          body: (
            <>
              <p>We do not sell personal data. We share it only:</p>
              <ul>
                <li>With service providers who operate the platform on our behalf — hosting, email delivery and, where used, identity-verification providers — bound to process it only on our instructions.</li>
                <li>Where required by law, regulation, or a valid request from a competent authority.</li>
                <li>Where necessary to establish, exercise or defend legal claims.</li>
              </ul>
              <p>
                Blockchain transactions are inherently public. An address you supply, and transfers
                to it, are visible on the network and outside our control.
              </p>
            </>
          ),
        },
        {
          heading: 'How long we keep it',
          body: (
            <p>
              Account, transaction and verification records are retained for the life of the
              account and afterwards for the period required by anti-money-laundering law —
              typically five years from closure. Ledger and audit records are append-only by
              design and are not deleted, because they are what makes historical figures
              reconstructable.
            </p>
          ),
        },
        {
          heading: 'Your rights',
          body: (
            <>
              <p>Subject to local law, you may ask us to:</p>
              <ul>
                <li>Confirm what we hold about you and provide a copy.</li>
                <li>Correct data that is inaccurate or incomplete.</li>
                <li>Delete data we no longer have a lawful basis to keep — note that records we must retain by law, and ledger entries, cannot be erased on request.</li>
                <li>Restrict or object to certain processing.</li>
              </ul>
              <p>
                Ask through <Link href="/contact">our contact form</Link> or the in-platform
                support desk. We may need to verify your identity before acting on a request.
              </p>
            </>
          ),
        },
        {
          heading: 'Security',
          body: (
            <p>
              Passwords are hashed, sessions are individually revocable, and administrative access
              is granted per capability rather than per job title. Every action an operator takes
              against an account is recorded in an append-only audit log. No system is perfectly
              secure, and you play a part: use a unique password, and treat any message asking for
              your credentials as fraudulent.
            </p>
          ),
        },
        {
          heading: 'Cookies',
          body: (
            <p>
              We use only what the platform needs to function — a session token to keep you signed
              in and your interface preferences, such as your chosen theme. We do not use
              advertising cookies or sell behavioural data to third parties.
            </p>
          ),
        },
      ]}
    />
  );
}
