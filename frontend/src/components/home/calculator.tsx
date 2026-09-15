'use client';

import { useMemo, useState } from 'react';
import { Container, SectionHead } from './sections';
import { Reveal } from './motion';

const usd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

/**
 * Earnings projection.
 *
 * Counts trading days only — 5 in 7 — so the projection matches what the engine
 * would actually credit. Projecting on 30- and 365-day periods while paying a
 * Monday-to-Friday bonus overstates the yearly figure by roughly a third.
 *
 * Rebuilt structurally:
 * - The background photograph is gone. A section whose whole purpose is a
 *   number should not be competing with a stock image behind it.
 * - The four result tiles were individually bordered boxes inside a bordered
 *   card. They are now rows in one table, which is what a projection is, and
 *   the figures line up in a column you can read down.
 * - The ceiling is stated. The old version projected a yearly figure with no
 *   mention that earnings stop at the cap, which for most amounts on this plan
 *   is reached well inside a year — the single most misleading thing this
 *   section could do.
 */
export function Calculator({
  daily, minimum, packages, ceiling = 250,
}: {
  daily: number;
  minimum: number;
  packages: number[];
  /** Earnings ceiling as a percent of capital. */
  ceiling?: number;
}) {
  const max = packages.length ? Math.max(...packages) : 10_000;
  const [amount, setAmount] = useState(Math.min(1_000, max));

  const { perDay, perMonth, perYear, capTotal, daysToCap } = useMemo(() => {
    const d = (amount * daily) / 100;
    const TRADING_DAYS_PER_YEAR = 261;              // 52 weeks × 5, less a couple
    const cap = (amount * ceiling) / 100;
    return {
      perDay: d,
      perMonth: d * (TRADING_DAYS_PER_YEAR / 12),
      perYear: d * TRADING_DAYS_PER_YEAR,
      capTotal: cap,
      daysToCap: d > 0 ? Math.ceil(cap / d) : null,
    };
  }, [amount, daily, ceiling]);

  return (
    <section className="border-y border-[var(--home-line)] bg-[var(--home-surface)] py-16 sm:py-20">
      <Container>
        <Reveal>
          <SectionHead
            eyebrow="Projection"
            title="Work out the return before you commit"
            lead="Trading days only, at the published rate. This is arithmetic on the plan as configured, not a forecast."
          />
        </Reveal>

        <Reveal delay={90}>
          <div className="mt-10 grid overflow-hidden rounded-[5px] border border-[var(--home-line)] bg-[var(--home-bg)] lg:grid-cols-2">
            {/* ── input ── */}
            <div className="border-b border-[var(--home-line)] p-7 lg:border-b-0 lg:border-r">
              <label htmlFor="home-amount" className="block text-[10.5px] font-semibold uppercase tracking-[0.11em] text-[var(--home-text-3)]">
                Capital committed
              </label>
              <p className="mt-3 tabular-nums text-[40px] font-bold leading-none tracking-[-0.03em] text-[var(--home-text)]">
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
                className="mt-7 w-full accent-[var(--home-gold)]"
              />
              <div className="mt-2 flex justify-between tabular-nums text-[11.5px] text-[var(--home-text-3)]">
                <span>{usd(minimum)}</span>
                <span>{usd(max)}</span>
              </div>

              <dl className="mt-8 divide-y divide-[var(--home-line)] border-t border-[var(--home-line)]">
                <div className="flex items-center justify-between py-2.5">
                  <dt className="text-[12.5px] text-[var(--home-text-2)]">Daily rate</dt>
                  <dd className="tabular-nums text-[13px] font-semibold text-[var(--home-gold)]">{daily}%</dd>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <dt className="text-[12.5px] text-[var(--home-text-2)]">Trading days</dt>
                  <dd className="text-[13px] font-semibold text-[var(--home-text)]">Mon–Fri</dd>
                </div>
              </dl>
            </div>

            {/* ── projection ── */}
            <div className="flex flex-col p-7">
              <span className="block text-[10.5px] font-semibold uppercase tracking-[0.11em] text-[var(--home-text-3)]">
                Projected accrual
              </span>

              <dl className="mt-4 divide-y divide-[var(--home-line)] border-y border-[var(--home-line)]">
                {[
                  { k: 'Per trading day', v: perDay },
                  { k: 'Per month', v: perMonth },
                  { k: 'Per year', v: perYear },
                ].map((row) => (
                  <div key={row.k} className="flex items-center justify-between gap-4 py-3">
                    <dt className="text-[13px] text-[var(--home-text-2)]">{row.k}</dt>
                    <dd className="tabular-nums text-[17px] font-semibold text-[var(--home-text)]">{usd(row.v)}</dd>
                  </div>
                ))}
              </dl>

              {/* The limit, stated next to the projection rather than omitted.
                  On this plan the ceiling is reached inside a year at most
                  amounts, so a yearly figure shown alone overstates it. */}
              <div className="mt-5 rounded-[4px] border border-[var(--home-line)] bg-[var(--home-surface)] px-4 py-3.5">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[12.5px] font-semibold text-[var(--home-text)]">
                    Earnings ceiling · {ceiling}%
                  </span>
                  <span className="tabular-nums text-[15px] font-semibold text-[var(--home-gold)]">{usd(capTotal)}</span>
                </div>
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--home-text-2)]">
                  {daysToCap !== null ? (
                    <>
                      Accrual stops here — about{' '}
                      <span className="tabular-nums text-[var(--home-text)]">{daysToCap.toLocaleString('en-US')}</span>{' '}
                      trading days at this rate, across every income stream combined.
                    </>
                  ) : (
                    <>Accrual stops at the ceiling, across every income stream combined.</>
                  )}
                </p>
              </div>

              <p className="mt-4 text-[11px] leading-relaxed text-[var(--home-text-3)]">
                Before the withdrawal fee. Trading carries risk, including loss of capital — this is
                the plan as configured, not a guarantee of return.
              </p>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
