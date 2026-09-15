# Plan — white-label branding + full UI/UX rebuild

Two workstreams that share one dependency. Read `02-current-state.md` first.

- **A. Branding as data** — the operator sets logo, brand name, favicon and support
  email from the console, and every surface follows. Smaller, well-bounded, and it
  *must land first* because it changes what the redesign is allowed to hardcode.
- **B. The new look** — a fintech-grade visual and interaction rebuild across 71 pages.

Ordering matters. If B runs first, we restyle 71 pages against a hardcoded `FortuneX`
and then have to sweep all of them again. A-then-B does the sweep once.

---

## Workstream A — Branding as data

### A0. Decide the storage driver *(blocking, one decision)*

Branding assets are public, cached, and small. Two viable paths:

| | Local disk + API route | Object storage (S3/R2) |
| --- | --- | --- |
| Effort | Low — mirrors `document-storage.ts` | Medium — new dependency, creds |
| Multi-instance | Breaks unless the volume is shared | Works |
| CDN | Needs cache headers from our route | Native |

**Recommendation: local disk behind an API route now, written against the same
driver-swappable shape `document-storage.ts` already uses.** `docker-compose.prod.yml`
exists, so a named volume covers single-host deployment, and the interface means moving
to R2 later is a driver file, not a refactor. Revisit only if you already run more than
one API instance.

### A1. `BrandingAsset` — a new public-asset primitive

New `backend/src/core/brand-storage.ts`. Reuse from `document-storage.ts`:
size cap, MIME allowlist, and the **magic-byte check** — an admin upload is still an
upload, and a `.png` that is actually an SVG with a `<script>` in it is stored XSS.

Differences from the KYC store:
- **Public read, no auth.** Served by a route under `/api/v1/brand/:key`.
- **Content-addressed keys.** The stored key includes a hash of the bytes. A new logo
  gets a new URL, so `Cache-Control: public, max-age=31536000, immutable` is safe and a
  CDN can never serve yesterday's logo. This is the mechanism that makes branding
  changes instant; do not skip it.
- **Tighter type allowlist.** `png`, `webp`, `svg`, `x-icon`. SVG needs sanitising
  (strip `<script>`, `<foreignObject>`, `on*` handlers) or should be rejected outright —
  rejecting it is the safe default and PNG is sufficient for a logo.
- **Server-side normalisation.** One uploaded square mark should emit the derived sizes
  (favicon 32, apple-touch 180, PWA 192/512) rather than asking the operator for five files.

New Prisma model, roughly:

```prisma
model BrandingAsset {
  id        String   @id @default(cuid())
  slot      String   @unique   // "logo-light" | "logo-dark" | "icon" | "og-image"
  storageKey String
  mimeType  String
  sizeBytes Int
  width     Int?
  height    Int?
  updatedAt DateTime @updatedAt
}
```

### A2. Text branding joins `SPECS`

Add to `core/runtime-config.ts` under a new `'Branding'` group, all `public: true`:

| Key | Type | Seeded default | Notes |
| --- | --- | --- | --- |
| `BRAND_NAME` | `text` | `TBD` | The wordmark |
| `BRAND_TAGLINE` | `text` | `TBD` | Sits under the wordmark on the public site |
| `BRAND_LEGAL_NAME` | `text` | `TBD` | Legal pages and email footers |
| `SUPPORT_EMAIL` | `text` | `support@example.com` | Email-format validation in `parseSetting` |
| `SUPPORT_URL` | `text` | *(empty)* | Optional — a helpdesk link |
| `BRAND_PRIMARY_COLOR` | `text` | neutral accent | Hex; drives the accent token (see B1) |

`SUPPORT_EMAIL` seeds to a syntactically valid address rather than `TBD`, because it is
rendered into `mailto:` hrefs — a malformed value there produces a broken link rather
than an obviously-unset one.

Because the defaults are placeholders, the console should surface an unmissable
"branding not configured" banner until `BRAND_NAME` is changed. Shipping is not the
moment to discover the wordmark still says `TBD`.

~~Because they are `public: true`, they flow into the existing `PublicConfig` payload with
no new endpoint.~~ **Revised during A1–A3:** branding gets its own `GET /brand` instead.
`PublicConfig` carries the whole compensation plan — packages, 33 commission rules,
ranks, tiers — and the root layout needs the brand on every render of every page.
Bundling them would make a dashboard load pull the plan catalogue in order to draw a
logo. Two small documents, cached on their own terms, beats one large one. It also
avoids an import cycle between the config and branding services.

`parseSetting` must gain real validation here: an email that is not an email, or a colour
that is not a hex, silently breaks `mailto:` links and the theme.

### A3. Serving it without a flash

This is the part that is easy to get wrong. If branding is fetched client-side, every
page loads with no logo and then pops one in — which is exactly the cheap look the
redesign is meant to eliminate.

- **Fetch branding server-side in `app/layout.tsx`** and pass it down. Next 16 caching
  applies; revalidate on a short TTL to match the existing 30 s public-config cache.
- **`generateMetadata()` replaces the static `metadata` export.** Title, description,
  `applicationName`, `appleWebApp.title`, OpenGraph `siteName` and the Twitter card all
  read from branding. `metadataBase` keeps its env default.
- **Favicon: delete `app/icon.svg` / `app/apple-icon.png` / `app/favicon.ico`** and emit
  `icons` from `generateMetadata()` pointing at the content-addressed asset URLs. This
  is the concrete consequence of the build-time problem in `02-current-state.md` — the
  file-convention icons must go, or they will keep winning over the admin's choice.
- **`manifest.webmanifest` becomes a route**, not a static file, so PWA name and icons
  follow the brand too.
- **Seed defaults** so a fresh install has a working logo and never renders an empty
  header while an operator has not uploaded anything.

### A4. The sweep

Replace all 186 hardcoded occurrences. Mechanical, but it is the step that makes the
feature real rather than decorative — if the footer still says `support@fortunex.com`
after an operator sets their own, the feature is broken.

Targets, in order:
1. `app/layout.tsx` metadata block
2. `components/site/site-footer.tsx`, `components/site/site-header.tsx`,
   `components/home/chrome.tsx` — logo and the 6 support-email literals
3. `components/layout/top-header.tsx`, `components/sidebar.tsx`,
   `components/member/top-header.tsx`, `components/member/member-card.tsx`
4. `(home)/contact` and `(site)/fortunex/contact`
5. Backend `core/email/templates.ts` — email subjects and footers
6. Legal pages under `(home)/legal/` — these name the company in body copy

Add a lint rule or a CI grep that fails on a new hardcoded brand literal, or this
regresses within a month.

### A5. Admin screen

Extend `app/admin/settings/` with a Branding tab: live preview of header/sidebar/favicon,
drag-drop upload with client-side dimension guidance, dark- and light-logo slots, and a
reset-to-default per field. Every write already gets audit + admin notification for free
from `settings.service.ts`.

### A6. Out of scope, stated explicitly

The `android/` shell and `FortuneX.pdf` are **not** covered. A native app icon is a build
input, not a runtime setting. If the Android app becomes real, its branding is a separate
build-time pipeline.

---

## Workstream B — The new look

### B1. Token layer first

Rework the `@theme` block in `globals.css` as the whole visual foundation. Concretely:

- **A real type scale.** Inter is loaded but there is no declared scale. Add display /
  heading / body / caption / numeric steps.
- **Tabular numerals on every figure.** `font-variant-numeric: tabular-nums` on balances,
  tables and charts. Digits that shift width as they update look amateur, and this app is
  almost entirely numbers.
- **Spacing, radius and elevation scales** as tokens, so the redesign is consistent by
  construction rather than by review.
- **Motion tokens** — duration and easing — plus a `prefers-reduced-motion` path.
- **One accent driven by `BRAND_PRIMARY_COLOR`** from A2, injected as a CSS variable on
  `<html>`. This is where the two workstreams meet: the operator's colour actually moves
  the theme.
- **Density tokens** — `--density-row`, `--density-pad`, `--density-gap` — switched at
  breakpoint. See B6; this is the mechanism that makes the terminal direction work on a
  phone.

Keep the existing dark-mode architecture — it is well-built and already flash-free — but
flip the default `data-theme` on `<html>` from `light` to `dark`.

### B2. Component library

Grow `components/ui/` from 11 files to a real set before touching pages. Minimum:
`input`, `select`, `textarea`, `checkbox`, `radio`, `switch`, `tabs`, `badge`, `avatar`,
`tooltip`, `dropdown`, `sheet`, `skeleton`, `empty-state`, `stat-tile`, `data-table`,
`form-field`, `currency-input`, `copy-field`, `qr-panel`, `stepper`, `timeline`.

Two fintech-specific ones worth calling out:
- **`<Money>`** — one component for every currency figure. Tabular, correctly signed,
  colour-coded by direction, with a consistent truncation rule. Today this is re-done
  ad hoc across dozens of pages.
- **`<StatusPill>`** — deposit, withdrawal, KYC and investment states all render status
  differently right now.

Accessibility is a build requirement, not a pass at the end: `@axe-core/playwright` is
already installed and wired into the e2e setup.

### B3. Charts

Recharts is already in. Follow one chart system across the app — shared palette from the
tokens, consistent axis and tooltip treatment, and a defined empty and loading state per
chart. Income series, cap utilisation and the admin reports screens are the heavy users.

### B4. Page migration, in dependency order

Do not big-bang 71 pages. Each wave ships behind the same primitives and is independently
reviewable.

| Wave | Scope | Pages | Why here |
| --- | --- | --- | --- |
| 1 | Auth + shell (sidebar, headers, nav) | 3 + chrome | Every other page inherits the shell |
| 2 | Member core — dashboard, wallet, deposit, withdrawals, packages | ~8 | Highest traffic, highest trust impact |
| 3 | Member network — team, genealogy, levels, rank, income, passbook, statement | ~10 | Shares the tree/table primitives |
| 4 | Member remainder — kyc, profile, security, support, notifications, invite, rewards | ~10 | Lower traffic |
| 5 | Admin console | 28 | Internal users; last is correct, but it is the largest single wave |
| 6 | Public site + legal | 17 | Marketing polish, needs final brand assets |

### B5. The experience work, not just the skin

"A new kind of experience" needs to mean specific things, or it evaporates into a
repaint. Proposed, in priority order:

1. **Onboarding.** A first-run checklist that walks a new member from register → KYC →
   deposit → first package, with visible progress. This is the single highest-leverage
   UX change in a platform like this.
2. **The dashboard answers one question.** "What am I earning, and what is my cap
   headroom?" Lead with it. Cap utilisation is a core mechanic and is currently buried.
3. **Genealogy as a real visual tree** — zoom, search, collapse, lazy-load by level.
   30 levels in a list is unusable; it is the feature members show each other.
4. **Money flows get confirmation and receipts.** Withdrawal and deposit are the moments
   trust is won or lost. Explicit review step, fee breakdown before confirm, a receipt
   after, and honest states for the 48 h SLA.
5. **Admin queues become work surfaces** — bulk actions, keyboard navigation, saved
   filters, SLA ageing surfaced as the primary sort. The finance queue is a job, not a
   report.
6. **Real empty, loading and error states everywhere.** Skeletons matched to final
   layout. This is most of the perceived-quality gap.
7. **Mobile-first for the member app.** Most of this audience is on a phone.

---

## Risks and hard calls

**Scope.** 71 pages plus a new component library plus a branding subsystem is a large
programme, not a sprint. The phasing above is what makes it tractable; compressing it
into "redesign everything at once" is the main way this fails.

**Test coverage is a real constraint and a real asset.** Playwright e2e specs exist and
will break on a redesign — selectors, copy, structure. Budget for updating them in every
wave rather than letting them rot. `npm run verify` already chains typecheck, unit tests,
build and a bundle budget; keep it green per wave.

**The bundle budget will fight the redesign.** `scripts/bundle-budget.mjs` is enforced in
`verify`. A richer component library adds weight. Agree early whether the budget moves or
the library stays lean.

**SVG logo upload is a genuine XSS vector**, and the reason A1 recommends rejecting SVG.
If the operator insists on SVG, sanitising is mandatory, not optional.

**Do not let the redesign reach the engine.** Any change under `backend/src/core/` that
is not `brand-storage.ts` or a `SPECS` addition should be treated as out of scope and
challenged in review.

---

## Decisions taken

**1. Visual direction — dense trading terminal.** Dark-first, information-dense, compact
rows, monospace/tabular numerics, charts as primary rather than decorative. See B1 and
B6 for how this is executed.

**2. Brand — no name yet.** Ship `TBD` as the seeded default for `BRAND_NAME` and the
other text keys, with a neutral placeholder mark. Every one of them is operator-editable
from the console on day one. This is the strict reading of the white-label requirement:
nothing is a build-time constant, and a fresh install is expected to be rebranded before
launch rather than shipped as-is.

Practical consequence: the A4 sweep is not optional or cosmetic. If any of the 186
occurrences are missed, the product ships showing a stale `FortuneX` next to an operator's
own brand — which is more visibly broken than the placeholder would have been. The CI
grep in A4 is what enforces this.

## Open decisions — still needed

3. **Storage driver** — confirm the A0 recommendation (local disk behind a swappable
   driver). Proceeding on that assumption unless told otherwise.
4. **SVG logos** — reject, or accept with sanitising? Proceeding on *reject*; PNG plus
   server-side derivation covers every slot.
5. **Bundle budget** — hold or raise? Density actually helps here (fewer decorative
   assets), but the component library adds weight.
6. **Admin console depth.** Is wave 5 a full redesign, or a lighter pass so member-facing
   waves ship sooner?

---

## B6. Executing "dense terminal" without losing mobile members

The density choice is made, and the rest of the plan follows it. But the member audience
is predominantly on phones, and a literal desktop-terminal layout does not survive a
390px viewport — rows become unreadable, and horizontal scroll on a balance table is how
members mistrust a number.

So density is implemented as an **adaptive** property, not a fixed one. This keeps the
chosen direction intact where it pays off and degrades honestly where it would not:

- **Admin console (wave 5): full terminal.** This is the strongest case for the
  direction — operators work these screens all day, want many rows per screen, and are on
  desktops. Compact row height, tabular figures, keyboard navigation, saved filters,
  multi-pane layouts. Lean into it here hardest.
- **Member desktop: terminal.** Same density model, same dark-first treatment.
- **Member mobile: the same visual language at a different density.** Identical palette,
  type and components; tables become card-rows, multi-pane becomes stacked, tap targets
  stay at 44px. It reads as the same product, not a separate one.
- **A density token, not a hardcoded row height.** `--density-row`, `--density-pad` and
  friends switch at breakpoint, so the adaptation is one layer, not per-component
  guesswork.
- **Dark-first, light still supported.** The existing dual-theme architecture is already
  built and flash-free; discarding it would be throwing away working code. Dark becomes
  the default `data-theme`.
- **Tabular numerals become mandatory, not a nicety.** At terminal density, digits that
  shift width as values update are immediately visible as sloppiness.

This is a resolution of the mobile concern, not a reversal of the decision.

---

## Build log

### 2026-09-16 — A1–A3 written, unverified

Workstream A's backend and the metadata switchover are written. **Nothing has
been compiled, migrated or run**: this machine has no Node installation and
`node_modules` was never installed, so `tsc`, `prisma generate`, `prisma migrate`
and both test suites are all unavailable. Treat every file below as a first
draft that has not met a compiler.

**Backend**
- `core/brand-storage.ts` — public asset store. Content-addressed keys, 1MB cap,
  magic-byte verification, PNG/WebP/JPEG/ICO, SVG refused with its reason.
  Native header parsing for PNG/WebP/JPEG/ICO dimensions, so no image library.
- `prisma/schema.prisma` + `migrations/20260916100000_branding_assets` —
  `branding_assets`, one row per slot.
- `core/runtime-config.ts` — `Branding` group, six public settings, `email` and
  `color` setting types with validators, placeholder defaults, `branding` on
  `RuntimeConfig` including the `unset` flag.
- `modules/branding/` — service joining settings text to asset rows, a public
  `GET /brand` and an immutable `GET /brand/asset/:key`.
- `modules/admin/branding/` — overview, upload, clear. Behind `settings.view` /
  `settings.edit`; audited as `SETTING_CHANGE` with `entityType: 'branding'`.
- `app.ts` — a 2MB body parser for brand uploads only (base64 inflates the 1MB
  ceiling past the standard 1MB limit).
- `settings.service.ts` — drops the branding cache on every write and reset.

**Frontend**
- `lib/branding.ts`, `lib/branding.server.ts` — types, neutral fallback, server
  fetch. Deliberately separate from `platform-config.server.ts`.
- `app/brand-asset/[key]/route.ts` — same-origin proxy. A favicon cannot carry a
  token or follow CORS, and in development the API is on another port.
- `app/layout.tsx` — `generateMetadata()` replaces the static export; accent
  injected as `--brand-accent`, sanitised before interpolation.
- `providers/brand-provider.tsx` — context, no client fetch, no flash.
- `app/manifest.ts` — now async and brand-driven.
- **Deleted** `app/favicon.ico`, `app/icon.svg`, `app/apple-icon.png`. This is
  the change that lets an operator-set favicon win; while those files existed it
  could not.

### Known gaps, deliberate

- **iOS splash images stay build-time.** Twelve device-specific renders on a
  fixed navy plate. Generating them per operator needs an image pipeline this
  project does not have. They remain shipped assets.
- **The maskable PWA icon is not claimed for uploads.** A maskable icon is
  cropped to the launcher shape; artwork drawn without a safe zone loses its
  edges. The shipped maskable variant was drawn for it, an operator's upload
  was not.
- **A4 is not started.** 179 `FortuneX` occurrences remain across frontend and
  backend, including the six hardcoded `support@fortunex.com` literals and the
  email templates. Until that sweep runs, the feature is plumbing with no reach.

### Next, in order

1. Install Node 22, `npm install` both packages, then `prisma migrate deploy`,
   `npm run typecheck` and the test suites. Fix whatever the compiler says.
2. Seed the branding settings and a placeholder mark.
3. A4 — the sweep, plus the CI grep that stops it regressing.
4. A5 — the console's branding screen, with the "not configured" banner.

### 2026-09-16 — toolchain installed, A1–A3 verified

The machine had no Node at all, so the previous entry's code had never met a
compiler. It has now. See `05-local-setup.md` for what was installed and the
three non-obvious things that blocked it.

Both packages typecheck clean. `backend: npm test` 566 passed / 0 failed,
`frontend: npm test` 37 passed, production build succeeds, bundle budget passes
at 719.8 KB of 760 KB. Migrations applied; `branding_assets` exists.

A 35-check script drove the branding feature against the live API and found two
things:

- **One real defect.** `unset` was computed as "any placeholder still in
  force", while the plan documented "until `BRAND_NAME` is changed". Setting the
  brand name therefore left the banner up forever, because the tagline was still
  `TBD`. Fixed, and improved: `unset` now tracks the wordmark alone — the one
  field nothing can fall back to — and a new `placeholders: string[]` lists
  every field still on its default, so the console can show a checklist naming
  them rather than a banner saying "something is unconfigured".
- **One bad test of mine.** The oversize check uploaded a 900×900 solid-colour
  PNG, which deflates to about 2KB and never approached the 1MB cap — it passed
  while testing nothing. Now two checks with an incompressible fixture: one just
  over the cap that reaches `brand-storage` and returns its own message, and one
  far over that the 2MB express body limit rejects as 413 first.

Confirmed end to end in the rendered HTML at `localhost:3010`: `<title>`,
`og:site_name`, all three icon `<link>`s and `--brand-accent` follow the
operator's settings, and `manifest.webmanifest` carries the brand name, theme
colour and uploaded icon. Test data was reset afterwards; branding is back on
its shipped placeholders.

A4 remains the next piece of work, unchanged.
