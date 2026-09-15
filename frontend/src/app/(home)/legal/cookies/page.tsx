import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/home/legal-page';

export const metadata: Metadata = {
  title: 'Cookie policy',
  description:
    'This platform sets no cookies. What it stores in your browser instead, why, and how to clear it.',
};

/**
 * Written from an audit of what the application actually does, not from a
 * template: the backend sets no cookies, there is no analytics or tag manager,
 * and the only browser storage is the five localStorage keys listed below.
 * If any of that changes, this document has to change with it.
 */
export default function CookiePolicyPage() {
  return (
    <LegalPage
      current="/legal/cookies"
      updated="23 August 2026"
      title="Cookie policy"
      summary="The short version: this platform does not set cookies. This explains what it stores in your browser instead, and why there is no consent banner."
      sections={[
        {
          heading: 'We do not use cookies',
          body: (
            <>
              <p>
                This platform sets no cookies of its own — not for sessions, not for preferences and
                not for analytics. Nothing about your visit is written to a cookie by us.
              </p>
              <p>
                We also run no advertising pixels, no tag manager and no third-party analytics.
                There is no Google Analytics, no Meta pixel and no session-recording tool on this
                site. Nobody is being sold your browsing behaviour, because we are not collecting it.
              </p>
            </>
          ),
        },
        {
          heading: 'What we store instead',
          body: (
            <>
              <p>
                Signing in requires the browser to remember something, so the platform uses
                <strong> local storage</strong> rather than cookies. Local storage differs from a
                cookie in one way that matters: it is never transmitted automatically with requests.
                It stays in your browser until it is read deliberately or cleared.
              </p>
              <ul>
                <li><strong>fx_access</strong> — your short-lived access token, which authorises requests while you are signed in.</li>
                <li><strong>fx_refresh</strong> — a longer-lived token used to renew the above without making you sign in again.</li>
                <li><strong>fx_admin_refresh</strong> — the equivalent for an operator signed into the admin console.</li>
                <li><strong>app-theme</strong> — whether you chose the light or dark theme, so it is applied before the first paint.</li>
                <li><strong>fx_support_view</strong> — set only when an operator is viewing an account through the support desk, so the interface can say so plainly.</li>
              </ul>
              <p>
                That is the complete list. All five are strictly necessary for the platform to
                function or to honour a preference you set yourself.
              </p>
            </>
          ),
        },
        {
          heading: 'Why there is no consent banner',
          body: (
            <>
              <p>
                Consent requirements under the ePrivacy Directive and similar regimes apply to
                storage that is not strictly necessary — chiefly tracking and advertising. We do
                none of that, and the five items above are either required to sign you in or are a
                setting you chose. There is nothing to ask permission for.
              </p>
              <p>
                If that ever changes — if we add analytics, or anything that profiles visitors — we
                will ask first, and this page will say so before it happens rather than after.
              </p>
            </>
          ),
        },
        {
          heading: 'Third-party services',
          body: (
            <>
              <p>
                Fonts are self-hosted and served from our own domain, so loading a page does not
                make a request to a font provider. Page assets are served from our own
                infrastructure and our content delivery network, which may process your IP address
                in order to deliver the page and to absorb malicious traffic. That is a network
                function rather than tracking, and it does not build a profile of you.
              </p>
              <p>
                Deposits and withdrawals settle on a public blockchain. Transactions there are
                permanently public by design, and that is outside the control of this website —
                see the <Link href="/legal/privacy">privacy policy</Link> for what that means.
              </p>
            </>
          ),
        },
        {
          heading: 'Clearing what is stored',
          body: (
            <>
              <p>
                Signing out removes your tokens from this browser and ends the session on our
                servers, so a copy of the token elsewhere stops working too.
              </p>
              <p>
                You can also clear site data for this domain from your browser settings at any
                time. Doing so signs you out and resets your theme preference; it affects nothing
                about your account, your balances or your ledger, all of which live on the server.
              </p>
              <p>
                Blocking local storage entirely is possible in most browsers, but the platform
                cannot keep you signed in without it.
              </p>
            </>
          ),
        },
        {
          heading: 'Changes to this policy',
          body: (
            <p>
              This document describes the platform as it is built today. If we introduce anything
              that stores or reads data in your browser beyond the list above, we will update this
              page and the date on it. Questions can go to{' '}
              <Link href="/contact">our team</Link>.
            </p>
          ),
        },
      ]}
    />
  );
}
