/**
 * Cache store interface — implement this to use any backend (Redis, Memcached, etc.)
 */
export interface CacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Options for SmartCache
 */
export interface SmartCacheOptions {
  /** Default TTL in milliseconds (default: 60_000 = 1 minute) */
  defaultTtl?: number;
  /**
   * TTL jitter factor 0–1 (default: 0.1 = ±10%)
   * Prevents cache stampede by randomising expiry times
   */
  jitterFactor?: number;
  /** Enable stale-while-revalidate pattern (default: true) */
  staleWhileRevalidate?: boolean;
  /**
   * How long to serve stale data while revalidating (ms, default: 5_000)
   * Only used when staleWhileRevalidate is true
   */
  staleTtl?: number;
  /** Backing store — defaults to in-memory LRU */
  store?: CacheStore;
}

/**
 * Per-key get options
 */
export interface GetOptions {
  /** Override default TTL for this key (ms) */
  ttl?: number;
  /** Override jitter factor for this key */
  jitterFactor?: number;
}

/**
 * Cache entry stored internally
 */
export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  staleUntil: number;
}
