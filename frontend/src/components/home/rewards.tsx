'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Container, SectionHead } from './sections';
import { Figure, Reveal } from './motion';

interface Reward {
  title: string;
  primary: string;
  secondary: string;
  /** Legacy PNG path. No longer rendered — see the note on the table below. */
  icon?: string;
}

/**
 * The income streams, as a published rate table.
 *
 * Was four cards, each centred under an 88px circle holding a decorative PNG.
 * The circles were the largest element in each card and carried no
 * information, and four centred columns made the rates impossible to compare —
 * which is the one thing a visitor is here to do.
 *
 * A table puts the rates in a single column you can read down. It is also what
 * this content actually IS: a rate card. Every serious broker publishes one,
 * and none of them draw it as four floating tiles.
 *
 * Collapses to stacked rows below `sm`, where four columns would not fit.
 */
export function Rewards({ rewards }: { rewards: Reward[] }) {
  return (
    <section id="rewards" className="fx-glow py-16 sm:py-20">
      <Container>
        <Reveal>
          <SectionHead
            eyebrow="Maximise your profits"
            title="Four income streams, one rate card"
            lead="Each stream pays on its own terms and all of them are consumed by the same earnings ceiling. Nothing here is introductory."
          />
        </Reveal>

        <Reveal delay={90}>
          <div className="mt-12 overflow-hidden rounded-[5px] border border-[var(--home-line)]">
            {/* Header row. Hidden on mobile, where each row becomes its own
                labelled block rather than a cell in a grid. */}
            <div className="hidden grid-cols-[1.4fr_0.9fr_1.5fr] items-center gap-4 border-b border-[var(--home-line)] bg-[var(--home-raised)] px-5 py-2.5 sm:grid">
              {['Stream', 'Rate', 'Terms'].map((h) => (
                <span key={h} className="text-[10px] font-semibold uppercase tracking-[0.11em] text-[var(--home-text-3)]">
                  {h}
                </span>
              ))}
            </div>

            <ul className="divide-y divide-[var(--home-line)]">
              {rewards.map((r) => (
                <li key={r.title}
                    className="grid gap-1.5 bg-[var(--home-surface)] px-5 py-4 transition-colors hover:bg-[var(--home-raised)] sm:grid-cols-[1.4fr_0.9fr_1.5fr] sm:items-center sm:gap-4">
                  <span className="text-[14.5px] font-semibold text-[var(--home-text)]">{r.title}</span>
                  <span className="tabular-nums text-[19px] font-bold leading-none tracking-[-0.02em] text-[var(--home-gold)]">
                    <Figure value={r.primary} />
                  </span>
                  <span className="text-[13px] leading-[1.6] text-[var(--home-text-2)]">{r.secondary}</span>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--home-line)] bg-[var(--home-raised)] px-5 py-3.5">
              <p className="text-[12.5px] text-[var(--home-text-3)]">
                All streams count against the published earnings ceiling.
              </p>
              <Link href="/plans"
                    className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--home-gold)] transition-all hover:gap-2.5">
                Full plan and qualifications <ArrowRight size={13} strokeWidth={2.4} aria-hidden />
              </Link>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

interface Solution { title: string; body: string; figure: string; caption: string }

/**
 * Three claims, each with the figure that makes it checkable.
 *
 * Structurally the figure has moved to the top. It used to sit in a footer
 * under the body copy, which made three cards that all opened with a
 * paragraph — nothing to scan. Leading on the number gives the row an anchor
 * and the claim something to attach to.
 */
export function OneStop({ solutions }: { solutions: Solution[] }) {
  return (
    <section id="about" className="py-16 sm:py-20">
      <Container>
        <Reveal>
          <SectionHead
            eyebrow="One-stop solution"
            title="Three claims you can check yourself"
            lead="A value that cannot be verified is decoration. Each of these points at something stated elsewhere on this site in the same terms the software applies it."
          />
        </Reveal>

        <div className="mt-12 grid gap-px overflow-hidden rounded-[5px] border border-[var(--home-line)] bg-[var(--home-line)] lg:grid-cols-3">
          {solutions.map((s, i) => (
            <Reveal key={s.title} delay={i * 110} className="h-full">
              <div className="fx-cell flex h-full flex-col bg-[var(--home-surface)] p-7">
                <p className="tabular-nums text-[38px] font-bold leading-none tracking-[-0.03em] text-[var(--home-text)]">
                  <Figure value={s.figure} />
                </p>
                <p className="mt-2.5 text-[10.5px] font-semibold uppercase tracking-[0.11em] text-[var(--home-gold)]">
                  {s.caption}
                </p>
                <h3 className="mt-6 text-[16px] font-bold text-[var(--home-text)]">{s.title}</h3>
                <p className="mt-2.5 text-[13px] leading-[1.75] text-[var(--home-text-2)]">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
