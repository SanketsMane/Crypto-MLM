import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { QueryProvider } from '@/providers/query-provider';
import { ThemeProvider } from '@/providers/theme-provider';
import { BrandProvider } from '@/providers/brand-provider';
import { AppToaster } from '@/components/layout/app-toaster';
import { THEME_INIT_SCRIPT } from '@/lib/theme';
import { getBranding } from '@/lib/branding.server';
import { brandName, isPlaceholder } from '@/lib/branding';

/**
 * IBM Plex, replacing Inter.
 *
 * Inter is the default-looking typeface of every dashboard on the internet,
 * and it was doing nothing to distinguish this product. Plex was drawn for
 * technical interfaces, and — the part that matters here — Plex Mono gives us
 * real tabular figures for a product whose every screen is money.
 *
 * Weights are declared explicitly; `next/font` only ships what is listed, and
 * a missing weight silently falls back to a synthesised one.
 */
const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex-sans',
});
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
});

/**
 * The theme colour follows the active theme, so the phone's status bar matches
 * the app rather than sitting as a navy bar above a white screen.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F2F5F9' },
    { media: '(prefers-color-scheme: dark)', color: '#070B12' },
  ],
};

/**
 * Metadata is generated, not declared.
 *
 * It used to be a static object naming FortuneX in seven places — the title,
 * the description, `applicationName`, the iOS app title, the OpenGraph site
 * name and both Twitter fields. An operator could rebrand every screen in the
 * console and the browser tab, the home-screen shortcut and every link anyone
 * shared would still carry a brand that was not theirs.
 *
 * The icons are the part that actually forced this change. They were coming
 * from Next's file conventions — `app/favicon.ico`, `app/icon.svg`,
 * `app/apple-icon.png` — which are build artifacts. No amount of console
 * configuration can move a file that was baked into the image, so those three
 * files are gone and the icons are declared here from the uploaded asset.
 */
export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBranding();
  const name = brandName(brand);
  const tagline = isPlaceholder(brand.tagline) ? null : brand.tagline;
  const title = tagline ? `${name} — ${tagline}` : name;

  const description = tagline
    ?? 'A daily trade bonus on invested capital, a thirty-level affiliate network, executive '
     + 'ranks and campaign offers — settled in USDT on BEP-20, on a compensation plan published in full.';

  const icon = brand.assets.icon;
  const social = brand.assets['og-image'] ?? icon;

  return {
    /* Absolute URLs for social cards and canonicals are resolved from here.
       Still an env var: the deployment's own hostname is infrastructure, not
       something an operator sets from inside the app. */
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3010'),
    title,
    description,
    applicationName: name,
    manifest: '/manifest.webmanifest',
    appleWebApp: {
      capable: true,
      title: name,
      statusBarStyle: 'black-translucent',
      /**
       * iOS launch images.
       *
       * Safari does not scale these — it matches an exact device resolution or
       * shows a white screen instead. One file per supported device, all on the
       * same navy plate the manifest declares as `background_color`, so the
       * launch image and the app's first paint are the same colour.
       *
       * These stay build-time assets rather than following the brand: they are
       * twelve device-specific renders, and generating them per-operator needs
       * an image pipeline this project does not have. Noted in the plan as a
       * known gap rather than left to look deliberate.
       */
      startupImage: [
        { url: '/splash/splash-1290x2796.png', media: '(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
        { url: '/splash/splash-1179x2556.png', media: '(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
        { url: '/splash/splash-1284x2778.png', media: '(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
        { url: '/splash/splash-1170x2532.png', media: '(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
        { url: '/splash/splash-1125x2436.png', media: '(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
        { url: '/splash/splash-1242x2688.png', media: '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
        { url: '/splash/splash-828x1792.png', media: '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)' },
        { url: '/splash/splash-750x1334.png', media: '(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)' },
        { url: '/splash/splash-1242x2208.png', media: '(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
        { url: '/splash/splash-1536x2048.png', media: '(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)' },
        { url: '/splash/splash-1668x2388.png', media: '(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)' },
        { url: '/splash/splash-2048x2732.png', media: '(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)' },
      ],
    },
    /**
     * Declared explicitly, because the file conventions that used to supply
     * these are gone. When the operator has uploaded nothing we fall back to
     * the shipped PNG rather than emitting no icon at all — a tab with the
     * browser's blank-page glyph looks broken in a way an unset brand does not.
     */
    icons: {
      icon: icon ?? '/brand/icon-512.png',
      shortcut: icon ?? '/brand/icon-512.png',
      apple: icon ?? '/brand/icon-192.png',
    },
    openGraph: {
      type: 'website',
      siteName: name,
      title,
      description,
      images: [{ url: social ?? '/brand/grow-network.png', width: 1200, height: 630, alt: name }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [social ?? '/brand/grow-network.png'],
    },
    robots: { index: true, follow: true },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const brand = await getBranding();

  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`} data-theme="dark" suppressHydrationWarning>
      <head>
        {/* Runs during HTML parsing — the theme is on <html> before the first
            paint, so a returning admin never sees the wrong theme flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {/* The operator's accent, applied as a custom property so it can lead
            the token layer without a rebuild. Inlined in the document rather
            than set from an effect, for the same reason the theme is: applying
            it after hydration means a visible repaint on every first load. */}
        <style>{`:root{--brand-accent:${cssColor(brand.primaryColor)}}`}</style>
      </head>
      <body>
        <ThemeProvider>
          <BrandProvider value={brand}>
            <QueryProvider>
              {children}
              <AppToaster />
            </QueryProvider>
          </BrandProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

/**
 * The accent is interpolated into a stylesheet, so it is treated as untrusted
 * until proven to be a colour.
 *
 * The API validates this on write and would reject anything that is not a six
 * digit hex — but "a value that reached the database before the validator
 * existed" and "a value written by some future code path" are both real, and
 * the cost of being wrong here is CSS injection into every page. Six hex
 * digits or the default; there is no third case worth supporting.
 */
function cssColor(value: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#FF7A1A';
}
