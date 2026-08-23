'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Container } from './sections';
import { Reveal } from './motion';

/**
 * Banner for interior pages.
 *
 * Same circuit plate as the home hero but a third of the height, so an
 * interior page opens with the brand without pushing its content under the
 * fold. Carries a breadcrumb, which the home hero has no use for.
 */
export function PageHero({ title, lead, crumb }: { title: string; lead?: string; crumb: string }) {
  return (
    <section className="relative isolate overflow-hidden border-b border-[var(--home-line)]">
      <Image src="/home/herobanner.png" alt="" aria-hidden fill priority sizes="100vw"
             className="-z-20 object-cover object-center" />
      <div aria-hidden
           className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_50%,rgba(0,0,0,0.5)_0%,rgba(0,0,0,0.86)_60%,#000_100%)]" />
      <div aria-hidden
           className="home-glow pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[280px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--home-gold)]/10 blur-[100px]" />

      <Container className="py-16 text-center sm:py-20">
        <Reveal from="down">
          <nav aria-label="Breadcrumb">
            <ol className="flex items-center justify-center gap-1.5 text-[13px] text-[var(--home-text-3)]">
              <li><Link href="/" className="transition hover:text-[var(--home-gold)]">Home</Link></li>
              <li aria-hidden><ChevronRight size={14} /></li>
              <li aria-current="page" className="text-[var(--home-gold)]">{crumb}</li>
            </ol>
          </nav>
        </Reveal>

        <Reveal delay={100}>
          <h1 className="mx-auto mt-4 max-w-[20ch] text-[36px] font-bold leading-[1.1] tracking-[-0.02em] text-[var(--home-display)] sm:text-[50px]">
            {title}
          </h1>
        </Reveal>

        {lead && (
          <Reveal delay={200}>
            <p className="mx-auto mt-5 max-w-[64ch] text-[14.5px] leading-[1.8] text-[var(--home-text-2)]">
              {lead}
            </p>
          </Reveal>
        )}
      </Container>
    </section>
  );
}
