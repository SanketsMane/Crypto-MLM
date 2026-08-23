'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { Card, Container, Heading } from './sections';
import { Reveal } from './motion';

const usd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

/**
 * Earnings calculator.
 *
 * The original projects on 30- and 365-day months and years while advertising a
 * Monday-to-Friday bonus, which overstates the yearly figure by roughly a third.
 * This counts trading days only — 5 in 7 — so the projection matches what the
 * engine would actually credit.
 */
export function Calculator({ daily, minimum, packages }: { daily: number; minimum: number; packages: number[] }) {
  const max = packages.length ? Math.max(...packages) : 10_000;
  const [amount, setAmount] = useState(Math.min(1_000, max));

  const { perDay, perMonth, perYear } = useMemo(() => {
    const d = (amount * daily) / 100;
    const TRADING_DAYS_PER_YEAR = 261;              // 52 weeks × 5, less a couple
    return { perDay: d, perMonth: d * (TRADING_DAYS_PER_YEAR / 12), perYear: d * TRADING_DAYS_PER_YEAR };
  }, [amount, daily]);

  return (
    <section className="relative isolate overflow-hidden py-20 sm:py-24">
      <Image src="/home/background-bg.jpeg" alt="" aria-hidden fill sizes="100vw"
             className="-z-20 object-cover opacity-40" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-black via-black/75 to-black" />

      <Container>
        <Reveal><Heading className="text-center">Earn Flexibly with FortuneX</Heading></Reveal>

        <Reveal delay={120}>
          <Card className="mx-auto mt-12 max-w-[980px] p-7 sm:p-10">
            <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
              <div>
                <span className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[var(--home-gold)]">
                  Calculate your earnings
                </span>
                <h3 className="mt-3 text-[24px] font-bold text-white">Trading Asset</h3>

                <label htmlFor="home-amount" className="mt-8 block text-[13.5px] text-[var(--home-text-2)]">
                  How much do you invest?
                </label>
                <p className="mt-2 text-[38px] font-bold leading-none text-[var(--home-display)]">
                  {usd(amount)}
                </p>

                <input
                  id="home-amount"
                  type="range"
                  min={minimum}
                  max={max}
                  step={minimum}
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  aria-valuetext={usd(amount)}
                  className="mt-6 w-full accent-[var(--home-gold)]"
                />
                <div className="mt-2 flex justify-between text-[12px] tabular-nums text-[var(--home-text-3)]">
                  <span>{usd(minimum)}</span>
                  <span>{usd(max)}</span>
                </div>
              </div>

              <div className="flex flex-col justify-center gap-3">
                <div className="rounded-xl border border-[var(--home-gold)]/25 bg-[var(--home-gold)]/[0.07] px-5 py-4">
                  <p className="text-[12px] uppercase tracking-[0.08em] text-[var(--home-text-3)]">Estimated daily rate</p>
                  <p className="mt-1 text-[26px] font-bold leading-none text-[var(--home-gold)]">{daily}%</p>
                </div>
                {[
                  { k: 'Daily earnings', v: perDay },
                  { k: 'Monthly earnings', v: perMonth },
                  { k: 'Yearly earnings', v: perYear },
                ].map((row) => (
                  <div key={row.k}
                       className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-black/40 px-5 py-4">
                    <span className="text-[13.5px] text-[var(--home-text-2)]">{row.k}</span>
                    <span className="text-[17px] font-semibold tabular-nums text-white">{usd(row.v)}</span>
                  </div>
                ))}
                <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--home-text-3)]">
                  Projected on trading days only (Monday to Friday), before the published earnings
                  ceiling and withdrawal fee. Not a guarantee of return.
                </p>
              </div>
            </div>
          </Card>
        </Reveal>
      </Container>
    </section>
  );
}
