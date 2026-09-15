import type { Request, Response } from 'express';
import { notFound } from '../../core/errors.js';
import * as storage from '../../core/brand-storage.js';
import * as service from './branding.service.js';

/**
 * The brand, public and unauthenticated.
 *
 * It has to be: the login page, the public site and the social card preview
 * all render the logo and the name before anyone has a session. There is
 * nothing here a visitor cannot already see by loading the home page.
 */
export const publicBranding = async (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  res.json({ success: true, data: await service.branding() });
};

/**
 * Stream a brand image.
 *
 * `immutable` with a one-year max-age is safe *because* the key is a hash of
 * the bytes — new artwork is a new URL, so no cache can be holding a stale
 * logo. The one-minute cache on the document above is what propagates the new
 * URL; this route never needs to expire.
 */
export const asset = async (req: Request, res: Response) => {
  const key = String(req.params.key);
  if (!storage.exists(key)) throw notFound('That brand asset is no longer available');

  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('Content-Type', MIME_BY_EXT[key.split('.').pop() ?? ''] ?? 'application/octet-stream');
  /* Belt and braces: the allowlist above already makes an HTML or SVG response
     impossible, but a browser that sniffs its way to one anyway would be
     executing it on our origin. */
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const size = storage.sizeOf(key);
  if (size !== null) res.setHeader('Content-Length', String(size));

  /* A stream that fails mid-flight is past the point where `asyncHandler` can
     turn it into a JSON error — the headers have already gone. Destroying the
     response is the only honest ending; the alternative is a socket that hangs
     until the client times out. */
  const file = storage.readStream(key);
  file.on('error', () => { res.destroy(); });
  file.pipe(res);
};

/** Derived from the extension, which `resolveKey` has already constrained. */
const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  webp: 'image/webp',
  jpg: 'image/jpeg',
  ico: 'image/x-icon',
};

