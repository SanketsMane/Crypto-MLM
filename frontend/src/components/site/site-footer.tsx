import Image from 'next/image';
import Link from 'next/link';
import { Mail, MapPin, MessageCircle, Send } from 'lucide-react';
import { Container } from './primitives';

const COLUMNS: { title: string; links: { href: string; label: string; external?: boolean }[] }[] = [
  {
    title: 'Platform',
    links: [
      { href: '/how-it-works', label: 'How it works' },
      { href: '/plans', label: 'Investment plans' },
      { href: '/rewards', label: 'Rewards & ranks' },
      { href: '/rewards#offers', label: 'Affiliate offers' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/about', label: 'About FortuneX' },
      { href: '/about#security', label: 'Security' },
      { href: '/contact', label: 'Contact us' },
      { href: '/faq', label: 'Help centre' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '/legal/terms', label: 'Terms of service' },
      { href: '/legal/privacy', label: 'Privacy policy' },
      { href: '/legal/risk-disclosure', label: 'Risk disclosure' },
      { href: '/legal/aml-kyc', label: 'AML & KYC policy' },
    ],
  },
];

const SOCIAL = [
  { href: 'https://t.me/', label: 'Telegram', Icon: Send },
  { href: 'https://wa.me/', label: 'WhatsApp', Icon: MessageCircle },
  { href: 'mailto:support@fortunex.com', label: 'Email', Icon: Mail },
];

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-white/[0.07] bg-navy-deep">
      <Container>
        {/* ── main columns ── */}
        <div className="grid gap-10 py-14 sm:py-16 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-4">
            <Link href="/" className="relative block h-9 w-[150px]" aria-label="FortuneX — home">
              <Image src="/brand/Clearlogo.png" alt="FortuneX" fill sizes="150px"
                     className="object-contain object-left mix-blend-screen" />
            </Link>
            <p className="mt-4 max-w-[38ch] text-[13.5px] leading-[1.75] text-white/55">
              A trading and affiliate platform built on a transparent compensation plan — every
              payout traceable to a ledger entry, every rule published rather than implied.
            </p>

            <ul className="mt-5 space-y-2.5 text-[13px] text-white/60">
              <li className="flex items-start gap-2.5">
                <MapPin size={15} className="mt-0.5 shrink-0 text-brand-gold/80" />
                <span>Business Bay, Dubai, United Arab Emirates</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Mail size={15} className="mt-0.5 shrink-0 text-brand-gold/80" />
                <a href="mailto:support@fortunex.com" className="transition hover:text-white">support@fortunex.com</a>
              </li>
            </ul>

            <div className="mt-5 flex gap-2">
              {SOCIAL.map(({ href, label, Icon }) => (
                <a
                  key={label} href={href} aria-label={label}
                  target={href.startsWith('http') ? '_blank' : undefined}
                  rel={href.startsWith('http') ? 'noreferrer noopener' : undefined}
                  className="grid h-9 w-9 place-items-center rounded-[10px] border border-white/10 text-white/60 transition hover:border-brand-gold/40 hover:text-brand-gold"
                >
                  <Icon size={15} />
                </a>
              ))}
            </div>
          </div>

          {COLUMNS.map((col) => (
            <nav key={col.title} className="lg:col-span-2" aria-label={col.title}>
              <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white">{col.title}</h2>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-[13.5px] text-white/55 transition hover:text-brand-gold">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <div className="lg:col-span-2">
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white">Get started</h2>
            <p className="mt-4 text-[13px] leading-relaxed text-white/55">
              Open an account in minutes. Deposits and withdrawals settle in USDT on BEP-20.
            </p>
            <Link
              href="/register"
              className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-[10px] bg-gold px-4 py-2.5 text-[13px] font-semibold text-navy transition hover:brightness-110"
            >
              Open account
            </Link>
          </div>
        </div>

        {/* ── risk disclosure ──────────────────────────────────────────────
            A platform that publishes daily-return figures has to publish the
            other half of the sentence in the same place. This is not fine
            print tucked behind a link. */}
        <div className="rounded-2xl border border-white/[0.07] bg-navy-card/50 px-5 py-4 sm:px-6">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/80">Risk disclosure</h2>
          <p className="mt-2 text-[12.5px] leading-[1.7] text-white/60">
            Trading and digital-asset products carry risk, including the loss of the capital you
            commit. Returns described on this site are the terms of the published compensation
            plan, not a guarantee of profit, and past performance never predicts future results.
            Nothing here is investment, tax or legal advice. Take independent advice and commit
            only what you can afford to lose. Read the full{' '}
            <Link href="/legal/risk-disclosure" className="text-brand-gold/80 underline underline-offset-2 hover:text-brand-gold">
              risk disclosure
            </Link>.
          </p>
        </div>

        {/* ── legal strip ── */}
        <div className="flex flex-col gap-3 border-t border-white/[0.06] py-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12.5px] text-white/58">
            © {year} FortuneX. All rights reserved.
          </p>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {[
              { href: '/legal/terms', label: 'Terms' },
              { href: '/legal/privacy', label: 'Privacy' },
              { href: '/legal/risk-disclosure', label: 'Risk' },
              { href: '/legal/aml-kyc', label: 'AML & KYC' },
            ].map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-[12.5px] text-white/58 transition hover:text-white">{l.label}</Link>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </footer>
  );
}
