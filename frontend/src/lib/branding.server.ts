import 'server-only';
import { BRANDING_FALLBACK, BRAND_SLOTS, type Branding, type BrandSlot } from './branding';

/**
 * The brand, fetched on the server.
 *
 * Server-side deliberately. Fetching this in the browser would mean every page
 * paints with no logo and then pops one in — the exact cheap-looking flash the
 * redesign exists to remove — and `generateMetadata` cannot wait on a client
 * fetch anyway, so the tab title and favicon would never follow the operator
 * at all.
 *
 * Kept separate from `platform-config.server.ts` even though both read the
 * same API. That one carries the whole compensation plan — packages, 33
 * commission rules, ranks, tiers — and is needed by a handful of marketing
 * pages. This is needed by the root layout, on every render of every page.
 * Bundling them would make a dashboard load pull the plan catalogue to draw a
 * logo.
 */

/** Matches the API's own 60s cache. A brand changes perhaps twice, ever. */
const REVALIDATE_SECONDS = 60;

/**
 * Where the SERVER reaches the API — which is not where the browser does.
 * Same reasoning as `platform-config.server.ts`; see the note there.
 */
function apiOrigin(): string {
  if (process.env.API_INTERNAL_URL) return process.env.API_INTERNAL_URL;
  const pub = process.env.NEXT_PUBLIC_API_URL;
  if (pub && /^https?:\/\//.test(pub)) return pub;
  const port = process.env.API_PORT ?? '4000';
  return `http://localhost:${port}/api/v1`;
}

/**
 * Rewrite an API asset path to this app's own origin.
 *
 * The API hands back `/api/v1/brand/asset/<key>`, which is correct for the API
 * but is not reachable from the browser in development — the web app is on
 * 3010 and the API on 4000. A favicon cannot be fetched with a bearer token or
 * a CORS preflight, so pointing the browser at the API origin works only when
 * a reverse proxy happens to put both behind one host.
 *
 * So brand assets are served same-origin, by `app/brand-asset/[key]/route.ts`,
 * which proxies to the API. One hop, on an immutable-cached file.
 *
 * `/brand-asset` rather than `/brand` because `public/brand/` already serves
 * the shipped artwork at that path, and a route segment colliding with a
 * static directory is not a conflict worth relying on either way.
 */
const sameOrigin = (apiPath: string | null): string | null => {
  if (!apiPath) return null;
  const key = apiPath.split('/').pop();
  return key ? `/brand-asset/${key}` : null;
};

interface ApiBranding extends Omit<Branding, 'assets'> {
  assets: Record<BrandSlot, string | null>;
}

export async function getBranding(): Promise<Branding> {
  try {
    const res = await fetch(`${apiOrigin()}/brand`, {
      next: { revalidate: REVALIDATE_SECONDS, tags: ['branding'] },
    });
    if (!res.ok) return BRANDING_FALLBACK;

    const body = (await res.json()) as { success: boolean; data: ApiBranding };
    if (!body.data) return BRANDING_FALLBACK;

    const assets = { ...BRANDING_FALLBACK.assets };
    for (const slot of BRAND_SLOTS) assets[slot] = sameOrigin(body.data.assets?.[slot] ?? null);

    return { ...BRANDING_FALLBACK, ...body.data, assets };
  } catch {
    /* A page that 500s because the API blinked is worse than one rendering a
       placeholder name for a minute. Same trade the plan config makes. */
    return BRANDING_FALLBACK;
  }
}

/** The API origin a route handler should proxy an asset from. */
export const brandAssetSource = (key: string) => `${apiOrigin()}/brand/asset/${key}`;
