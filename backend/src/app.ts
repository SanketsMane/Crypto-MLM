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

  app.use(requestContext);
  app.use(helmet());
  // In production only the configured web origin is allowed. In development we
  // also accept other local origins (a second port, a container host) so tooling
  // and preview builds can talk to the API without editing config.
  app.use(cors({
    credentials: true,
    origin: (origin, cb) => {
      if (!origin || origin === env.WEB_URL) return cb(null, true);
      if (!env.isProd && /^https?:\/\/(localhost|127\.0\.0\.1|host\.docker\.internal)(:\d+)?$/.test(origin)) {
        return cb(null, true);
      }
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
  const standardJson = express.json({ limit: '1mb' });
  const documentJson = express.json({ limit: '40mb' });
  const isDocumentUpload = (req: express.Request) =>
    req.method === 'POST' && /^\/api\/v1\/kyc\/?$/.test(req.path);

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
