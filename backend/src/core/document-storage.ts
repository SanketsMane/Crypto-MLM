import crypto from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { badRequest } from './errors.js';

/**
 * Storage for identity documents.
 *
 * KYC files are among the most sensitive things this platform holds, so the
 * database never stores the bytes — only an opaque `storageKey`. That keeps the
 * driver swappable: the local-disk implementation below is the default for
 * self-hosting, and an S3/GCS driver can replace it without a schema change or
 * a single call-site edit.
 *
 * Files are written outside the web root and are never served statically. The
 * only way to read one is the authenticated, permission-gated admin endpoint,
 * which streams it — there is no guessable public URL.
 */

export const KYC_DIR = process.env.KYC_STORAGE_DIR
  ?? path.join(process.cwd(), 'storage', 'kyc');

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

export interface StoredDocument {
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * What each accepted type actually starts with on disk.
 *
 * The declared MIME type comes from the browser, which means it comes from
 * whoever is uploading. Trusting it stores arbitrary bytes under a name that
 * says "image" — so the first few bytes are checked against the claim before
 * anything is written.
 */
const MAGIC: Record<string, (b: Buffer) => boolean> = {
  'image/jpeg': (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png':  (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (b) => b.length > 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  'application/pdf': (b) => b.length > 5 && b.subarray(0, 5).toString('ascii') === '%PDF-',
};

/**
 * Verify the bytes are what the upload claims they are.
 *
 * Separate from `assertAcceptable` because the size/type check can run on
 * metadata alone, while this needs the payload.
 */
export function assertContentMatches(mimeType: string, bytes: Buffer) {
  const check = MAGIC[mimeType];
  if (!check) throw badRequest(`Unsupported file type "${mimeType}"`);
  if (!check(bytes)) {
    throw badRequest(
      `That file is not a valid ${ALLOWED[mimeType]?.toUpperCase() ?? mimeType}. `
      + 'Re-export it and try again.',
    );
  }
}

/** Reject anything that is not a document, before it ever touches the disk. */
export function assertAcceptable(mimeType: string, sizeBytes: number) {
  if (!ALLOWED[mimeType]) {
    throw badRequest(`Unsupported file type "${mimeType}" — accepted: JPEG, PNG, WebP or PDF`);
  }
  if (sizeBytes <= 0) throw badRequest('The file is empty');
  if (sizeBytes > MAX_BYTES) throw badRequest(`Files must be ${MAX_BYTES / 1024 / 1024}MB or smaller`);
}

export async function put(userId: string, mimeType: string, bytes: Buffer): Promise<StoredDocument> {
  assertAcceptable(mimeType, bytes.byteLength);
  assertContentMatches(mimeType, bytes);

  // Partition by user so one member's documents never mix with another's, and
  // randomise the filename so a key cannot be guessed from what is known.
  const dir = path.join(KYC_DIR, userId);
  await mkdir(dir, { recursive: true, mode: 0o700 });

  const name = `${crypto.randomBytes(16).toString('hex')}.${ALLOWED[mimeType]}`;
  await writeFile(path.join(dir, name), bytes, { mode: 0o600 });

  return { storageKey: path.posix.join(userId, name), mimeType, sizeBytes: bytes.byteLength };
}

/** Resolve a stored key to a path, refusing anything that escapes the root. */
function resolveKey(storageKey: string): string {
  const full = path.resolve(KYC_DIR, storageKey);
  if (!full.startsWith(path.resolve(KYC_DIR) + path.sep)) throw badRequest('Invalid document reference');
  return full;
}

export function readStream(storageKey: string): Readable {
  const full = resolveKey(storageKey);
  if (!existsSync(full)) throw badRequest('Document is no longer available');
  return createReadStream(full);
}

export async function remove(storageKey: string): Promise<void> {
  try { await unlink(resolveKey(storageKey)); } catch { /* already gone */ }
}
