'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Reveal } from './motion';

/* The badges that drift around the headline. Positions are percentages so they
   stay put relative to the artwork at any width, and each gets its own float
   duration/delay — synchronised bobbing looks mechanical. */
const COINS = [
  { src: '/home/icon/ethereum5050.png', top: '12%', left: '6%',  size: 58, dur: '5.4s', delay: '0s' },
  { src: '/home/icon/ethereum5051.png', top: '58%', left: '9%',  size: 68, dur: '6.2s', delay: '0.8s' },
  { src: '/home/icon/ethereum5052.png', top: '70%', left: '88%', size: 56, dur: '5.8s', delay: '1.6s' },
  { src: '/home/icon/ethereum5053.png', top: '14%', left: '89%', size: 60, dur: '6.6s', delay: '0.4s' },
];

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      {/* circuit-board artwork, with a scrim so the copy never fights it */}
      <Image src="/home/herobanner.png" alt="" aria-hidden fill priority sizes="100vw"
             className="-z-20 object-cover object-center" />
      <div aria-hidden
           className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_45%,rgba(0,0,0,0.55)_0%,rgba(0,0,0,0.82)_52%,#000_100%)]" />
      <div aria-hidden
           className="home-glow pointer-events-none absolute left-1/2 top-1/3 -z-10 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-[var(--home-gold)]/12 blur-[110px]" />

      {COINS.map((c) => (
        <span key={c.src} aria-hidden
              className="home-float pointer-events-none absolute hidden lg:block"
              style={{ top: c.top, left: c.left, width: c.size, height: c.size,
                       ['--float-duration' as string]: c.dur, animationDelay: c.delay }}>
          <Image src={c.src} alt="" fill sizes="80px" className="object-contain drop-shadow-[0_10px_24px_rgba(0,0,0,0.55)]" />
        </span>
      ))}

      <div className="mx-auto max-w-[1320px] px-4 py-24 text-center sm:px-6 sm:py-28 lg:py-32">
        <Reveal from="down">
          <span className="inline-flex items-center rounded-full border border-white/12 bg-white/[0.06] px-6 py-3 text-[14px] font-medium text-white backdrop-blur-sm sm:text-[15px]">
            Unlocking Smarter Trading with Transparency, Technology &amp; Trust.
          </span>
        </Reveal>

        <Reveal delay={120}>
          <h1 className="mx-auto mt-7 max-w-[22ch] text-[40px] font-bold leading-[1.08] tracking-[-0.02em] text-[var(--home-display)] sm:text-[56px] lg:text-[68px]">
            Smarter trading powered by transparency and innovation
          </h1>
        </Reveal>

        <Reveal delay={220}>
          <p className="mx-auto mt-6 max-w-[70ch] text-[14.5px] leading-[1.75] text-[var(--home-text-2)] sm:text-[15.5px]">
            Welcome to FortuneX — a global trading ecosystem built on transparency, technology and
            trust. We empower individuals and businesses with smarter forex solutions, AI-driven
            insights and sustainable growth opportunities.
          </p>
        </Reveal>

        <Reveal delay={320}>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
            <Link href="/login"
                  className="group inline-flex items-center gap-2.5 rounded-xl bg-[var(--home-gold)] px-8 py-4 text-[15px] font-semibold text-black shadow-[0_16px_38px_-16px_rgba(212,175,55,0.8)] transition hover:bg-[var(--home-gold-hi)] hover:shadow-[0_20px_46px_-16px_rgba(212,175,55,0.95)]">
              Login
              <ArrowRight size={16} strokeWidth={2.6} aria-hidden
                          className="transition-transform group-hover:translate-x-1" />
            </Link>
            <Link href="/register"
                  className="group inline-flex items-center gap-3 rounded-xl border border-white/25 px-8 py-4 text-[15px] font-semibold text-white transition hover:border-[var(--home-gold)] hover:text-[var(--home-gold)]">
              Sign up
              <span aria-hidden
                    className="h-4 w-4 rounded-[4px] bg-[var(--home-gold)] transition-transform group-hover:rotate-90" />
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* Currency symbols on a skewed orange band, scrolling forever. The track is
   rendered twice so the -50% reset lands on an identical frame. */
const TICKER = ['$', '€', '£', '¥', '₹', '₿', '$', '€', '£', '¥', '₹', '₿'];

export function CurrencyBand() {
  return (
    <div aria-hidden className="home-marquee relative -my-4 select-none overflow-hidden py-6">
      <div className="-rotate-[2.2deg] bg-[linear-gradient(90deg,#E5C158_0%,#D4AF37_45%,#EBD08A_100%)] py-4">
        <div className="home-marquee-track" style={{ ['--marquee-duration' as string]: '34s' }}>
          {[0, 1].map((copy) => (
            <div key={copy} className="flex shrink-0 items-center">
              {TICKER.map((sym, i) => (
                <span key={`${copy}-${i}`} className="flex items-center gap-10 px-10">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-black text-[18px] font-bold text-[var(--home-gold)] ring-2 ring-black/20">
                    {sym}
                  </span>
                  <span className="text-[15px] font-bold uppercase tracking-[0.2em] text-black/75">
                    Forex
                  </span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
