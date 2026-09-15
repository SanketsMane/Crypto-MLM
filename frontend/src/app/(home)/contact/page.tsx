import type { Metadata } from 'next';
import { Clock, Mail, MapPin, ShieldCheck } from 'lucide-react';
import { getPlan } from '@/lib/platform-config.server';
import { PageHero } from '@/components/home/page-hero';
import { Card, Container, Heading } from '@/components/home/sections';
import { Reveal } from '@/components/home/motion';
import { ContactForm } from '@/components/home/contact-form';

export const metadata: Metadata = {
  title: 'Contact | FortuneX',
  description: 'Reach the FortuneX team — support, verification, deposits and withdrawals.',
};

export const revalidate = 60;

export default async function ContactPage() {
  const plan = await getPlan();

  const DETAILS = [
    { Icon: Mail, title: 'Email us', body: 'support@fortunex.com', hint: 'The fastest route for anything account-specific.' },
    { Icon: MapPin, title: 'Where we are', body: 'Business Bay, Dubai', hint: 'Members across more than twenty countries.' },
    { Icon: Clock, title: 'Payout schedule', body: plan.payout.label ?? `${plan.withdraw.slaHours} hours`, hint: `Requests accepted any time. Settled in ${plan.withdraw.network}.` },
  ];

  return (
    <main>
      <PageHero
        crumb="Contact"
        title="Talk to the people who run it"
        lead="Account questions are best raised from inside the platform, where the operator answering can see your ledger. For everything else, this reaches the same team."
      />

      <section className="py-20 sm:py-24">
        <Container>
          <div className="grid gap-10 lg:grid-cols-[1fr_1.25fr] lg:gap-14">
            <Reveal from="left">
              <Heading>Get in touch</Heading>
              <p className="mt-4 text-[14.5px] leading-[1.8] text-[var(--home-text-2)]">
                Tell us what you need and it goes to a named operator, not a shared mailbox.
              </p>

              <ul className="mt-9 space-y-4">
                {DETAILS.map(({ Icon, title, body, hint }) => (
                  <li key={title}>
                    <Card className="flex items-start gap-4 p-5">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--home-gold)]/12 text-[var(--home-gold)] ring-1 ring-[var(--home-gold)]/25">
                        <Icon size={18} strokeWidth={2} aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--home-text-3)]">{title}</h3>
                        <p className="mt-1 text-[16px] font-semibold text-[var(--home-text)]">{body}</p>
                        <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--home-text-2)]">{hint}</p>
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>

              <p className="mt-7 flex items-start gap-2.5 rounded-xl border border-[var(--home-line)] bg-[var(--home-surface)] px-4 py-3.5 text-[12.5px] leading-relaxed text-[var(--home-text-2)]">
                <ShieldCheck size={15} className="mt-px shrink-0 text-[var(--home-gold)]" aria-hidden />
                FortuneX will never ask for your password, a recovery phrase or a one-time code by
                email, chat or phone.
              </p>
            </Reveal>

            <Reveal from="right">
              <ContactForm />
            </Reveal>
          </div>
        </Container>
      </section>
    </main>
  );
}
