/**
 * rezilia — The ultimate backend resilience toolkit for Node.js
 *
 * Modules:
 * - `SmartCache`  — Cache stampede prevention, stale-while-revalidate, TTL jitter
 * - `SmartLogger` — Async context propagation, auto-redaction, structured JSON logs
 * - `SmartRetry`  — Exponential backoff, circuit breaker, per-attempt timeout
 *
 * @example
 * import { SmartCache, SmartLogger, SmartRetry, retry } from 'rezilia';
 *
 * @example Tree-shakeable imports (recommended):
 * import { SmartCache } from 'rezilia/cache';
 * import { SmartLogger } from 'rezilia/logger';
 * import { retry } from 'rezilia/retry';
 */

// Cache
export { SmartCache, MemoryStore, RedisStore } from './cache/index.js';
export type { CacheStore, SmartCacheOptions, GetOptions } from './cache/index.js';

// Logger
export { SmartLogger, requestLogger } from './logger/index.js';
export type { LogLevel, LogContext, LogEntry, Transport, SmartLoggerOptions } from './logger/index.js';

// Retry
export { SmartRetry, retry, CircuitBreaker, RetryExhaustedError, TimeoutError, CircuitOpenError } from './retry/index.js';
export type { SmartRetryOptions, CircuitBreakerOptions, CircuitState } from './retry/index.js';
