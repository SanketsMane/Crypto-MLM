# Current state — what we are rebuilding on

Surveyed at commit `1334220`, before any redesign work.

## Stack

| Layer | What's there |
| --- | --- |
| Backend | Node 22 · TypeScript · Express 5 · PostgreSQL 17 · Prisma 7 · BullMQ · Redis |
| Frontend | Next.js 16 · React 19 · Tailwind 4 · TanStack Query · Zustand · Recharts · lucide-react · sonner |
| Mobile | `android/` — Gradle wrapper shell, not a built app |

## Size of the surface

| Surface | Pages |
| --- | --- |
| Admin console (`app/admin/`) | 28 |
| Member dashboard (`app/(dashboard)/`) | 24 |
| Public site (`app/(home)/`, `app/(site)/`) | 17 |
| Auth (`app/(auth)/`) | 3 |
| **Total `page.tsx`** | **71** |

71 pages is the single most important number in this plan. It is why the redesign
has to be phased behind a shared primitive layer rather than done page by page.

## What is already good, and must be kept

**The design system is already token-driven.** `frontend/src/app/globals.css` declares
a Tailwind 4 `@theme` block with the full palette as CSS custom properties — surfaces,
brand, semantics, ink, form controls, tables, charts. The file's own comment says
"nothing hardcodes a hex". Dark mode is authored deliberately, not derived by inversion,
via a `@custom-variant dark` that follows an explicit `data-theme` on `<html>` and falls
back to the OS preference.

This is the seam the entire restyle runs through. A new visual identity is largely a
new set of values in that block plus new component shells — not 71 page rewrites.

**Theme has no flash.** `THEME_INIT_SCRIPT` runs during HTML parsing in
`app/layout.tsx`, so `data-theme` is set before first paint.

**Settings are spec-driven and already safe.** `backend/src/core/runtime-config.ts`
exports a `SPECS` array; every setting declares `key`, `group`, `type`, `label`, `help`,
`enforcedIn`, optional `min`/`max`/`options`, and a `public?: boolean` flag. The public
config endpoint is *derived from that flag*, so a new setting is private unless it
opts in. `settings.service.ts` validates against the spec, writes an audit row with
before/after, invalidates two caches, and notifies other admins.

Branding settings should extend this list. They should not invent a parallel mechanism.

**There is a storage primitive.** `backend/src/core/document-storage.ts` handles KYC
uploads: base64 in, 8 MB cap, an allowlist of `jpeg`/`png`/`webp`/`pdf`, and — notably —
**magic-byte verification** that the payload matches the declared MIME type. It is
driver-swappable by design (local disk today, S3 later, no schema change).

## What does not exist yet

**No public asset upload path.** There is no `multer`, no S3 client, no presigned-URL
code anywhere in `backend/`. `document-storage.ts` is deliberately the *opposite* of
what branding needs — its header states files are "written outside the web root and are
never served statically… there is no guessable public URL." That is correct for a
passport scan and unusable for a logo. Branding assets need a new, public, cacheable
path. The magic-byte and size-guard logic is worth reusing; the access model is not.

**Icons are build-time.** `app/layout.tsx` documents that icons come from Next's file
conventions — `app/favicon.ico`, `app/icon.svg`, `app/apple-icon.png`. Those are static
build artifacts. An admin-settable favicon cannot work this way.

**Brand identity is hardcoded, widely.** `FortuneX` appears **186 times across 75 files**
in `frontend/src` and `backend/src`. `app/layout.tsx` alone hardcodes the title,
description, `applicationName`, `appleWebApp.title`, OpenGraph `siteName`, Twitter card
and a `metadataBase` default of `https://fortunex.com`.

**Support email is hardcoded in 6 places** across `(home)/contact`, `(site)/fortunex/contact`,
`components/home/chrome.tsx` and `components/site/site-footer.tsx` — all as literal
`support@fortunex.com`, several inside `mailto:` hrefs.

**UI primitives are thin.** `components/ui/` has 11 files: `button`, `card`, `confirm`,
`dialog`, `error-state`, `modal`, `not-built`, `pagination`, `primitives`, `session-loading`,
`table`. There is no input, select, tabs, badge, sheet, skeleton, toast shell, empty state,
or data-table. Much of the 71 pages' markup is therefore bespoke — which is both the
reason the redesign is large and the opportunity to shrink it.

## The rule the redesign must not break

The README names three non-negotiable engine properties: balances move atomically in SQL,
every payout is idempotent on a unique ledger `reference`, and every income stream clamps
against the earnings cap. `core/ledger.ts` is the only thing permitted to move money.

**This redesign is a presentation-layer project.** It must not touch `core/ledger.ts`,
`core/capping.ts`, `core/tree.ts` or `core/money.ts`. Where a redesigned screen needs
data those modules own, it consumes an existing endpoint or a new read-only one.
