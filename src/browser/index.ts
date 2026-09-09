/**
 * rezilia/browser — CDN build entry for plain HTML + JS projects
 *
 * Exposes window.rezilia with:
 *   - SmartRetry   — retry with exponential backoff + circuit breaker
 *   - SmartCache   — singleflight cache stampede prevention (in-memory)
 *   - BrowserLogger — structured JSON logger (browser-compatible)
 *   - CircuitBreaker, RetryExhaustedError, TimeoutError, CircuitOpenError
 *
 * CDN usage (jsDelivr):
 *   <script src="https://cdn.jsdelivr.net/npm/rezilia/dist/browser/rezilia.min.js"></script>
 *
 * CDN usage (unpkg):
 *   <script src="https://unpkg.com/rezilia/dist/browser/rezilia.min.js"></script>
 *
 * @example
 * const { SmartRetry, SmartCache, BrowserLogger } = window.rezilia;
 *
 * const retry = new SmartRetry({ attempts: 3, baseDelay: 500 });
 * const data = await retry.execute(() => fetch('/api').then(r => r.json()));
 *
 * const cache = new SmartCache({ defaultTtl: 60_000 });
 * const user = await cache.get('user:42', () =>
 *   fetch('/api/user/42').then(r => r.json())
 * );
 *
 * const logger = new BrowserLogger({ service: 'my-app', pretty: true });
 * logger.setContext({ userId: 'u_42' });
 * logger.info('Page loaded');
 */

// Retry + Circuit Breaker (pure JS — fully browser compatible)
export {
  SmartRetry,
  retry,
  CircuitBreaker,
  RetryExhaustedError,
  TimeoutError,
  CircuitOpenError,
} from '../retry/index.js';

export type { SmartRetryOptions, CircuitBreakerOptions, CircuitState } from '../retry/index.js';

// Cache — MemoryStore only (no Redis in browser)
export { SmartCache, MemoryStore } from '../cache/index.js';
export type { SmartCacheOptions, GetOptions } from '../cache/index.js';

// Logger — browser-compatible version (no AsyncLocalStorage)
export { BrowserLogger } from './browser-logger.js';
export type { BrowserLoggerOptions, LogLevel, LogContext } from './browser-logger.js';
