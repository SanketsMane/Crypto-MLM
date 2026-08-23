'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { clsx } from 'clsx';

/**
 * Scroll-reveal, in place of the template's WOW.js + animate.css pairing.
 *
 * One observer per element, unobserved the moment it fires — a reveal is a
 * one-way trip, so there is nothing to keep watching. `prefers-reduced-motion`
 * is honoured in CSS rather than here, so the content is never left hidden if
 * the observer does not run at all.
 */
export function Reveal({
  children, from = 'up', delay = 0, className, as: Tag = 'div',
}: {
  children: ReactNode;
  from?: 'up' | 'down' | 'left' | 'right' | 'zoom';
  delay?: number;
  className?: string;
  as?: 'div' | 'section' | 'li' | 'article' | 'header';
}) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        setShown(true);
        io.unobserve(e.target);
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.08 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // custom properties, so the transition itself stays declarative in CSS
  const OFFSET: Record<string, Record<string, string>> = {
    up:    { '--reveal-y': '26px' },
    down:  { '--reveal-y': '-26px' },
    left:  { '--reveal-x': '-32px', '--reveal-y': '0px' },
    right: { '--reveal-x': '32px', '--reveal-y': '0px' },
    zoom:  { '--reveal-y': '0px', '--reveal-s': '0.94' },
  };
  const style = { ...OFFSET[from], '--reveal-delay': `${delay}ms` } as unknown as React.CSSProperties;

  return (
    <Tag
      ref={ref as never}
      data-reveal=""
      data-shown={shown ? '' : undefined}
      style={style}
      className={className}
    >
      {children}
    </Tag>
  );
}

/**
 * Counting number, in place of the template's odometer plugin.
 *
 * Runs once when the figure scrolls into view. The easing is the same
 * decelerating curve the reveals use, so a counter finishing next to a card
 * sliding in reads as one movement rather than two.
 */
export function CountUp({
  to, duration = 1900, prefix = '', suffix = '', decimals = 0, className,
}: {
  to: number; duration?: number; prefix?: string; suffix?: string;
  decimals?: number; className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(to);
      return;
    }

    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        // easeOutExpo — fast out of the gate, long settle
        const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
        setValue(to * eased);
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.4 });

    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [to, duration]);

  return (
    <span ref={ref} className={clsx('tabular-nums', className)}>
      {prefix}
      {value.toLocaleString('en-US', {
        minimumFractionDigits: decimals, maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  );
}
