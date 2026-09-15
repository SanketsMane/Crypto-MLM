'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Plus } from 'lucide-react';
import { Container, Heading } from './sections';
import { Reveal } from './motion';

export interface QA { q: string; a: string }

const FAQS: QA[] = [
  { q: 'What is FortuneX and how does it work?',
    a: 'FortuneX is a global forex trading platform where members commit capital to a tier and earn a published daily trade bonus on trading days, alongside an affiliate structure that pays on the network they build.' },
  { q: 'Which currencies and assets does FortuneX support?',
    a: 'Deposits and withdrawals settle in USDT on BEP-20. That is the single network we support, deliberately — one chain means one set of addresses, one fee model and no bridge risk.' },
  { q: 'How can I deposit and withdraw funds?',
    a: 'Deposits are made from your own crypto wallet. Withdrawal requests are reviewed against the published service level and paid to the payout address on your account.' },
  { q: 'Is FortuneX secure?',
    a: 'Balances are never written directly — every movement of value is an append-only ledger entry. Operator actions are audited with who, what, when and from where, and the log has no delete path.' },
  { q: 'How do the rewards work?',
    a: 'Four streams: the daily trade bonus on your own capital, a direct sponsor bonus on referrals, a generation bonus reaching thirty levels, and executive ranks with one-off rewards. All are capped by the published earnings ceiling.' },
  { q: 'Does FortuneX have a mobile app?',
    a: 'Not yet. The platform is built mobile-first and works in any browser; a native app is on the roadmap rather than available today.' },
];

/** Accordion. One panel open at a time, animated on grid-template-rows so it
 *  transitions to its own content height without a measured pixel value. */
export function Faq({ items = FAQS, heading = 'FAQs', lead = 'Quick answers on trading, deposits, withdrawals and security.', aside = true }: {
  items?: QA[]; heading?: string; lead?: string; aside?: boolean;
} = {}) {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="py-20 sm:py-24">
      <Container>
        <div className={aside ? 'grid items-start gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16' : 'mx-auto max-w-[860px]'}>
          <Reveal from="left">
            <Heading>{heading}</Heading>
            <p className="mt-4 text-[14.5px] leading-[1.8] text-[var(--home-text-2)]">
              {lead}
            </p>
            {/* Framed at the artwork's own 1341×1155 ratio. The box was square,
                which under `object-cover` cropped both sides off this image. */}
            <div className="relative mt-9 hidden aspect-[1341/1155] overflow-hidden rounded-[5px] border border-[var(--home-line)] lg:block">
              <Image src="/home/faq-thumb.png" alt="" aria-hidden fill sizes="480px" className="object-cover" />
            </div>
            <p className="mt-7 text-[13.5px] text-[var(--home-text-2)]">
              Can&rsquo;t see your question?{' '}
              <Link href="/contact" className="font-semibold text-[var(--home-gold)] hover:underline">
                Visit our help centre
              </Link>
            </p>
          </Reveal>

          <div className="space-y-3">
            {items.map((f, i) => {
              const isOpen = open === i;
              return (
                <Reveal key={f.q} delay={i * 70}>
                  <div className={clsx(
                    'overflow-hidden rounded-2xl border transition-colors duration-300',
                    isOpen ? 'border-[var(--home-line-lit)] bg-[var(--home-surface)]' : 'border-[var(--home-line)] bg-[var(--home-surface)]/60',
                  )}>
                    <h3>
                      <button type="button"
                              onClick={() => setOpen(isOpen ? null : i)}
                              aria-expanded={isOpen}
                              aria-controls={`home-faq-${i}`}
                              className="flex w-full items-center justify-between gap-5 px-6 py-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--home-gold)]">
                        <span className={clsx('text-[15.5px] font-semibold transition-colors',
                          isOpen ? 'text-[var(--home-gold)]' : 'text-[var(--home-text)]')}>
                          {f.q}
                        </span>
                        <span className={clsx(
                          'grid h-8 w-8 shrink-0 place-items-center rounded-full border transition-all duration-300',
                          isOpen
                            ? 'rotate-45 border-[var(--home-gold)] bg-[var(--home-gold)] text-[var(--color-gold-on)]'
                            : 'border-[var(--home-line)] text-[var(--home-text)]',
                        )}>
                          <Plus size={16} strokeWidth={2.4} aria-hidden />
                        </span>
                      </button>
                    </h3>
                    <div id={`home-faq-${i}`}
                         className={clsx('grid transition-all duration-400 ease-out',
                           isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
                      <div className="min-h-0">
                        <p className="px-6 pb-6 text-[13.5px] leading-[1.8] text-[var(--home-text-2)]">{f.a}</p>
                      </div>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </Container>
    </section>
  );
}
