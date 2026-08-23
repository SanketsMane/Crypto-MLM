'use client';

import { useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { ArrowRight } from 'lucide-react';
import { Card, Container, Heading } from './sections';
import { Reveal } from './motion';

interface Stat { k: string; v: string }
interface MarketCard { title: string; badge: string; headline: string; sub: string; stats: Stat[]; cta: string; href: string }

/**
 * The four-tab "Markets" block.
 *
 * Every figure is passed in from `getPlan()` rather than written here. The
 * original hardcodes these, and its numbers have drifted from what the engine
 * actually pays — wiring them to the live config is the point of the rebuild.
 */
export function Markets({ tabs }: { tabs: { label: string; cards: MarketCard[] }[] }) {
  const [active, setActive] = useState(0);
  const current = tabs[active] ?? tabs[0];

  return (
    <section id="markets" className="py-20 sm:py-24">
      <Container>
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <Heading>Markets</Heading>
            <Link href="/rewards"
                  className="group inline-flex items-center gap-2 text-[14px] font-semibold text-[var(--home-gold)] transition hover:gap-3">
              More Market <ArrowRight size={15} strokeWidth={2.6} aria-hidden />
            </Link>
          </div>
        </Reveal>

        <Reveal delay={100}>
          <div role="tablist" aria-label="Markets"
               className="mt-9 flex flex-wrap gap-2 rounded-2xl border border-[var(--home-line)] bg-[var(--home-surface)] p-2">
            {tabs.map((t, i) => (
              <button key={t.label} role="tab" type="button"
                      aria-selected={i === active}
                      onClick={() => setActive(i)}
                      className={clsx(
                        'flex-1 whitespace-nowrap rounded-xl px-5 py-3 text-[14px] font-semibold transition-all duration-300',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--home-gold)]',
                        i === active
                          ? 'bg-[var(--home-gold)] text-black shadow-[0_10px_26px_-12px_rgba(212,175,55,0.85)]'
                          : 'text-[var(--home-text-2)] hover:bg-white/[0.05] hover:text-white',
                      )}>
                {t.label}
              </button>
            ))}
          </div>
        </Reveal>

        {/* keyed on the tab so the cards re-run their reveal on every switch */}
        <div key={active} className="mt-6 grid gap-5 md:grid-cols-2">
          {current.cards.map((c, i) => (
            <Reveal key={c.title} delay={i * 110} from="zoom" className="h-full">
              <Card className="flex h-full flex-col p-7">
                <div className="flex items-start justify-between gap-4">
                  <h3 className="text-[21px] font-bold text-white">{c.title}</h3>
                  <span className="shrink-0 rounded-full border border-[var(--home-gold)]/30 bg-[var(--home-gold)]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--home-gold)]">
                    {c.badge}
                  </span>
                </div>

                <p className="mt-6 text-[44px] font-bold leading-none text-[var(--home-display)]">{c.headline}</p>
                <p className="mt-2 text-[13.5px] text-[var(--home-text-3)]">{c.sub}</p>

                <dl className="mt-7 grid grid-cols-2 gap-3">
                  {c.stats.map((s) => (
                    <div key={s.k} className="rounded-xl border border-white/[0.07] bg-black/40 px-4 py-3">
                      <dt className="text-[11.5px] uppercase tracking-[0.06em] text-[var(--home-text-3)]">{s.k}</dt>
                      <dd className="mt-1 text-[15px] font-semibold text-white">{s.v}</dd>
                    </div>
                  ))}
                </dl>

                <Link href={c.href}
                      className="group/cta mt-auto inline-flex w-fit items-center gap-2 pt-7 text-[13.5px] font-semibold text-[var(--home-gold)] transition-all hover:gap-3">
                  {c.cta} <ArrowRight size={14} strokeWidth={2.6} aria-hidden />
                </Link>
              </Card>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
