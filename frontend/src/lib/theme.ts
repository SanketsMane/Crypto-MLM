/**
 * Theme plumbing shared by the blocking init script and the React provider.
 *
 * The stored value is only ever `light` or `dark` — the absence of a stored
 * value *is* "follow the system", so a first-time visitor tracks their OS
 * preference live until they make a choice.
 */

export type Theme = 'light' | 'dark';

export const THEME_KEY = 'fortuneX-theme';

/** Reads the theme currently applied to <html> (set before paint). */
export function domTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

/**
 * Runs synchronously in <head>, before the first paint, so the correct theme
 * is on <html> by the time any pixel is drawn — no flash of the wrong theme.
 * Kept dependency-free and wrapped in try/catch because storage can throw in
 * private-mode and embedded webviews.
 */
export const THEME_INIT_SCRIPT = `(function(){try{
var s=localStorage.getItem('${THEME_KEY}');
var t=(s==='light'||s==='dark')?s:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
var r=document.documentElement;r.setAttribute('data-theme',t);r.style.colorScheme=t;
}catch(e){}})();`;
