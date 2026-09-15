'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { ArrowRight } from 'lucide-react';
import { Container, SectionHead } from './sections';
import { Figure, Reveal } from './motion';

interface Stat { k: string; v: string }
interface MarketCard { title: string; badge: string; headline: string; sub: string; stats: Stat[]; cta: string; href: string }

/**
 * The income-stream detail block.
 *
 * Every figure is passed in from `getPlan()` rather than written here, so this
 * cannot advertise a rate the engine does not pay.
 *
 * Rebuilt structurally. What changed:
 *
 * - The tabs were orange pills in a rounded container with a 26px coloured
 *   glow. A tab bar is navigation, not a call to action, so it is now an
 *   underline rail — the selected tab is marked by a 2px accent rule, which is
 *   the convention every data product uses and the one people already read.
 * - The panels were floating cards with a 44px display figure centred over
 *   boxed stat tiles. The tiles-inside-a-card nesting meant three levels of
 *   border for one number. Now a rule-divided panel: figure and label at the
 *   top, terms as a definition row beneath.
 * - Keyboard support added. It was a `role="tablist"` with no arrow-key
 *   handling, which is a broken contract — a screen reader announces a tablist
 *   and then the arrow keys do nothing.
 */
export function Markets({ tabs }: { tabs: { label: string; cards: MarketCard[] }[] }) {
  const [active, setActive] = useState(0);
  const railRef = useRef<HTMLDivElement>(null);
  const current = tabs[active] ?? tabs[0];

  const focusTab = (i: number) => {
    setActive(i);
    railRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[i]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); focusTab((active - 1 + tabs.length) % tabs.length); }
    if (e.key === 'ArrowRight') { e.preventDefault(); focusTab((active + 1) % tabs.length); }
    if (e.key === 'Home') { e.preventDefault(); focusTab(0); }
    if (e.key === 'End') { e.preventDefault(); focusTab(tabs.length - 1); }
  };

  return (
    <section id="markets" className="fx-glow fx-glow-r py-16 sm:py-20">
      <Container>
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionHead
              eyebrow="Income streams"
              title="What each stream pays, and on what"
              lead="Four ways capital earns here. Every rate below is read from the live configuration, not written into this page."
            />
            <Link href="/rewards"
                  className="inline-flex shrink-0 items-center gap-1.5 pb-1 text-[13px] font-semibold text-[var(--home-gold)] transition-all hover:gap-2.5">
              All rewards <ArrowRight size={14} strokeWidth={2.4} aria-hidden />
            </Link>
          </div>
        </Reveal>

        <Reveal delay={90}>
          <div ref={railRef} role="tablist" aria-label="Income streams" onKeyDown={onKeyDown}
               className="mt-10 flex gap-7 overflow-x-auto border-b border-[var(--home-line)]">
            {tabs.map((t, i) => (
              <button key={t.label} role="tab" type="button"
                      id={`stream-tab-${i}`}
                      aria-selected={i === active}
                      aria-controls={`stream-panel-${i}`}
                      tabIndex={i === active ? 0 : -1}
                      onClick={() => setActive(i)}
                      className={clsx(
                        'relative -mb-px whitespace-nowrap border-b-2 pb-3 text-[13.5px] font-semibold transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--home-gold)]',
                        i === active
                          ? 'border-[var(--home-gold)] text-[var(--home-text)]'
                          : 'border-transparent text-[var(--home-text-3)] hover:text-[var(--home-text)]',
                      )}>
                {t.label}
              </button>
            ))}
          </div>
        </Reveal>

        {/* keyed on the tab so the panels re-run their reveal on every switch */}
        <div key={active}
             id={`stream-panel-${active}`}
             role="tabpanel"
             aria-labelledby={`stream-tab-${active}`}
             className="mt-8 grid gap-5 md:grid-cols-2">
          {current.cards.map((c, i) => (
            <Reveal key={c.title} delay={i * 100} className="h-full">
              <article className="flex h-full flex-col rounded-[5px] border border-[var(--home-line)] bg-[var(--home-surface)] transition-colors hover:border-[var(--home-line-lit)]">
                <header className="flex items-start justify-between gap-4 border-b border-[var(--home-line)] px-6 py-4">
                  <h3 className="text-[16px] font-bold text-[var(--home-text)]">{c.title}</h3>
                  <span className="shrink-0 rounded-[3px] border border-[var(--home-line)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.09em] text-[var(--home-text-3)]">
                    {c.badge}
                  </span>
                </header>

                <div className="px-6 py-5">
                  <p className="tabular-nums text-[38px] font-bold leading-none tracking-[-0.03em] text-[var(--home-gold)]">
                    <Figure value={c.headline} />
                  </p>
                  <p className="mt-2.5 text-[13px] text-[var(--home-text-2)]">{c.sub}</p>
                </div>

                {/* Terms as rows, not boxed tiles. The tiles nested a border
                    inside a border inside a card for a single value each. */}
                <dl className="divide-y divide-[var(--home-line)] border-t border-[var(--home-line)]">
                  {c.stats.map((s) => (
                    <div key={s.k} className="flex items-center justify-between gap-4 px-6 py-2.5">
                      <dt className="text-[12px] text-[var(--home-text-3)]">{s.k}</dt>
                      <dd className="tabular-nums text-[13px] font-semibold text-[var(--home-text)]"><Figure value={s.v} /></dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-auto border-t border-[var(--home-line)] px-6 py-3.5">
                  <Link href={c.href}
                        className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--home-gold)] transition-all hover:gap-2.5">
                    {c.cta} <ArrowRight size={13} strokeWidth={2.4} aria-hidden />
                  </Link>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
