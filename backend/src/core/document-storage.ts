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
