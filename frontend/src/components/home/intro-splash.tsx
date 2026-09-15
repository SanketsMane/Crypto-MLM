'use client';

import { useEffect } from 'react';
import { INTRO_KEY } from '@/lib/intro-splash';
import { BrandMark } from '@/components/layout/brand-mark';

/**
 * The entrance on the marketing site.
 *
 * Three rules it keeps:
 *
 * 1. It never blocks the page. `pointer-events: none` throughout, and the real
 *    content is rendered underneath from the first byte — a crawler, a reader
 *    mode and a person who taps straight through all get the page, not this.
 *    There is deliberately no skip control: nothing is being blocked, so there
 *    is nothing to escape from.
 * 2. It cannot get stuck. The dismissal is a CSS animation, not a timer in
 *    React, so it plays out even if hydration is slow or never happens at all.
 *    This component only does the bookkeeping.
 * 3. It is rationed. The timestamp written here is what the pre-paint script
 *    reads to decide whether the cooldown has elapsed.
 */
export function IntroSplash() {
  useEffect(() => {
    const root = document.documentElement;
    if (!root.hasAttribute('data-intro')) return;

    // recorded at the moment it plays, so the cooldown runs from there
    try { localStorage.setItem(INTRO_KEY, String(Date.now())); } catch { /* private mode — it replays */ }

    /* Tidy the attribute away once the animation has finished, so it is not
       left on <html>. Comfortably longer than the animation itself. */
    const done = window.setTimeout(() => root.removeAttribute('data-intro'), 3000);
    return () => window.clearTimeout(done);
  }, []);

  return (
    <div className="fx-intro" aria-hidden="true">
      {/* The operator's mark, not a baked-in PNG.
          This was the last place still painting the shipped gold wordmark —
          and the worst one to miss, because the splash is the very first thing
          a visitor sees on the public site. A white-label platform cannot open
          on somebody else's logo. */}
      <div className="fx-intro__mark">
        <BrandMark variant="full" className="scale-[1.6]" />
      </div>
      <span className="fx-intro__rule" />
    </div>
  );
}
