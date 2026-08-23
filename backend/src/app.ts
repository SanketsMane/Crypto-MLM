import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import routes from './routes/index.js';
import { apiLimiter } from './middleware/rate-limit.js';
import { requestContext } from './middleware/request-context.js';
import { maintenanceGate, maintenanceHeader } from './middleware/maintenance.js';
import { asyncHandler } from './middleware/async-handler.js';
import * as health from './modules/health/health.controller.js';
import { metrics } from './middleware/metrics.js';
import { registry } from './core/metrics.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { logger } from './core/logger.js';
import { env } from './config/env.js';

export function createApp() {
  const app = express();

  /**
   * Trust exactly as many proxy hops as are actually deployed.
   *
   * `req.ip` feeds the rate limiter, the audit log, the member activity trail
   * and the admin IP allowlist. Behind a proxy with this unset, all four see
   * the proxy's address instead of the client's — so the limiter throttles
   * everyone as one, the logs record nothing useful, and the allowlist either
   * admits every address or none.
   *
   * A number rather than `true`: trusting the whole chain lets a client prepend
   * a forged X-Forwarded-For entry and choose the address the allowlist checks.
   */
  app.set('trust proxy', env.TRUST_PROXY_HOPS);

  /* No ETags on the API.
     Express fingerprints every JSON body and answers conditional requests with
     a 304 and no body. For a per-user authenticated payload that is worse than
     useless: `/admin/me` revalidates, the client is handed an empty body, and
     the console ends up with no permission set at all. The bandwidth saved on a
     few hundred bytes of JSON is not worth a class of bug this quiet. */
  app.set('etag', false);

  app.use(requestContext);
  app.use(helmet());
  // In production only the configured web origin is allowed. In development we
  // also accept other local origins (a second port, a container host) so tooling
  // and preview builds can talk to the API without editing config.
  /**
   * Development also trusts the private network.
   *
   * The web app derives the API origin from `window.location`, so a phone on
   * the same wifi asks for `http://192.168.x.x:4000` and sends a matching
   * Origin header. Allowing only localhost meant every request from a real
   * device was refused by CORS — which is exactly when you most want to look
   * at the thing on a real device.
   *
   * Ranges only, and only outside production: RFC 1918 plus `.local` for mDNS.
   * A public origin is still refused in development, and in production the
   * allowlist remains a single configured URL.
   */
  const PRIVATE_ORIGIN =
    /^https?:\/\/(localhost|127\.0\.0\.1|host\.docker\.internal|[\w-]+\.local|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/;

  app.use(cors({
    credentials: true,
    origin: (origin, cb) => {
      if (!origin || origin === env.WEB_URL) return cb(null, true);
      if (!env.isProd && PRIVATE_ORIGIN.test(origin)) return cb(null, true);
      cb(new Error(`Origin not allowed: ${origin}`));
    },
  }));
  /**
   * 1MB is the right ceiling for an API whose payloads are all small JSON —
   * it keeps a hostile body from ever reaching a handler.
   *
   * KYC is the one exception: documents arrive base64-encoded (a third larger
   * than the file) and a submission can carry four of them. Because this
   * parser runs before any router, a route-level limit further down would
   * never be reached — the body is already parsed and rejected here. So the
   * exception has to be made at the point the decision is taken.
   */
  /**
   * The exact bytes, kept for signature checks.
   *
   * A gateway signs the raw request body. Once `express.json` has parsed and
   * discarded it, re-serialising `req.body` gives back *a* JSON string but not
   * necessarily *the* one that was signed — key order, spacing and unicode
   * escaping are all free to differ, and the HMAC then fails for reasons that
   * look like a configuration problem. So the buffer is captured on the way
   * through and handed to the verifier untouched.
   */
  const keepRaw = (req: express.Request, _res: express.Response, buf: Buffer) => {
    if (buf?.length) (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
  };

  const standardJson = express.json({ limit: '1mb', verify: keepRaw });
  const documentJson = express.json({ limit: '40mb', verify: keepRaw });
  const isDocumentUpload = (req: express.Request) =>
    req.method === 'POST' && /^\/api\/v1\/kyc\/?$/.test(req.path);

  /**
   * Authenticated responses must never be cached by anything shared.
   *
   * Express adds an ETag to every JSON response and sets no Cache-Control, and
   * the only `Vary` in play is `Origin` — so nothing downstream knows that the
   * body depends on who asked. A browser, proxy or CDN is then free to serve
   * one operator's `/admin/me` (their identity AND their permission set) to the
   * next one. That is exactly what happened here: a support agent was handed a
   * super-admin's permissions and the console rendered the full nav for them.
   *
   * Anything carrying credentials is marked private and uncacheable, and
   * `Vary: Authorization` is added so a cache that ignores the first hint still
   * keys on the token. Unauthenticated endpoints (`/config`) set their own
   * caching afterwards and are unaffected.
   */
  app.use((req, res, next) => {
    if (req.headers.authorization || req.headers.cookie) {
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      res.setHeader('Vary', 'Origin, Authorization');
    }
    next();
  });

  app.use((req, res, next) => (isDocumentUpload(req) ? documentJson : standardJson)(req, res, next));
  app.use(pinoHttp({
    logger,
    autoLogging: !env.isProd,
    genReqId: (req) => req.id ?? (req as { requestId?: string }).requestId ?? '',
  }));
  /**
   * Probes are mounted ahead of the rate limiter and the maintenance gate.
   *
   * An orchestrator polls these every few seconds from one address. Behind the
   * limiter it would eventually be throttled, the probe would fail, and the
   * container would be killed for being "unhealthy" while serving fine. And a
   * platform in maintenance is still a platform that must answer whether it is
   * alive — otherwise the deploy that enabled maintenance mode cannot finish.
   */
  /**
   * Metrics, ahead of the limiter for the same reason as the probes — a
   * scraper polls on a fixed interval from one address.
   *
   * Not exposed publicly in a real deployment: bind it to an internal network,
   * or put it behind the reverse proxy's allowlist. It reports member counts
   * and platform liability, which is nobody else's business.
   */
  app.get('/api/v1/metrics', asyncHandler(async (_req, res) => {
    res.set('Content-Type', registry.contentType);
    res.send(await registry.metrics());
  }));

  app.get('/api/v1/health', health.live);
  app.get('/api/v1/ready', asyncHandler(health.ready));

  app.use('/api/v1', metrics, apiLimiter, maintenanceHeader, maintenanceGate, routes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
