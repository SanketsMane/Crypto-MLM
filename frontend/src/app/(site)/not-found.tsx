import Link from 'next/link';
import { ArrowRight, Home } from 'lucide-react';
import { Container, Eyebrow, Heading, Lead } from '@/components/site/primitives';

const SUGGESTIONS = [
  { href: '/plans', label: 'Investment plans', note: 'The ten tiers and their terms' },
  { href: '/how-it-works', label: 'How it works', note: 'From deposit to settlement' },
  { href: '/faq', label: 'Help centre', note: 'The questions we are asked most' },
  { href: '/contact', label: 'Contact us', note: 'Talk to a person' },
];

export default function NotFound() {
  return (
    <section className="relative isolate overflow-hidden">
      <div aria-hidden
           className="pointer-events-none absolute -top-32 left-1/2 h-[420px] w-[760px] -translate-x-1/2 rounded-full bg-brand-gold/[0.07] blur-[110px]" />
      <Container className="py-20 sm:py-28 lg:py-32">
        <div className="mx-auto max-w-[640px] text-center">
          <Eyebrow className="justify-center">Error 404</Eyebrow>
          <Heading level={1} size="xl" className="mt-4">This page does not exist</Heading>
          <Lead className="mx-auto mt-5 max-w-[46ch]">
            The link may be out of date, or the address mistyped. Nothing has gone wrong with your
            account — here is where most people are heading.
          </Lead>

          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link href="/"
                  className="inline-flex items-center gap-2 rounded-[11px] bg-gold px-6 py-3.5 text-[14px] font-semibold text-gold-on transition hover:brightness-110">
              <Home size={15} strokeWidth={2.4} /> Back to home
            </Link>
            <Link href="/login"
                  className="inline-flex items-center gap-2 rounded-[11px] border border-white/16 px-6 py-3.5 text-[14px] font-medium text-white transition hover:border-white/32 hover:bg-white/[0.04]">
              Sign in to your account
            </Link>
          </div>
        </div>

        <ul className="mx-auto mt-14 grid max-w-[760px] gap-3 sm:grid-cols-2">
          {SUGGESTIONS.map((s) => (
            <li key={s.href}>
              <Link href={s.href}
                    className="group flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-navy-card/60 px-5 py-4 transition hover:border-brand-gold/25 hover:bg-navy-card">
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] font-medium text-white">{s.label}</span>
                  <span className="block text-[12.5px] text-white/50">{s.note}</span>
                </span>
                <ArrowRight size={15} className="shrink-0 text-white/55 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-gold" />
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
