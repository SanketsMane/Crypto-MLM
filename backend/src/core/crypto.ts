import crypto from 'node:crypto';
import { env } from '../config/env.js';

/**
 * Encryption at rest for the handful of secrets the platform must be able to
 * read back — today, TOTP seeds and the hot wallet key.
 *
 * A password is hashed because nobody ever needs the original. A TOTP seed is
 * different: verifying a code requires the seed itself, so it has to be
 * recoverable, and storing it in plaintext would mean a database leak lets the
 * reader generate valid second factors for every account. AES-256-GCM keeps it
 * unreadable and, because it is authenticated, also unmodifiable.
 *
 * The key is derived from ENCRYPTION_KEY rather than used raw, so an operator
 * can supply a passphrase of any length and still get a correct 32-byte key.
 */

const KEY = crypto.createHash('sha256').update(env.ENCRYPTION_KEY).digest();
const IV_BYTES = 12;
const VERSION = 'v1';

/** Returns `v1.<iv>.<tag>.<ciphertext>`, all base64url. */
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), enc.toString('base64url')].join('.');
}

export function decrypt(payload: string): string {
  const [version, iv, tag, data] = payload.split('.');
  if (version !== VERSION || !iv || !tag || !data) {
    throw new Error('Malformed ciphertext');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}

/**
 * Constant-time comparison of two secrets.
 *
 * `===` on a code leaks how many leading characters were right through timing,
 * which over enough attempts is enough to recover it.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/** SHA-256, for values we only ever need to look up or compare, never read. */
export const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

/** A numeric one-time code, drawn from a CSPRNG and free of modulo bias. */
export function numericCode(digits = 6): string {
  const max = 10 ** digits;
  const limit = Math.floor(0xff_ff_ff_ff / max) * max;
  let n: number;
  do {
    n = crypto.randomBytes(4).readUInt32BE(0);
  } while (n >= limit);
  return String(n % max).padStart(digits, '0');
}
