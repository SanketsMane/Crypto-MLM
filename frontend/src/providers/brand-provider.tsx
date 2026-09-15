'use client';

import { createContext, useContext } from 'react';
import { BRANDING_FALLBACK, brandName, isPlaceholder, type Branding } from '@/lib/branding';

/**
 * The operator's brand, handed down from the server.
 *
 * Resolved once in the root layout and passed through context rather than
 * fetched per component. Two reasons, and the second is the important one:
 *
 * 1. It is on every page, so refetching it per header, footer and sidebar
 *    would be the same request several times a render.
 * 2. A client fetch cannot avoid a flash. The header would paint with no logo,
 *    then swap one in a moment later — on every navigation, for every visitor.
 *    Server-resolved means the first paint is already correct.
 *
 * There is no setter. Branding changes in the console, and a console save
 * invalidates the API cache; the apps pick it up on their next render.
 */

const Ctx = createContext<Branding>(BRANDING_FALLBACK);

export function BrandProvider({ value, children }: { value: Branding; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The full brand. */
export const useBrand = () => useContext(Ctx);

/**
 * The display name, never the literal placeholder.
 *
 * A fresh install ships with `BRAND_NAME` set to "TBD", and a header reading
 * "TBD" in front of a member is worse than a generic noun. The console's
 * banner is what tells the operator to fix it; the member-facing surface just
 * degrades quietly.
 */
export const useBrandName = () => brandName(useContext(Ctx));

/**
 * The logo for a surface, or null when nothing is uploaded.
 *
 * `dark` picks the light-coloured artwork — the sidebar is navy in both
 * themes, so it asks for the dark-surface logo regardless of the active theme.
 */
export function useBrandLogo(surface: 'light' | 'dark' = 'light'): string | null {
  const brand = useContext(Ctx);
  const preferred = surface === 'dark' ? brand.assets['logo-dark'] : brand.assets['logo-light'];
  // Either slot beats no logo at all; an operator who uploads one usually
  // means it for both surfaces.
  return preferred ?? brand.assets['logo-light'] ?? brand.assets['logo-dark'];
}

/** Whether the operator still has not set their brand. */
export const useBrandUnset = () => useContext(Ctx).unset;

export { isPlaceholder };
