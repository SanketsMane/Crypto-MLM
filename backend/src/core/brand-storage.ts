import crypto from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { badRequest } from './errors.js';

/**
 * Storage for the operator's brand assets — logo, icon, social card.
 *
 * This is the deliberate opposite of `document-storage.ts`. KYC files are
 * written outside the web root and are never served statically, because a
 * passport scan must not have a guessable URL. A logo has the reverse
 * requirement: it is fetched by every visitor on every page, including
 * unauthenticated ones, and it needs to be cacheable at the edge.
 *
 * So the two stay separate modules rather than one with a flag. What IS shared
 * is the part that has nothing to do with access: the size ceiling, the type
 * allowlist and the magic-byte check. An admin upload is still an upload, and
 * "trust the browser's Content-Type" is how you store a script under a name
 * that says PNG.
 *
 * ── Content addressing ───────────────────────────────────────────────────
 * The storage key contains a hash of the bytes, so changing the logo always
 * produces a NEW url. That is what lets the read route answer `immutable` with
 * a one-year max-age: a cache can never hold yesterday's logo, because
 * yesterday's logo lives at a different address. Without this the operator
 * changes their brand and members keep seeing the old one until a CDN expires
 * it — which, for a white-label product, is the whole feature failing quietly.
 *
 * The driver is swappable in the same way KYC's is: an S3 implementation
 * replaces the four functions below without a schema change or a call-site
 * edit.
 */

export const BRAND_DIR = process.env.BRAND_STORAGE_DIR
  ?? path.join(process.cwd(), 'storage', 'brand');

/**
 * Deliberately far below KYC's 8MB. These are logos: anything approaching a
 * megabyte is a mistake that would be paid for on every page load, by every
 * visitor, forever. Rejecting it here is kinder than serving it.
 */
const MAX_BYTES = 1024 * 1024;

const ALLOWED: Record<string, string> = {
  'image/png': 'png',
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/x-icon': 'ico',
};

/**
 * SVG is not on the list, and that is a security decision rather than an
 * oversight.
 *
 * An SVG is a document, not an image: it can carry `<script>`, `on*` handlers
 * and `<foreignObject>`. Served from our own origin — which a logo must be —
 * that is stored XSS with an admin-sized blast radius. Sanitising is possible
 * but is a parser arms race we would have to keep winning forever, and PNG
 * costs the operator nothing to export.
 */
const REFUSED_WITH_REASON: Record<string, string> = {
  'image/svg+xml':
    'SVG uploads are not accepted, because an SVG can carry script and would run on our own domain. '
    + 'Export the same artwork as a PNG — 512×512 or larger for an icon, or around 600px wide for a logo.',
};

export interface StoredAsset {
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
}

/** What each accepted type actually starts with on disk. */
const MAGIC: Record<string, (b: Buffer) => boolean> = {
  'image/png':    (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp':   (b) => b.length > 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  'image/jpeg':   (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/x-icon': (b) => b.length > 4 && b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01 && b[3] === 0x00,
};

/**
 * Pixel dimensions, read from the header bytes.
 *
 * There is no image library in this project and adding a native one (sharp)
 * to read two integers would be a poor trade. These are the header layouts;
 * they are fixed by the formats and are not going to move.
 *
 * Returns nulls rather than throwing on an unrecognised layout — dimensions
 * are used for operator guidance, so failing to read them must not fail an
 * otherwise valid upload.
 */
export function dimensions(mimeType: string, b: Buffer): { width: number | null; height: number | null } {
  const none = { width: null, height: null };
  try {
    if (mimeType === 'image/png') {
      // IHDR is the first chunk; width and height are big-endian at 16 and 20.
      if (b.length < 24) return none;
      return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
    }
    if (mimeType === 'image/x-icon') {
      // Byte 6 and 7 of the directory entry. 0 is how ICO encodes 256.
      if (b.length < 8) return none;
      return { width: b[6] === 0 ? 256 : b[6]!, height: b[7] === 0 ? 256 : b[7]! };
    }
    if (mimeType === 'image/webp') {
      const fourcc = b.subarray(12, 16).toString('ascii');
      // Simple lossy: 14 bytes in, then a 3-byte sync code, then 14-bit fields.
      if (fourcc === 'VP8 ' && b.length > 29) {
        return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
      }
      // Lossless: a 1-byte signature then two 14-bit fields, minus one.
      if (fourcc === 'VP8L' && b.length > 25) {
        const bits = b.readUInt32LE(21);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
      // Extended: 24-bit canvas size minus one, little-endian, at 24.
      if (fourcc === 'VP8X' && b.length > 30) {
        return {
          width: (b[24]! | (b[25]! << 8) | (b[26]! << 16)) + 1,
          height: (b[27]! | (b[28]! << 8) | (b[29]! << 16)) + 1,
        };
      }
      return none;
    }
    if (mimeType === 'image/jpeg') {
      // Walk the segment markers to SOFn, which carries the size.
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) { i += 1; continue; }
        const marker = b[i + 1]!;
        // SOF0..SOF15, excluding the non-frame markers DHT/JPG/DAC.
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
        }
        i += 2 + b.readUInt16BE(i + 2);
      }
      return none;
    }
  } catch {
    // A truncated or malformed header is the uploader's problem to see as a
    // bad-looking logo, not a 500.
    return none;
  }
  return none;
}

/** Verify the bytes are what the upload claims they are. */
export function assertContentMatches(mimeType: string, bytes: Buffer) {
  const check = MAGIC[mimeType];
  if (!check) throw badRequest(`Unsupported file type "${mimeType}"`);
  if (!check(bytes)) {
    throw badRequest(
      `That file is not a valid ${ALLOWED[mimeType]?.toUpperCase() ?? mimeType}. Re-export it and try again.`,
    );
  }
}

/** Reject anything that is not a brand image, before it ever touches the disk. */
export function assertAcceptable(mimeType: string, sizeBytes: number) {
  const refusal = REFUSED_WITH_REASON[mimeType];
  if (refusal) throw badRequest(refusal);

  if (!ALLOWED[mimeType]) {
    throw badRequest(`Unsupported file type "${mimeType}" — accepted: PNG, WebP, JPEG or ICO`);
  }
  if (sizeBytes <= 0) throw badRequest('The file is empty');
  if (sizeBytes > MAX_BYTES) {
    throw badRequest(
      `Brand images must be ${MAX_BYTES / 1024}KB or smaller — this one is `
      + `${Math.ceil(sizeBytes / 1024)}KB. Every visitor downloads it on every page.`,
    );
  }
}

export async function put(mimeType: string, bytes: Buffer): Promise<StoredAsset> {
  assertAcceptable(mimeType, bytes.byteLength);
  assertContentMatches(mimeType, bytes);

  await mkdir(BRAND_DIR, { recursive: true, mode: 0o755 });

  /* Content-addressed — see the header. Re-uploading identical bytes resolves
     to the same key and simply overwrites itself, which is the correct no-op. */
  const hash = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 32);
  const name = `${hash}.${ALLOWED[mimeType]}`;
  await writeFile(path.join(BRAND_DIR, name), bytes, { mode: 0o644 });

  return { storageKey: name, mimeType, sizeBytes: bytes.byteLength, ...dimensions(mimeType, bytes) };
}

/**
 * Resolve a stored key to a path, refusing anything that escapes the root.
 *
 * This route is public and takes the key from the URL, so it is the one place
 * a traversal attempt would arrive. Keys we mint are a hex hash plus a known
 * extension; anything else is rejected on shape before the path is even built.
 */
function resolveKey(storageKey: string): string {
  if (!/^[a-f0-9]{32}\.(png|webp|jpg|ico)$/.test(storageKey)) {
    throw badRequest('Invalid asset reference');
  }
  const full = path.resolve(BRAND_DIR, storageKey);
  if (!full.startsWith(path.resolve(BRAND_DIR) + path.sep)) throw badRequest('Invalid asset reference');
  return full;
}

export function exists(storageKey: string): boolean {
  try { return existsSync(resolveKey(storageKey)); } catch { return false; }
}

export function sizeOf(storageKey: string): number | null {
  try { return statSync(resolveKey(storageKey)).size; } catch { return null; }
}

export function readStream(storageKey: string): Readable {
  const full = resolveKey(storageKey);
  if (!existsSync(full)) throw badRequest('That brand asset is no longer available');
  return createReadStream(full);
}

export async function remove(storageKey: string): Promise<void> {
  try { await unlink(resolveKey(storageKey)); } catch { /* already gone */ }
}

/** The public URL for a stored key. Relative, so it works on any host. */
export const urlFor = (storageKey: string) => `/api/v1/brand/asset/${storageKey}`;
