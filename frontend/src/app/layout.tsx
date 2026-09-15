import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { QueryProvider } from '@/providers/query-provider';
import { ThemeProvider } from '@/providers/theme-provider';
import { AppToaster } from '@/components/layout/app-toaster';
import { THEME_INIT_SCRIPT } from '@/lib/theme';

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });

/**
 * The theme colour follows the active theme, so the phone's status bar matches
 * the app rather than sitting as a navy bar above a white screen.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F6F8FC' },
    { media: '(prefers-color-scheme: dark)', color: '#08080E' },
  ],
};

export const metadata: Metadata = {
  /* Absolute URLs for social cards and canonicals are resolved from here. */
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://fortunex.com'),
  title: 'FortuneX — Trade. Invest. Earn.',
  description:
    'A daily trade bonus on invested capital, a thirty-level affiliate network, executive ranks and campaign offers — settled in USDT on BEP-20, on a compensation plan published in full.',
  applicationName: 'FortuneX',
  manifest: '/manifest.webmanifest',
  // Standalone on iOS too, which reads these rather than the manifest.
  /**
   * iOS launch images.
   *
   * Safari does not scale these — it matches an exact device resolution or
   * shows a white screen instead, which is what a member launching from their
   * home screen saw before this existed. One file per supported device, all on
   * the same navy plate the manifest declares as `background_color`, so the
   * launch image and the app's first paint are the same colour and the
   * handover is invisible.
   */
  appleWebApp: {
    capable: true,
    title: 'FortuneX',
    statusBarStyle: 'black-translucent',
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
   * Icons come from the file conventions — `app/favicon.ico`, `app/icon.svg`
   * and `app/apple-icon.png` — so Next emits the right `rel`, `type` and
   * `sizes` for each rather than us asserting them by hand.
   *
   * This used to point both `icon` and `apple` at FX-mark.png, which is 192x102:
   * a wide rectangle standing in for a square icon. Browsers letterboxed or
   * squashed it, and at 16px the two-tone diagonals had nothing left to read.
   */
  openGraph: {
    type: 'website',
    siteName: 'FortuneX',
    title: 'FortuneX — Trade. Invest. Earn.',
    description: 'A compensation plan published in full. Settled in USDT on BEP-20.',
    images: [{ url: '/brand/grow-network.png', width: 1200, height: 630, alt: 'FortuneX' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FortuneX — Trade. Invest. Earn.',
    description: 'A compensation plan published in full. Settled in USDT on BEP-20.',
    images: ['/brand/grow-network.png'],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} data-theme="light" suppressHydrationWarning>
      <head>
        {/* Runs during HTML parsing — the theme is on <html> before the first
            paint, so a returning admin never sees the wrong theme flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <ThemeProvider>
          <QueryProvider>
            {children}
            <AppToaster />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
