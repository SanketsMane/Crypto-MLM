'use client';

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useState } from 'react';
import { domTheme, THEME_KEY, type Theme } from '@/lib/theme';

/** useLayoutEffect warns during SSR; useEffect is the server-safe stand-in. */
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function storedTheme(): Theme | null {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch { return null; }
}

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

interface ThemeCtx {
  /** The theme actually applied to the document. */
  theme: Theme;
  /** True once the client has read the applied theme (server render assumes light). */
  ready: boolean;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const Ctx = createContext<ThemeCtx>({ theme: 'light', ready: false, setTheme: () => {}, toggle: () => {} });

export const useTheme = () => useContext(Ctx);

/**
 * Owns theme *changes*. Applying the theme on first load is the blocking
 * script's job (see `THEME_INIT_SCRIPT`) — this provider only mirrors what is
 * already on <html> into React, then writes back when the user switches.
 *
 * Visual active-state in the switcher is driven by CSS off `[data-theme]`
 * rather than by this state, so nothing depends on hydration timing.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light');
  const [ready, setReady] = useState(false);

  /* Mirror the applied theme into React. Runs before paint and re-asserts the
     attribute, because React's dev-only StrictMode remount strips attributes
     from <html> that it does not own — a no-op in production. */
  useIsoLayoutEffect(() => {
    const resolved = storedTheme() ?? (document.documentElement.hasAttribute('data-theme') ? domTheme() : systemTheme());
    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.style.colorScheme = resolved;
    setThemeState(resolved);
    setReady(true);
  }, []);

  const apply = useCallback((next: Theme, persist: boolean) => {
    const root = document.documentElement;

    // arm the cross-fade only for the duration of the switch, so no other
    // interaction in the app inherits a transition it did not ask for
    root.classList.add('theme-switching');
    window.setTimeout(() => root.classList.remove('theme-switching'), 220);

    root.setAttribute('data-theme', next);
    root.style.colorScheme = next;
    if (persist) {
      try { localStorage.setItem(THEME_KEY, next); } catch { /* storage unavailable */ }
    }
    setThemeState(next);
  }, []);

  const setTheme = useCallback((next: Theme) => apply(next, true), [apply]);
  const toggle = useCallback(() => apply(domTheme() === 'dark' ? 'light' : 'dark', true), [apply]);

  /* follow the OS while the visitor has not chosen for themselves */
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (storedTheme()) return;
      apply(mq.matches ? 'dark' : 'light', false);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [apply]);

  /* keep every open tab of the console on the same theme */
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== THEME_KEY) return;
      if (e.newValue === 'light' || e.newValue === 'dark') apply(e.newValue, false);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [apply]);

  return <Ctx.Provider value={{ theme, ready, setTheme, toggle }}>{children}</Ctx.Provider>;
}
