'use client';

import Image from 'next/image';
import { Card, Container, Heading } from './sections';
import { Reveal } from './motion';

interface Reward { title: string; primary: string; secondary: string; icon: string }

/** Four reward cards — the plan's income streams, at a glance. */
export function Rewards({ rewards }: { rewards: Reward[] }) {
  return (
    <section id="rewards" className="py-20 sm:py-24">
      <Container>
        <Reveal>
          <span className="block text-center text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[var(--home-gold)]">
            Maximize your profits
          </span>
          <Heading className="mt-3 text-center">FortuneX Rewards</Heading>
        </Reveal>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {rewards.map((r, i) => (
            <Reveal key={r.title} delay={i * 110} className="h-full">
              <Card className="h-full p-7 text-center">
                <span className="mx-auto grid h-[88px] w-[88px] place-items-center rounded-full bg-[var(--home-raised)] transition-transform duration-500 group-hover/card:scale-105">
                  <Image src={r.icon} alt="" aria-hidden width={46} height={46} className="object-contain" />
                </span>
                <h3 className="mt-6 text-[17px] font-bold text-white">{r.title}</h3>
                <p className="mt-4 text-[26px] font-bold leading-none text-[var(--home-gold)]">{r.primary}</p>
                <p className="mt-2.5 text-[13px] text-[var(--home-text-2)]">{r.secondary}</p>
              </Card>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

interface Solution { title: string; body: string; figure: string; caption: string }

/** "One-stop solution" — three claims, each with its headline figure. */
export function OneStop({ solutions }: { solutions: Solution[] }) {
  return (
    <section id="about" className="py-20 sm:py-24">
      <Container>
        <Reveal>
          <Heading className="mx-auto max-w-[24ch] text-center">
            Your One-Stop Solution for Trading with FortuneX
          </Heading>
        </Reveal>

        <div className="mt-14 grid gap-5 lg:grid-cols-3">
          {solutions.map((s, i) => (
            <Reveal key={s.title} delay={i * 130} from="zoom" className="h-full">
              <Card className="flex h-full flex-col p-8">
                <h3 className="text-[19px] font-bold text-white">{s.title}</h3>
                <p className="mt-3 flex-1 text-[13.5px] leading-[1.75] text-[var(--home-text-2)]">{s.body}</p>
                <div className="mt-7 border-t border-white/[0.08] pt-5">
                  <p className="text-[32px] font-bold leading-none text-[var(--home-display)]">{s.figure}</p>
                  <p className="mt-1.5 text-[12.5px] uppercase tracking-[0.06em] text-[var(--home-text-3)]">{s.caption}</p>
                </div>
              </Card>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
