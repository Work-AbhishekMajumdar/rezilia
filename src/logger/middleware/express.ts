import { randomUUID } from 'node:crypto';
import type { SmartLogger } from '../SmartLogger.js';

/**
 * Minimal Express-compatible types — avoids hard dependency on @types/express.
 */
interface Request {
  headers: Record<string, string | string[] | undefined>;
  method: string;
  url: string;
  [key: string]: unknown;
}

interface Response {
  statusCode: number;
  on(event: string, listener: () => void): void;
  setHeader(name: string, value: string): void;
  [key: string]: unknown;
}

type NextFunction = () => void;

/**
 * Express middleware that:
 * 1. Attaches a requestId to every incoming request (from header or generated).
 * 2. Runs the rest of the chain inside a logging context — so every log
 *    call inside a request handler automatically includes the requestId.
 * 3. Logs request start and completion with duration.
 *
 * @example
 * import express from 'express';
 * import { SmartLogger } from 'rezilia/logger';
 * import { requestLogger } from 'rezilia/logger/middleware/express';
 *
 * const app = express();
 * const logger = new SmartLogger({ serviceName: 'api' });
 * app.use(requestLogger(logger));
 */
export function requestLogger(logger: SmartLogger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId =
      (Array.isArray(req.headers['x-request-id'])
        ? req.headers['x-request-id'][0]
        : req.headers['x-request-id']) ?? randomUUID();

    const startedAt = Date.now();

    // Expose requestId to the client
    res.setHeader('x-request-id', requestId);

    logger.runWithContext({ requestId }, () => {
      logger.info('Request started', { method: req.method, url: req.url });

      res.on('finish', () => {
        const duration = Date.now() - startedAt;
        const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
        logger[level]('Request completed', {
          method: req.method,
          url: req.url,
          status: res.statusCode,
          durationMs: duration,
        });
      });

      next();
    });
  };
}
