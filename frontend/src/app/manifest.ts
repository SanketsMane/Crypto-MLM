import type { MetadataRoute } from 'next';

/**
 * Installable on a phone.
 *
 * Members check a balance the way they check a bank app — several times a day,
 * on a phone, from a home screen. Without a manifest the site is a bookmark
 * that opens in a browser chrome; with one it opens standalone and keeps its
 * place in the app switcher.
 *
 * Deliberately no service worker. Caching an investment platform offline means
 * showing someone a balance that may be hours stale, and a stale balance is
 * worse than no balance.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'FortuneX',
    short_name: 'FortuneX',
    description: 'Investment packages, daily returns and your network — in one place.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    // The navy plate is the brand, and it is what the splash screen shows.
    background_color: '#071426',
    theme_color: '#071426',
    categories: ['finance'],
    icons: [
      { src: '/brand/FX.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/FX.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/brand/FX.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Deposit',  url: '/deposit' },
      { name: 'Withdraw', url: '/withdrawals' },
      { name: 'Income',   url: '/income' },
    ],
  };
}
