import type { Metadata } from 'next';
import { SiteHeader } from '@/components/site/site-header';
import { SiteFooter } from '@/components/site/site-footer';

export const metadata: Metadata = {
  title: { default: 'Trade. Invest. Earn.', template: '%s' },
  description:
    'A trading and affiliate platform: a daily trade bonus on invested capital, a thirty-level network, executive ranks and campaign offers — settled in USDT on BEP-20.',
  openGraph: {
    title: 'Trade. Invest. Earn.',
    description: 'A transparent compensation plan, published in full. Settled in USDT on BEP-20.',
    type: 'website',
  },
};

/**
 * The public site.
 *
 * It keeps one fixed identity — deep navy and metallic gold — rather than
 * following the console's light/dark preference. A visitor arriving from a
 * search result should see the brand the same way every time.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-site className="flex min-h-screen flex-col bg-navy-deep text-white antialiased [color-scheme:dark]">
      <SiteHeader />
      {/* offset for the fixed header */}
      <main className="flex-1 pt-[68px] sm:pt-[76px]">{children}</main>
      <SiteFooter />
    </div>
  );
}
