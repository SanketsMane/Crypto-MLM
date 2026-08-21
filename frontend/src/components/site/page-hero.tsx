import { Container, Eyebrow, Heading, Lead } from './primitives';

/** The standard opening block for an interior page. */
export function PageHero({ eyebrow, title, lead }: { eyebrow: string; title: string; lead?: string }) {
  return (
    <section className="relative isolate overflow-hidden border-b border-white/[0.07] bg-navy">
      {/* a soft gold bloom behind the heading, so interior pages still feel lit */}
      <div aria-hidden
           className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-brand-gold/[0.07] blur-[110px]" />
      <Container className="pb-11 pt-14 sm:pb-14 sm:pt-20 lg:pb-16 lg:pt-24">
        <Eyebrow>{eyebrow}</Eyebrow>
        <Heading level={1} size="xl" className="mt-4 max-w-[880px]">{title}</Heading>
        {lead && <Lead className="mt-5 max-w-[680px]">{lead}</Lead>}
      </Container>
    </section>
  );
}
