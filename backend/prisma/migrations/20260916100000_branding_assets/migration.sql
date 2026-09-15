-- Operator-settable brand artwork.
--
-- Only the metadata lives here. The bytes are held by core/brand-storage.ts so
-- the storage driver stays swappable (local disk today, object storage later)
-- without a schema change — the same split KYC documents already use.
--
-- `storageKey` is content-addressed, which is what lets the public read route
-- serve these with a one-year immutable cache: new artwork is a new key, so a
-- CDN can never hold a stale logo.
CREATE TABLE "branding_assets" (
  "id"         TEXT NOT NULL,
  "slot"       TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "mimeType"   TEXT NOT NULL,
  "sizeBytes"  INTEGER NOT NULL,
  "width"      INTEGER,
  "height"     INTEGER,
  "uploadedBy" TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,

  CONSTRAINT "branding_assets_pkey" PRIMARY KEY ("id")
);

-- One row per slot: replacing a logo is an upsert, never an insert that leaves
-- the previous row behind to be picked up by whichever query sorted first.
CREATE UNIQUE INDEX "branding_assets_slot_key" ON "branding_assets"("slot");
