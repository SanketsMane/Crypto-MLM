/**
 * The operator's brand.
 *
 * This platform is white-label: the name, the artwork and the support address
 * are operator settings, not build-time constants. Nothing here should ever be
 * hardcoded back into a component — if a screen needs the brand, it reads it.
 */

export const BRAND_SLOTS = ['logo-light', 'logo-dark', 'icon', 'og-image'] as const;
export type BrandSlot = (typeof BRAND_SLOTS)[number];

export interface Branding {
  name: string;
  tagline: string;
  legalName: string;
  supportEmail: string;
  supportUrl: string | null;
  primaryColor: string;
  /** True while the wordmark is still the placeholder. Drives the console banner. */
  unset: boolean;
  /** Setting keys still on their shipped placeholder, so the console can name them. */
  placeholders: string[];
  /** Same-origin URLs, or null where nothing has been uploaded. */
  assets: Record<BrandSlot, string | null>;
}

/**
 * What renders when the API cannot be reached.
 *
 * Not "FortuneX" — that would put a brand nobody chose in front of visitors
 * the moment the API blinks, which is exactly the coupling this feature
 * removes. A neutral placeholder is honest about being unset, and the operator
 * sees the console's banner telling them to fix it.
 */
export const BRANDING_FALLBACK: Branding = {
  name: 'TBD',
  tagline: 'TBD',
  legalName: 'TBD',
  supportEmail: 'support@example.com',
  supportUrl: null,
  primaryColor: '#FF7A1A',
  unset: true,
  placeholders: ['BRAND_NAME', 'BRAND_TAGLINE', 'BRAND_LEGAL_NAME', 'SUPPORT_EMAIL'],
  assets: { 'logo-light': null, 'logo-dark': null, 'icon': null, 'og-image': null },
};

/**
 * Whether a value is still the shipped placeholder.
 *
 * Components use this to fall back to a wordmark drawn from the name rather
 * than rendering the literal string "TBD" into a header.
 */
export const isPlaceholder = (v: string | null | undefined) => !v || v === 'TBD';

/** The brand name, or a neutral noun — never the literal placeholder. */
export const brandName = (b: Branding) => (isPlaceholder(b.name) ? 'Platform' : b.name);
