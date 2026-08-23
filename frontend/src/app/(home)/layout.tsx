import type { Metadata } from 'next';
import { Lexend } from 'next/font/google';
import './home.css';
import { Footer, Nav, TopBar } from '@/components/home/chrome';
import { IntroSplash } from '@/components/home/intro-splash';
import { INTRO_INIT_SCRIPT } from '@/lib/intro-splash';

/* Lexend is this page's display face. It arrived with the layout this design
   came from, where it was pulled through a Google Fonts @import inside the
   stylesheet — which blocks render. next/font self-hosts it and inlines the
   face declarations instead, so the type does not reflow on first paint.
   The rest of the app runs on Inter; this is the one route that does not. */
const lexend = Lexend({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-lexend',
});

export const metadata: Metadata = {
  title: 'FortuneX | Smarter Forex Trading Solutions',
  description:
    'A global trading ecosystem built on transparency, technology and trust — daily trade bonuses, a thirty-level network, executive ranks and travel rewards.',
};

/**
 * The marketing home page.
 *
 * Its own route group rather than part of `(site)`: this page brings its own
 * header and footer, so wrapping it in the site chrome would double them up.
 * `data-home` scopes the entire palette to this subtree — see home.css — so
 * the black-and-gold treatment never leaks into the console or `(site)`.
 *
 * The previous home page still exists, unchanged, at /fortunex.
 */
export default function FortuneXLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-home className={`${lexend.variable} min-h-screen overflow-x-hidden antialiased`}>
      {/* Decides whether the intro runs, during parse and before the first
          paint, so a returning visitor never sees a frame of it. */}
      <script dangerouslySetInnerHTML={{ __html: INTRO_INIT_SCRIPT }} />
      <IntroSplash />
      <TopBar />
      <Nav />
      {children}
      <Footer />
    </div>
  );
}
