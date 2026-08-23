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
    background_color: '#08080E',
    theme_color: '#08080E',
    categories: ['finance'],
    /**
     * Each entry is a file that genuinely is the size it claims.
     *
     * All three used to point at FX.png — one 1536x1024 image declared as both
     * 192x192 and 512x512, and as maskable. Android scales whatever it is
     * given, so the home-screen icon was a squashed rectangle; and a maskable
     * icon gets cropped to the launcher's shape, which would have cut into
     * artwork that never had a safe zone.
     *
     * The maskable variant is drawn separately: plate to the edge so the OS has
     * something to crop, glyph inside the 80% circle so it survives the crop.
     */
    icons: [
      { src: '/brand/icon-192.png',          sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/icon-512.png',          sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/brand/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Deposit',  url: '/deposit' },
      { name: 'Withdraw', url: '/withdrawals' },
      { name: 'Income',   url: '/income' },
    ],
  };
}
