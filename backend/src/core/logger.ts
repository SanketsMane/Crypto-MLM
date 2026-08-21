import pino from 'pino';
import { env } from '../config/env.js';
import { currentContext } from '../middleware/request-context.js';

/**
 * Every line carries the correlation id of the request that caused it, pulled
 * from async local storage rather than passed in, so a service or a job does
 * not have to thread it through to be traceable.
 */
export const logger = pino({
  level: env.isProd ? 'info' : 'debug',
  transport: env.isProd ? undefined : { target: 'pino-pretty', options: { colorize: true } },
  mixin() {
    const ctx = currentContext();
    if (!ctx) return {};
    return { requestId: ctx.requestId, actorType: ctx.actorType, actorId: ctx.actorId };
  },
});
