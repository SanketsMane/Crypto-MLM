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
    { media: '(prefers-color-scheme: dark)', color: '#071426' },
  ],
};

export const metadata: Metadata = {
  /* Absolute URLs for social cards and canonicals are resolved from here. */
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://fortunex.com'),
  title: 'FortuneX — Trade. Invest. Earn.',
  description:
    'A daily trade bonus on invested capital, a thirty-level affiliate network, executive ranks and the Roaming Club — settled in USDT on BEP-20, on a compensation plan published in full.',
  applicationName: 'FortuneX',
  manifest: '/manifest.webmanifest',
  // Standalone on iOS too, which reads these rather than the manifest.
  appleWebApp: { capable: true, title: 'FortuneX', statusBarStyle: 'black-translucent' },
  icons: { icon: '/brand/FX-mark.png', apple: '/brand/FX-mark.png' },
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
