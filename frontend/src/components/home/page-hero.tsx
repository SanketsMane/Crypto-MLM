'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Container } from './sections';
import { Reveal } from './motion';

/**
 * Banner for interior pages.
 *
 * Rebuilt for two reasons.
 *
 * The scrim was `rgba(0,0,0,0.5)` fading to solid `#000`, painted over a dark
 * circuit-board photograph. That is correct on a permanently black page and
 * wrong the moment light mode exists — it put a black plate at the top of a
 * white page, with the breadcrumb and heading fighting it.
 *
 * And it was centred. Every section below it now opens with an aligned header
 * and an eyebrow rule, so a centred banner made the page restart its reading
 * position immediately after the first heading. It shares the spine now.
 *
 * The photograph is gone rather than re-scrimmed. It was doing nothing that
 * the type and the accent rule do not do better, and it cost a full-width
 * image request on every interior page.
 */
export function PageHero({ title, lead, crumb }: { title: string; lead?: string; crumb: string }) {
  return (
    <section className="relative isolate overflow-hidden border-b border-[var(--home-line)] bg-[var(--home-surface)]">
      {/* One off-centre wash, the same light the sections below use, so the
          banner belongs to the page rather than sitting on top of it. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(58%_70%_at_12%_0%,color-mix(in_srgb,var(--home-gold)_11%,transparent),transparent_72%)]"
      />

      <Container className="py-12 sm:py-16">
        <Reveal from="down">
          <nav aria-label="Breadcrumb">
            <ol className="flex items-center gap-1.5 text-[12px] text-[var(--home-text-3)]">
              <li><Link href="/" className="transition-colors hover:text-[var(--home-gold)]">Home</Link></li>
              <li aria-hidden><ChevronRight size={13} /></li>
              <li aria-current="page" className="font-semibold text-[var(--home-gold)]">{crumb}</li>
            </ol>
          </nav>
        </Reveal>

        <Reveal delay={90}>
          <h1 className="mt-4 max-w-[22ch] text-[32px] font-bold leading-[1.08] tracking-[-0.025em] text-[var(--home-text)] sm:text-[44px]">
            {title}
          </h1>
        </Reveal>

        {lead && (
          <Reveal delay={170}>
            <p className="mt-4 max-w-[68ch] text-[14.5px] leading-[1.8] text-[var(--home-text-2)]">
              {lead}
            </p>
          </Reveal>
        )}
      </Container>
    </section>
  );
}
