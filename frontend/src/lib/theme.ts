/**
 * Theme plumbing shared by the blocking init script and the React provider.
 *
 * The stored value is only ever `light` or `dark`. The absence of a stored
 * value means "has not chosen yet" — and that lands on DARK, not on the OS.
 *
 * This is a deliberate product call rather than an oversight. The terminal is
 * the theme this product was designed in; light is the supported alternate.
 * Following the OS meant most visitors met the platform in a theme nobody
 * designed it around, on a first impression that only happens once. The
 * toggle is one click away and the choice sticks.
 */

export type Theme = 'light' | 'dark';

/* Renamed from 'fortuneX-theme'. It is an internal storage key, but it was
   inlined into the pre-paint script and therefore visible in the served HTML
   of every page — the last trace of the old brand on the wire. Renaming costs
   one theme-preference reset per returning visitor, which lands on the
   default anyway. */
export const THEME_KEY = 'app-theme';

/** Reads the theme currently applied to <html> (set before paint). */
export function domTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

/**
 * Runs synchronously in <head>, before the first paint, so the correct theme
 * is on <html> by the time any pixel is drawn — no flash of the wrong theme.
 * Kept dependency-free and wrapped in try/catch because storage can throw in
 * private-mode and embedded webviews.
 */
export const THEME_INIT_SCRIPT = `(function(){try{
var s=localStorage.getItem('${THEME_KEY}');
var t=(s==='light'||s==='dark')?s:'dark';
var r=document.documentElement;r.setAttribute('data-theme',t);r.style.colorScheme=t;
}catch(e){}})();`;
