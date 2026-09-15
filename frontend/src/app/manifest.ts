import type { MetadataRoute } from 'next';
import { getBranding } from '@/lib/branding.server';
import { brandName, isPlaceholder } from '@/lib/branding';

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
 *
 * Now generated per-request rather than fixed at build. It named FortuneX and
 * pointed at three shipped PNGs, which meant the installed app kept a brand the
 * operator may have replaced everywhere else — and the home screen is the one
 * place a wrong name sits permanently on someone's device.
 */
export const dynamic = 'force-dynamic';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const brand = await getBranding();
  const name = brandName(brand);
  const icon = brand.assets.icon;

  return {
    name,
    short_name: name,
    description: isPlaceholder(brand.tagline)
      ? 'Investment packages, daily returns and your network — in one place.'
      : brand.tagline,
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    // The navy plate is the app chrome, and it is what the splash screen shows.
    background_color: '#08080E',
    theme_color: brand.primaryColor,
    categories: ['finance'],
    /**
     * The uploaded icon, declared at both sizes, or the shipped set.
     *
     * One square source serves 192 and 512 because there is no image pipeline
     * here to derive one from the other, and browsers downscale correctly. What
     * they cannot do is invent a square from a rectangle — which is why the
     * upload endpoint refuses a non-square icon rather than accepting it and
     * letting Android squash it.
     *
     * `maskable` is deliberately NOT claimed for an uploaded icon. A maskable
     * icon is cropped to the launcher's shape, and artwork drawn without a safe
     * zone loses its edges. The shipped maskable variant was drawn for it; an
     * operator's upload was not, so claiming the purpose would quietly mangle it.
     */
    icons: icon
      ? [
          { src: icon, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: icon, sizes: '512x512', type: 'image/png', purpose: 'any' },
        ]
      : [
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
