import { brandAssetSource } from '@/lib/branding.server';

/**
 * Brand artwork, served from this app's own origin.
 *
 * A favicon is fetched by the browser with no script involved — no bearer
 * token, no CORS preflight, no ability to follow a rewrite. So the URL in
 * `<link rel="icon">` has to be one the page's own origin answers. In
 * development the API is on a different port entirely, which would make an
 * operator-set favicon work in production and silently 404 locally.
 *
 * Proxying is one hop on a file the browser then caches for a year.
 *
 * The key is a content hash, so the bytes at a given URL never change — which
 * is what makes `immutable` honest here, and why the hop is paid once.
 */

/** Keys are minted by the API as a hex hash plus a known extension. */
const KEY = /^[a-f0-9]{32}\.(png|webp|jpg|ico)$/;

export async function GET(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  if (!KEY.test(key)) return new Response('Not found', { status: 404 });

  const upstream = await fetch(brandAssetSource(key), {
    // Immutable by construction, so Next may hold it as long as it likes.
    next: { revalidate: false },
  }).catch(() => null);

  if (!upstream?.ok) return new Response('Not found', { status: 404 });

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
