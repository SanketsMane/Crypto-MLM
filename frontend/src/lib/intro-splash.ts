/** When the intro was last played, as a millisecond timestamp. */
export const INTRO_KEY = 'fx_intro_at';

/** How long before it is allowed to play again. */
export const INTRO_COOLDOWN_MS = 5 * 60 * 1000;   // 5 minutes

/**
 * Runs during HTML parsing, before the first paint.
 *
 * The decision has to be made before anything renders, or a returning visitor
 * sees a flash of the overlay before JavaScript can take it away. So this sets
 * an attribute on <html> and CSS does the rest — the same approach the theme
 * switch already uses.
 *
 * Time-based rather than once-per-session, so someone who leaves a tab open
 * and comes back later gets the entrance again. `localStorage` rather than
 * `sessionStorage` on purpose: the window should survive closing the tab, or
 * reopening the site in a new one would replay it immediately.
 *
 * Opts out for `prefers-reduced-motion`, and fails closed — if storage throws
 * (private browsing, blocked site data) the overlay simply does not run. A
 * missing intro is nothing; a stuck one covers the site.
 */
export const INTRO_INIT_SCRIPT = `(function(){try{
if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
var t=Number(localStorage.getItem('${INTRO_KEY}')||0);
if(t&&Date.now()-t<${INTRO_COOLDOWN_MS})return;
document.documentElement.setAttribute('data-intro','');
}catch(e){}})();`;
