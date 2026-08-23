import type { MetadataRoute } from 'next';

/** Public pages only — the console and the member app are not for crawlers. */
const PAGES = [
  { path: '', priority: 1, changeFrequency: 'weekly' as const },
  { path: '/about', priority: 0.8, changeFrequency: 'monthly' as const },
  { path: '/opportunity', priority: 0.9, changeFrequency: 'weekly' as const },
  { path: '/how-it-works', priority: 0.9, changeFrequency: 'monthly' as const },
  { path: '/plans', priority: 0.9, changeFrequency: 'weekly' as const },
  { path: '/rewards', priority: 0.8, changeFrequency: 'monthly' as const },
  { path: '/faq', priority: 0.7, changeFrequency: 'monthly' as const },
  { path: '/terms', priority: 0.4, changeFrequency: 'yearly' as const },
  { path: '/contact', priority: 0.6, changeFrequency: 'yearly' as const },
  { path: '/legal/terms', priority: 0.3, changeFrequency: 'yearly' as const },
  { path: '/legal/privacy', priority: 0.3, changeFrequency: 'yearly' as const },
  { path: '/legal/risk-disclosure', priority: 0.4, changeFrequency: 'yearly' as const },
  { path: '/legal/aml-kyc', priority: 0.3, changeFrequency: 'yearly' as const },
];

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://fortunex.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return PAGES.map((p) => ({
    url: `${SITE_URL}${p.path}`,
    lastModified,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));
}
