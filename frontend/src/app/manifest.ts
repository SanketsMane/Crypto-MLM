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
     * The uploaded icon, declared at both sizes, or the neutral drawn mark.
     *
     * One square source serves 192 and 512 because there is no image pipeline
     * here to derive one from the other, and browsers downscale correctly. What
     * they cannot do is invent a square from a rectangle — which is why the
     * upload endpoint refuses a non-square icon rather than accepting it and
     * letting Android squash it.
     *
     * The fallback was the shipped icon set, which put the previous brand on
     * the home screen of anyone who installed the app before rebranding — the
     * one place a wrong logo sits permanently on someone's device. It is now
     * the same neutral mark the favicon and header use.
     *
     * `maskable` is deliberately NOT claimed. A maskable icon is cropped to the
     * launcher's shape, and artwork drawn without a safe zone loses its edges;
     * neither an operator's upload nor this mark was drawn for that crop.
     */
    icons: icon
      ? [
          { src: icon, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: icon, sizes: '512x512', type: 'image/png', purpose: 'any' },
        ]
      : [
          { src: '/brand/mark.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
    shortcuts: [
      { name: 'Deposit',  url: '/deposit' },
      { name: 'Withdraw', url: '/withdrawals' },
      { name: 'Income',   url: '/income' },
    ],
  };
}
