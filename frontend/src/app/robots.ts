import type { MetadataRoute } from 'next';
import { SITE_URL } from './sitemap';

/**
 * The marketing pages are for crawlers; the console, the member app and the
 * auth screens are not — they are behind a login, produce no useful result in
 * a search index, and should not appear in one.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/admin/', '/dashboard', '/wallet', '/team', '/genealogy',
                   '/income', '/packages', '/withdrawals', '/profile', '/support',
                   '/rank', '/roaming-club', '/kyc', '/deposit', '/passbook', '/levels',
                   '/security', '/login', '/register'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
