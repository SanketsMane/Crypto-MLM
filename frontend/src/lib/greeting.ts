'use client';

import { useEffect, useState } from 'react';

/**
 * Time-of-day greeting.
 *
 * Read off the *member's* clock, not the server's — `new Date()` in the browser
 * is already local time, so nothing here needs a timezone. The bands are the
 * conventional English ones; "afternoon" is included because without it every
 * greeting between noon and five would read "evening".
 */
export type Greeting = 'Good morning' | 'Good afternoon' | 'Good evening' | 'Good night';

export function greetingFor(date: Date = new Date()): Greeting {
  const hour = date.getHours();
  // the small hours are checked first — they belong to the same band as late
  // night, and testing "morning" first would swallow them
  if (hour < 5) return 'Good night';        // 00:00 – 04:59
  if (hour < 12) return 'Good morning';     // 05:00 – 11:59
  if (hour < 17) return 'Good afternoon';   // 12:00 – 16:59
  if (hour < 21) return 'Good evening';     // 17:00 – 20:59
  return 'Good night';                      // 21:00 – 23:59
}

/**
 * The greeting, kept honest while the tab is open.
 *
 * The first value is computed during render so the heading never flashes a
 * placeholder; the effect re-reads it on mount (which is the first moment we
 * are certainly on the member's own clock rather than the server's) and then
 * once a minute, so a dashboard left open overnight rolls over on its own.
 * Setting the same string is a no-op in React, so the interval is free.
 */
export function useGreeting(): Greeting {
  const [greeting, setGreeting] = useState<Greeting>(() => greetingFor());

  useEffect(() => {
    const tick = () => setGreeting(greetingFor());
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  return greeting;
}
