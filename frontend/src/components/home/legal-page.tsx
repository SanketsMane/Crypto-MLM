import Link from 'next/link';
import type { ReactNode } from 'react';
import { Container } from './sections';
import { PageHero } from './page-hero';

export interface LegalSection { heading: string; body: ReactNode }

export const LEGAL_DOCS = [
  { href: '/legal/terms', label: 'Terms of service' },
  { href: '/legal/privacy', label: 'Privacy policy' },
  { href: '/legal/cookies', label: 'Cookie policy' },
  { href: '/legal/risk-disclosure', label: 'Risk disclosure' },
  { href: '/legal/aml-kyc', label: 'AML & KYC policy' },
];

/**
 * Shell for the policy documents, in the home design.
 *
 * Same prop shape as the previous `LegalDoc` deliberately: the documents are
 * the legal text and must not be retyped to change their presentation, so the
 * pages hand over identical `sections` and only the shell around them differs.
 *
 * Numbered sections with a sticky contents list, because these get read by
 * someone hunting one clause rather than start to finish.
 */
export function LegalPage({
  title, summary, updated, sections, current,
}: {
  title: string; summary: string; updated: string;
  sections: LegalSection[]; current: string;
}) {
  const slug = (h: string) =>
    h.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  return (
    <main>
      <PageHero crumb="Legal" title={title} lead={summary} />

      <section className="py-16 sm:py-20">
        <Container>
          <div className="grid gap-12 lg:grid-cols-12 lg:gap-14">
            {/* ── contents ── */}
            <nav aria-label="Document contents" className="lg:col-span-4">
              <div className="lg:sticky lg:top-28">
                <p className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-[var(--home-gold)]">
                  Contents
                </p>
                <ol className="mt-4 space-y-2">
                  {sections.map((s, i) => (
                    <li key={s.heading}>
                      <a href={`#${slug(s.heading)}`}
                         className="flex gap-2.5 text-[13.5px] leading-relaxed text-[var(--home-text-2)] transition hover:text-[var(--home-gold)]">
                        <span className="tabular-nums text-[var(--home-text-3)]">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        {s.heading}
                      </a>
                    </li>
                  ))}
                </ol>

                <div className="mt-8 border-t border-[var(--home-line)] pt-6">
                  <p className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-[var(--home-text-3)]">
                    Other documents
                  </p>
                  <ul className="mt-4 space-y-2">
                    {LEGAL_DOCS.filter((d) => d.href !== current).map((d) => (
                      <li key={d.href}>
                        <Link href={d.href}
                              className="text-[13.5px] text-[var(--home-text-2)] transition hover:text-[var(--home-gold)]">
                          {d.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>

                <p className="mt-8 text-[12px] text-[var(--home-text-3)]">Last updated {updated}</p>
              </div>
            </nav>

            {/* ── body ── */}
            <div className="lg:col-span-8">
              <div className="space-y-10">
                {sections.map((s, i) => (
                  <section key={s.heading} id={slug(s.heading)} className="scroll-mt-28">
                    <h2 className="flex gap-3 text-[19px] font-bold tracking-[-0.02em] text-[var(--home-text)]">
                      <span className="tabular-nums text-[var(--home-gold)]/60">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      {s.heading}
                    </h2>
                    <div className="mt-3 space-y-3 pl-0 text-[14px] leading-[1.85] text-[var(--home-text-2)] sm:pl-9 [&_a]:text-[var(--home-gold)] [&_a]:underline [&_a]:underline-offset-2 [&_li]:mt-1.5 [&_strong]:font-semibold [&_strong]:text-[var(--home-text)] [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
                      {s.body}
                    </div>
                  </section>
                ))}
              </div>

              <p className="mt-12 rounded-2xl border border-[var(--home-line)] bg-[var(--home-surface)] px-5 py-4 text-[12.5px] leading-[1.75] text-[var(--home-text-2)]">
                This document is provided for information and does not constitute legal, tax or
                investment advice. Where a translated version differs from the English text, the
                English text applies. Questions about anything here can go to{' '}
                <Link href="/contact" className="text-[var(--home-gold)] underline underline-offset-2">our team</Link>.
              </p>
            </div>
          </div>
        </Container>
      </section>
    </main>
  );
}
