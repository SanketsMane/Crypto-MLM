'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { Figure, Reveal } from './motion';

/**
 * The hero.
 *
 * Rebuilt around the supplied footage. What changed and why:
 *
 * - The old hero was a centred stack over a circuit-board still, with four
 *   crypto badges bobbing on loops around the headline. Bobbing coins are a
 *   consumer-app signal; on a page asking people to commit capital they work
 *   against the thing the copy is claiming.
 * - Left-aligned and editorial instead of centred. A centred stack has no
 *   reading order beyond "big to small"; an aligned column gives eyebrow,
 *   headline, body and actions a spine, which is how every serious financial
 *   site sets a hero.
 * - The plan's real figures sit in the hero itself rather than three sections
 *   down. A broker's credibility is its numbers, and burying them below the
 *   fold to make room for decoration is the wrong trade.
 *
 * The video is decorative: muted, looping, `aria-hidden`, and it never carries
 * information that is not also in the text.
 */

export interface HeroStat { value: string; label: string }

export function Hero({ stats = [] }: { stats?: HeroStat[] }) {
  return (
    <section className="relative isolate overflow-hidden">
      {/*
        Decorative background.

        `playsInline` is not optional — without it iOS takes the video
        fullscreen on play and the page disappears. `preload="metadata"` keeps
        the first paint cheap; the file is several megabytes and nothing here
        depends on it having loaded.
      */}
      <video
        className="absolute inset-0 -z-20 h-full w-full object-cover"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-hidden
        tabIndex={-1}
      >
        <source src="/media/hero.mp4" type="video/mp4" />
      </video>

      {/*
        Two scrims, one per theme, rather than one that splits the difference.

        The footage is the same in both, so legibility has to come from the
        overlay: dark mode washes it to near-black from the left, light mode
        washes it to the page's own canvas. Getting this wrong is how hero
        copy ends up unreadable over whichever frame happens to be playing.
      */}
      <span
        aria-hidden
        className="absolute inset-0 -z-10 bg-[linear-gradient(100deg,var(--home-bg)_0%,color-mix(in_srgb,var(--home-bg)_88%,transparent)_46%,color-mix(in_srgb,var(--home-bg)_52%,transparent)_74%,color-mix(in_srgb,var(--home-bg)_28%,transparent)_100%)]"
      />
      {/* Grounds the bottom edge so the section below does not start on a cut. */}
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 -z-10 h-32 bg-[linear-gradient(to_top,var(--home-bg),transparent)]"
      />

      <div className="mx-auto grid max-w-[1320px] gap-10 px-4 py-24 sm:px-6 sm:py-28 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-center lg:py-32">
        <div className="max-w-[60ch]">
          <Reveal from="down">
            <span className="inline-flex items-center gap-2.5 rounded-[4px] border border-[var(--home-line)] bg-[color-mix(in_srgb,var(--home-surface)_70%,transparent)] px-3 py-1.5 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-[var(--home-text-2)] backdrop-blur-sm">
              <span className="fx-live size-[6px] rounded-full bg-[var(--home-gold)]" />
              Transparency · Technology · Trust
            </span>
          </Reveal>

          <Reveal delay={120}>
            <h1 className="mt-6 text-[38px] font-bold leading-[1.06] tracking-[-0.025em] text-[var(--home-display)] sm:text-[52px] lg:text-[62px]">
              Smarter trading, on a plan published in full
            </h1>
          </Reveal>

          <Reveal delay={220}>
            <p className="mt-5 max-w-[58ch] text-[15px] leading-[1.7] text-[var(--home-text-2)] sm:text-[16px]">
              A global trading ecosystem built on transparency, technology and trust. Every rate,
              ceiling and fee is stated in the same terms the software applies them — so the return
              can be worked out before any capital is committed.
            </p>
          </Reveal>

          <Reveal delay={300}>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/register"
                className="group inline-flex items-center gap-2.5 rounded-[4px] bg-[var(--home-gold)] px-6 py-3.5 text-[14.5px] font-semibold text-[var(--color-gold-on)] transition-colors hover:bg-[var(--home-gold-hi)]"
              >
                Open an account
                <ArrowRight size={16} strokeWidth={2.4} aria-hidden className="transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center gap-2.5 rounded-[4px] border border-[var(--home-line)] px-6 py-3.5 text-[14.5px] font-semibold text-[var(--home-text)] transition-colors hover:border-[var(--home-gold)] hover:text-[var(--home-gold)]"
              >
                Sign in
              </Link>
            </div>
          </Reveal>

          <Reveal delay={380}>
            <p className="mt-5 text-[12px] leading-relaxed text-[var(--home-text-3)]">
              Trading carries risk, including loss of capital. Returns describe the compensation
              plan, not a guarantee.
            </p>
          </Reveal>
        </div>

        {/* The numbers, in the hero. Read from live config by the page — this
            component never states a rate of its own. */}
        {stats.length > 0 && (
          <Reveal delay={300} from="up">
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[5px] border border-[var(--home-line)] bg-[var(--home-line)] backdrop-blur-sm">
              {stats.map((s) => (
                <div key={s.label} className="bg-[color-mix(in_srgb,var(--home-surface)_86%,transparent)] px-4 py-5">
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.09em] text-[var(--home-text-3)]">
                    {s.label}
                  </dt>
                  <dd className="mt-2 tabular-nums text-[26px] font-semibold leading-none tracking-[-0.02em] text-[var(--home-text)]">
                    <Figure value={s.value} />
                  </dd>
                </div>
              ))}
            </dl>
          </Reveal>
        )}
      </div>
    </section>
  );
}

/**
 * The band under the hero.
 *
 * Was a skewed orange marquee of currency glyphs scrolling forever — pure
 * decoration, and the kind that makes a finance page look like a landing-page
 * template. It now carries the actual investment tiers: real content, level,
 * still moving, and it says something a visitor came to find out.
 *
 * It is now a rail you can actually work with rather than a marquee you can
 * only watch:
 *
 * - **Drag to scroll.** A CSS marquee cannot be grabbed, so a visitor who
 *   spotted a tier as it slid past had to wait for the loop to bring it back.
 * - **It carries the arithmetic.** Each tier shows what it accrues per trading
 *   day at the published rate, and a bar giving its size relative to the
 *   largest — so the ladder reads as a ladder instead of a list of prices.
 * - **It stops when you engage with it.** Hover, focus or drag pauses the
 *   drift; `prefers-reduced-motion` stops it entirely.
 *
 * Rendered twice and wrapped at the halfway mark, which is what makes the
 * scroll seamless in both directions.
 */
export function CurrencyBand({ tiers = [], daily = 0 }: { tiers?: number[]; daily?: number }) {
  const viewRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  /* All motion state lives in refs, not React state.
     A 60fps loop that called setState would re-render the whole rail every
     frame; refs let it touch one transform and nothing else. */
  const offset = useRef(0);
  const paused = useRef(false);
  const drag = useRef<{ startX: number; startOffset: number } | null>(null);
  const tween = useRef<{ from: number; to: number; start: number } | null>(null);

  const max = tiers.length ? Math.max(...tiers) : 1;

  /**
   * The drift.
   *
   * This used to write `el.scrollLeft += 0.35` each frame. Browsers round
   * `scrollLeft` to an integer on write, so a sub-pixel step either rounded
   * away to nothing or accumulated into visible 1px jumps — which is exactly
   * the stutter you saw.
   *
   * It now moves a `translate3d` on the track instead: sub-pixel accurate,
   * composited on the GPU, and never touching layout. The step is also
   * time-based rather than per-frame, so it travels at the same speed on a
   * 60Hz and a 144Hz display instead of running twice as fast on the latter.
   */
  useEffect(() => {
    const view = viewRef.current;
    const track = trackRef.current;
    if (!view || !track) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const SPEED = 28;          // px per second — a readable drift, not a marquee
    const TWEEN_MS = 480;
    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      const dt = Math.min(now - last, 64);   // clamp, so a backgrounded tab does not lurch
      last = now;

      const half = track.scrollWidth / 2 || 1;

      if (tween.current) {
        const t = Math.min(1, (now - tween.current.start) / TWEEN_MS);
        const eased = 1 - Math.pow(1 - t, 3);
        offset.current = tween.current.from + (tween.current.to - tween.current.from) * eased;
        if (t >= 1) tween.current = null;
      } else if (!paused.current && !drag.current) {
        offset.current += (SPEED * dt) / 1000;
      }

      // Wrap in both directions, so dragging backwards past zero is seamless.
      offset.current = ((offset.current % half) + half) % half;
      track.style.transform = `translate3d(${-offset.current}px, 0, 0)`;

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { startX: e.clientX, startOffset: offset.current };
    tween.current = null;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    offset.current = drag.current.startOffset - (e.clientX - drag.current.startX);
  };

  const endDrag = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    drag.current = null;
  };

  const nudge = (dir: 1 | -1) => {
    tween.current = { from: offset.current, to: offset.current + dir * 280, start: performance.now() };
  };

  if (tiers.length === 0) return null;

  /* Whole dollars for the tier price, which is always round.

     The per-day accrual is NOT: 0.5% of the $110 tier is $0.55, and rounding
     that to whole dollars printed "$1 / trading day" — an 82% overstatement on
     the entry tier, in the one number a visitor is most likely to check. Cents
     are shown wherever they exist. */
  const money = (n: number) =>
    n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const perDay = (n: number) =>
    n.toLocaleString('en-US', {
      style: 'currency', currency: 'USD',
      minimumFractionDigits: n < 100 ? 2 : 0,
      maximumFractionDigits: n < 100 ? 2 : 0,
    });

  return (
    <section
      aria-label="Investment tiers"
      className="relative border-y border-[var(--home-line)] bg-[var(--home-surface)]"
      /* Pausing flips a ref, not state — the loop reads it next frame, and
         nothing re-renders just because a pointer crossed the rail. */
      onMouseEnter={() => { paused.current = true; }}
      onMouseLeave={() => { paused.current = false; }}
      onFocusCapture={() => { paused.current = true; }}
      onBlurCapture={() => { paused.current = false; }}
    >
      {/* Edge fades, so chips dissolve at the rail's ends instead of being
          sliced by the viewport. Pointer-transparent — they sit over the rail. */}
      <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-[linear-gradient(to_right,var(--home-surface),transparent)]" />
      <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-[linear-gradient(to_left,var(--home-surface),transparent)]" />

      {[-1, 1].map((dir) => (
        <button
          key={dir}
          type="button"
          onClick={() => nudge(dir as 1 | -1)}
          aria-label={dir === -1 ? 'Scroll tiers left' : 'Scroll tiers right'}
          className={`absolute top-1/2 z-20 grid size-7 -translate-y-1/2 place-items-center rounded-[4px] border border-[var(--home-line)] bg-[var(--home-bg)] text-[var(--home-text-2)] transition-colors hover:border-[var(--home-gold)] hover:text-[var(--home-gold)] ${dir === -1 ? 'left-2' : 'right-2'}`}
        >
          {dir === -1 ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
        </button>
      ))}

      {/* The viewport clips; the track inside it is what moves. Nothing here
          scrolls — see the note on the loop above. */}
      <div
        ref={viewRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="cursor-grab overflow-hidden active:cursor-grabbing"
      >
        <div ref={trackRef} className="flex w-max will-change-transform">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex shrink-0" aria-hidden={copy === 1}>
            {tiers.map((t, i) => (
              <Link
                key={`${copy}-${i}`}
                href="/plans"
                tabIndex={copy === 1 ? -1 : 0}
                /* A drag that ends on a chip must not also navigate. */
                onClick={(e) => { if (drag.current) e.preventDefault(); }}
                onDragStart={(e) => e.preventDefault()}
                className="group/tier flex w-[176px] shrink-0 flex-col justify-center border-r border-[var(--home-line)] px-5 py-3.5 transition-colors hover:bg-[var(--home-raised)]"
              >
                <span className="tabular-nums text-[15px] font-bold text-[var(--home-text)] transition-colors group-hover/tier:text-[var(--home-gold)]">
                  {money(t)}
                </span>
                <span className="mt-1 tabular-nums text-[11px] text-[var(--home-text-3)]">
                  {perDay((t * daily) / 100)}<span className="text-[10px]"> / trading day</span>
                </span>
                {/* Relative size of the tier. Turns a row of prices into a
                    ladder you can read the shape of at a glance. */}
                <span aria-hidden className="mt-2 h-[3px] w-full overflow-hidden rounded-[1px] bg-[var(--home-line)]">
                  <span
                    className="block h-full rounded-[1px] bg-[var(--home-gold)] opacity-60 transition-opacity group-hover/tier:opacity-100"
                    style={{ width: `${Math.max(6, (t / max) * 100)}%` }}
                  />
                </span>
              </Link>
            ))}
          </div>
        ))}
        </div>
      </div>
    </section>
  );
}
