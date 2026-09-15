import type { Metadata } from 'next';
import Link from 'next/link';
import { Clock, LifeBuoy, Mail, MapPin, MessageCircle, ShieldAlert } from 'lucide-react';
import { Container, Panel, Section, SectionHead } from '@/components/site/primitives';
import { PageHero } from '@/components/site/page-hero';
import { ContactForm } from '@/components/site/contact-form';
import { getPlan, planMoney } from '@/lib/platform-config.server';
import { getBranding } from '@/lib/branding.server';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Talk to our team about your account, the compensation plan, or a partnership.',
};

/* Takes the support address rather than closing over a constant — it is an
   operator setting now, read per request. */
const CHANNELS = (supportEmail: string) => [
  {
    Icon: LifeBuoy,
    title: 'Existing members',
    body: 'The support desk inside your account is the fastest route. The operator answering can see your ledger, capping position and network, so answers come back with figures rather than guesses.',
    action: { href: '/login', label: 'Sign in to support' },
  },
  {
    Icon: Mail,
    title: 'Email',
    body: 'For anything that is not account-specific — the plan, partnerships, media or compliance questions.',
    action: { href: `mailto:${supportEmail}`, label: supportEmail },
  },
  {
    Icon: MessageCircle,
    title: 'Community',
    body: 'Announcements and community discussion happen on our channels. We never handle account matters or ask for credentials there.',
    action: { href: 'https://t.me/', label: 'Telegram channel' },
  },
];

export default async function ContactPage() {
  const [plan, brand] = await Promise.all([getPlan(), getBranding()]);

  return (
    <>
      <PageHero
        eyebrow="Contact"
        title="Talk to us"
        lead="Whether you are weighing up the plan or already trading with us, there is a person on the other end of this. Tell us what you need and we will answer with specifics."
      />

      <Section>
        <Container>
          <div className="grid gap-10 lg:grid-cols-12 lg:gap-14">
            {/* ── form ── */}
            <div className="lg:col-span-7">
              <SectionHead
                eyebrow="Send a message"
                title="We reply within one business day"
                className="mb-8"
              />
              <ContactForm />
            </div>

            {/* ── channels and details ── */}
            <div className="space-y-4 lg:col-span-5">
              {CHANNELS(brand.supportEmail).map(({ Icon, title, body, action }) => (
                <Panel key={title} hover className="p-6">
                  <span className="grid h-10 w-10 place-items-center rounded-xl border border-brand-gold/25 bg-brand-gold/10 text-brand-gold">
                    <Icon size={17} strokeWidth={1.9} />
                  </span>
                  <h3 className="mt-4 text-[16px] font-semibold text-white">{title}</h3>
                  <p className="mt-2 text-[13.5px] leading-[1.75] text-white/58">{body}</p>
                  <Link
                    href={action.href}
                    target={action.href.startsWith('http') ? '_blank' : undefined}
                    rel={action.href.startsWith('http') ? 'noreferrer noopener' : undefined}
                    className="mt-3 inline-block text-[13.5px] font-medium text-brand-gold transition hover:underline"
                  >
                    {action.label}
                  </Link>
                </Panel>
              ))}

              <Panel className="p-6">
                <h3 className="text-[16px] font-semibold text-white">Office</h3>
                <ul className="mt-3 space-y-3 text-[13.5px] text-white/60">
                  <li className="flex items-start gap-2.5">
                    <MapPin size={15} className="mt-0.5 shrink-0 text-brand-gold/80" />
                    <span>Business Bay, Dubai<br />United Arab Emirates</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Clock size={15} className="mt-0.5 shrink-0 text-brand-gold/80" />
                    <span>
                      Support is answered every business day.<br />
                      {plan.payout.sentence}
                    </span>
                  </li>
                </ul>
              </Panel>

              {/* the one warning that belongs on a contact page */}
              <div className="flex gap-3 rounded-2xl border border-bad/25 bg-bad/[0.07] p-5">
                <ShieldAlert size={18} className="mt-0.5 shrink-0 text-bad" />
                <div>
                  <h3 className="text-[14.5px] font-semibold text-white">Beware of impersonation</h3>
                  <p className="mt-1.5 text-[12.5px] leading-[1.7] text-white/60">
                    Our staff will never ask for your password, a recovery phrase, a private
                    key or a one-time code — not by email, not on Telegram, not on a call. We will
                    never ask you to send funds to a personal wallet. If someone does, it is not
                    us; report it here.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}
