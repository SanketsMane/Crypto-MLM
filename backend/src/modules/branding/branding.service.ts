import type { Request } from 'express';
import { prisma } from '../../core/db.js';
import { badRequest } from '../../core/errors.js';
import { config } from '../../core/runtime-config.js';
import * as storage from '../../core/brand-storage.js';
import * as audit from '../admin/audit/audit.service.js';

/**
 * The operator's brand, resolved.
 *
 * Text comes from `runtime-config` (the settings table, with its validation
 * and audit already in place); artwork comes from `branding_assets`. This
 * module is the one place that joins the two, so no caller has to know the
 * split exists.
 *
 * Deliberately NOT folded into `PublicConfig`. The root layout of both apps
 * needs the brand on every single render, and `PublicConfig` carries the whole
 * plan catalogue — packages, 33 commission rules, ranks, tiers. Bundling them
 * would make every page pull the compensation plan in order to draw a logo.
 * Two small documents, each cached on its own terms, beats one large one.
 */

/**
 * The slots a deployment can fill.
 *
 * A fixed list rather than free-form keys: the frontend renders specific slots
 * in specific places, so an operator inventing "logo-mobile" would upload a
 * file that nothing ever displays.
 */
export const SLOTS = ['logo-light', 'logo-dark', 'icon', 'og-image'] as const;
export type Slot = (typeof SLOTS)[number];

export const SLOT_GUIDANCE: Record<Slot, string> = {
  'logo-light': 'Shown on light surfaces. Wide mark, around 600×160, transparent PNG.',
  'logo-dark': 'Shown on the sidebar and dark surfaces. Same dimensions as the light logo, light-coloured artwork.',
  'icon': 'The favicon, home-screen icon and PWA icon. Square, 512×512 PNG — it gets scaled down to 16px, so keep it simple.',
  'og-image': 'The social sharing card. 1200×630 PNG or JPEG.',
};

const isSlot = (s: string): s is Slot => (SLOTS as readonly string[]).includes(s);

export interface BrandAsset {
  slot: Slot;
  url: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  updatedAt: Date;
}

export interface Branding {
  name: string;
  tagline: string;
  legalName: string;
  supportEmail: string;
  supportUrl: string | null;
  primaryColor: string;
  /** True while any text value is still the shipped placeholder. */
  unset: boolean;
  /** Null for any slot with nothing uploaded — the caller falls back. */
  assets: Record<Slot, string | null>;
}

/**
 * Cached alongside the public config it is served with.
 *
 * Read on every page load of both apps, and changes perhaps twice in the life
 * of a deployment.
 */
const TTL_MS = 30_000;
let cache: { at: number; value: Branding } | null = null;

export const invalidateBranding = () => { cache = null; };

export async function branding(): Promise<Branding> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;

  const [cfg, rows] = await Promise.all([
    config(),
    prisma.brandingAsset.findMany(),
  ]);

  const assets = Object.fromEntries(SLOTS.map((s) => [s, null])) as Record<Slot, string | null>;
  for (const row of rows) {
    if (isSlot(row.slot)) assets[row.slot] = storage.urlFor(row.storageKey);
  }

  const value: Branding = { ...cfg.branding, assets };
  cache = { at: Date.now(), value };
  return value;
}

/** Every uploaded asset with its metadata, for the console's branding screen. */
export async function assets(): Promise<BrandAsset[]> {
  const rows = await prisma.brandingAsset.findMany({ orderBy: { slot: 'asc' } });
  return rows.filter((r) => isSlot(r.slot)).map((r) => ({
    slot: r.slot as Slot,
    url: storage.urlFor(r.storageKey),
    mimeType: r.mimeType,
    sizeBytes: r.sizeBytes,
    width: r.width,
    height: r.height,
    updatedAt: r.updatedAt,
  }));
}

/** Resolve a slot to the stored key the public route should stream. */
export async function keyFor(slot: string): Promise<string | null> {
  if (!isSlot(slot)) return null;
  const row = await prisma.brandingAsset.findUnique({ where: { slot } });
  return row?.storageKey ?? null;
}

export interface UploadInput {
  slot: string;
  mimeType: string;
  /** Base64, matching how KYC submissions arrive — no multipart parser here. */
  data: string;
}

export async function upload(adminId: string, input: UploadInput, req?: Request): Promise<BrandAsset> {
  if (!isSlot(input.slot)) {
    throw badRequest(`Unknown brand slot "${input.slot}" — expected one of: ${SLOTS.join(', ')}`);
  }
  const slot: Slot = input.slot;

  const bytes = Buffer.from(input.data, 'base64');
  /* Validated and written before the row is touched, so a rejected upload
     leaves the previous logo in place rather than a row pointing at nothing. */
  const stored = await storage.put(input.mimeType, bytes);

  /* An icon that is not square gets letterboxed or squashed by the browser at
     16px, where there is nothing left to read. Caught here because the
     operator can still fix it; a warning after the fact would not be seen. */
  if (slot === 'icon' && stored.width && stored.height && stored.width !== stored.height) {
    await storage.remove(stored.storageKey);
    throw badRequest(
      `The icon must be square — this one is ${stored.width}×${stored.height}. `
      + 'Browsers scale it to 16px, and a rectangle gets squashed. Export it at 512×512.',
    );
  }

  const before = await prisma.brandingAsset.findUnique({ where: { slot } });

  const row = await prisma.brandingAsset.upsert({
    where: { slot },
    create: {
      slot,
      storageKey: stored.storageKey,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      width: stored.width,
      height: stored.height,
      uploadedBy: adminId,
    },
    update: {
      storageKey: stored.storageKey,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      width: stored.width,
      height: stored.height,
      uploadedBy: adminId,
    },
  });

  /* Only after the row is committed, and only if the bytes actually differ —
     content addressing means re-uploading the same image resolves to the same
     key, and deleting it would delete the file we just pointed the row at. */
  if (before && before.storageKey !== stored.storageKey) {
    await storage.remove(before.storageKey);
  }

  invalidateBranding();

  await audit.record({
    /* SETTING_CHANGE rather than a new enum member: this IS a settings change,
       and `entityType` already separates it from the key/value table. A new
       member would cost a migration to say nothing the entity type does not. */
    adminId, action: 'SETTING_CHANGE', entityType: 'branding', entityId: slot,
    summary: before
      ? `Replaced the ${slot} image (${stored.width ?? '?'}×${stored.height ?? '?'}, ${Math.ceil(stored.sizeBytes / 1024)}KB)`
      : `Uploaded the ${slot} image (${stored.width ?? '?'}×${stored.height ?? '?'}, ${Math.ceil(stored.sizeBytes / 1024)}KB)`,
    before: before ? { storageKey: before.storageKey, sizeBytes: before.sizeBytes } : undefined,
    after: { storageKey: stored.storageKey, sizeBytes: stored.sizeBytes },
    req,
  });

  return {
    slot, url: storage.urlFor(row.storageKey), mimeType: row.mimeType,
    sizeBytes: row.sizeBytes, width: row.width, height: row.height, updatedAt: row.updatedAt,
  };
}

/** Remove an uploaded asset, falling the slot back to the shipped default. */
export async function clear(adminId: string, slot: string, req?: Request) {
  if (!isSlot(slot)) throw badRequest(`Unknown brand slot "${slot}"`);

  const before = await prisma.brandingAsset.findUnique({ where: { slot } });
  if (!before) return { slot, cleared: false };

  await prisma.brandingAsset.delete({ where: { slot } });
  await storage.remove(before.storageKey);

  invalidateBranding();

  await audit.record({
    adminId, action: 'SETTING_CHANGE', entityType: 'branding', entityId: slot,
    summary: `Removed the ${slot} image — the slot falls back to the shipped default`,
    before: { storageKey: before.storageKey }, after: undefined, req,
  });

  return { slot, cleared: true };
}
