import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Container, Heading } from './primitives';

/** The closing call to action, repeated at the foot of every page. */
export function CtaBand({
  title = 'Start with the plan in front of you',
  lead = 'Open an account, fund it in USDT, and choose a tier. Every rule that governs your earnings is published before you commit a cent.',
}: { title?: string; lead?: string }) {
  return (
    <section className="relative isolate overflow-hidden border-y border-white/[0.07] bg-navy">
      {/* The promotional render that sat here was the previous brand's
            artwork. There is no operator equivalent to swap in, so the panel
            carries one off-centre wash of the accent instead. */}
        <span aria-hidden className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(64%_58%_at_18%_0%,color-mix(in_srgb,var(--color-gold)_12%,transparent),transparent_72%)]" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-navy via-navy/92 to-navy/45" />

      <Container className="py-16 sm:py-20">
        <div className="max-w-[620px]">
          <Heading>{title}</Heading>
          <p className="mt-4 text-[15.5px] leading-[1.7] text-white/62">{lead}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/register"
              className="inline-flex w-full items-center justify-center gap-2 rounded-[11px] bg-gold px-6 py-3.5 text-[14px] font-semibold text-gold-on shadow-[0_10px_30px_-10px_rgba(255,122,26,0.7)] transition hover:brightness-110 sm:w-auto"
            >
              Open your account
              <ArrowRight size={15} strokeWidth={2.5} />
            </Link>
            <Link
              href="/plans"
              className="inline-flex w-full items-center justify-center gap-2 rounded-[11px] border border-white/16 px-6 py-3.5 text-[14px] font-medium text-white transition hover:border-white/32 hover:bg-white/[0.04] sm:w-auto"
            >
              Compare the tiers
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}
