import { MemoryStore } from './stores/MemoryStore.js';
import type { CacheStore, SmartCacheOptions, GetOptions, CacheEntry } from './types.js';

/**
 * SmartCache — eliminates the two hardest caching problems in Node.js:
 *
 * 1. **Cache Stampede** (a.k.a. thundering herd): when a hot key expires,
 *    thousands of requests hit the database simultaneously. SmartCache uses
 *    the *singleflight* pattern — only ONE request fetches; the rest wait
 *    and share the result.
 *
 * 2. **Stale-While-Revalidate**: instead of blocking on a cache miss, serve
 *    the stale value instantly and refresh in the background.
 *
 * @example
 * const cache = new SmartCache({ defaultTtl: 60_000 });
 *
 * const user = await cache.get('user:42', () => db.findUser(42));
 * // Second call returns from cache instantly — no DB hit.
 */
export class SmartCache {
  private readonly store: CacheStore;
  private readonly defaultTtl: number;
  private readonly jitterFactor: number;
  private readonly staleWhileRevalidate: boolean;
  private readonly staleTtl: number;

  /** In-flight requests — key → pending Promise (singleflight map) */
  private readonly inflight = new Map<string, Promise<unknown>>();

  /** Local in-process cache — avoids JSON parse on every hit */
  private readonly localCache = new Map<string, CacheEntry<unknown>>();

  constructor(options: SmartCacheOptions = {}) {
    this.store = options.store ?? new MemoryStore();
    this.defaultTtl = options.defaultTtl ?? 60_000;
    this.jitterFactor = this.validateJitter(options.jitterFactor ?? 0.1);
    this.staleWhileRevalidate = options.staleWhileRevalidate ?? true;
    this.staleTtl = options.staleTtl ?? 5_000;
  }

  /**
   * Get a value from cache, or call `fetcher` to populate it.
   *
   * - Concurrent calls with the same key share ONE fetcher call (singleflight).
   * - Stale values are served immediately while a background refresh runs.
   *
   * @param key   Cache key
   * @param fetcher Function that returns the fresh value (called at most once per stampede window)
   * @param options Per-key TTL / jitter overrides
   */
  async get<T>(key: string, fetcher: () => Promise<T>, options: GetOptions = {}): Promise<T> {
    this.validateKey(key);

    const ttl = options.ttl ?? this.defaultTtl;
    const jitter = options.jitterFactor ?? this.jitterFactor;
    const now = Date.now();

    // 1. Check local in-process cache first (fast path — no async)
    const local = this.localCache.get(key) as CacheEntry<T> | undefined;
    if (local) {
      if (now < local.expiresAt) return local.value;

      // Stale-while-revalidate: serve stale immediately, refresh in background
      if (this.staleWhileRevalidate && now < local.staleUntil) {
        void this.revalidate(key, fetcher, ttl, jitter);
        return local.value;
      }
    }

    // 2. Check backing store (handles multi-instance / Redis)
    const stored = await this.store.get(key);
    if (stored !== null) {
      const parsed = JSON.parse(stored) as CacheEntry<T>;
      if (now < parsed.expiresAt) {
        this.localCache.set(key, parsed); // warm local cache
        return parsed.value;
      }

      if (this.staleWhileRevalidate && now < parsed.staleUntil) {
        this.localCache.set(key, parsed);
        void this.revalidate(key, fetcher, ttl, jitter);
        return parsed.value;
      }
    }

    // 3. Cache miss — use singleflight to prevent stampede
    return this.singleflight(key, fetcher, ttl, jitter);
  }

  /**
   * Explicitly set a value in cache.
   */
  async set<T>(key: string, value: T, options: GetOptions = {}): Promise<void> {
    this.validateKey(key);
    const ttl = options.ttl ?? this.defaultTtl;
    const jitter = options.jitterFactor ?? this.jitterFactor;
    await this.writeToStore(key, value, ttl, jitter);
  }

  /**
   * Delete a key from cache.
   */
  async invalidate(key: string): Promise<void> {
    this.validateKey(key);
    this.localCache.delete(key);
    await this.store.delete(key);
  }

  /**
   * Clear all cached values.
   */
  async clear(): Promise<void> {
    this.localCache.clear();
    await this.store.clear();
  }

  /** Returns number of in-flight requests (useful for monitoring) */
  get inflightCount(): number {
    return this.inflight.size;
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Singleflight: if there's already a fetch in progress for this key,
   * return that same promise. Otherwise start a new one.
   */
  private singleflight<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number,
    jitter: number,
  ): Promise<T> {
    const existing = this.inflight.get(key);
    if (existing) return existing as Promise<T>;

    const promise = (async () => {
      try {
        const value = await fetcher();
        await this.writeToStore(key, value, ttl, jitter);
        return value;
      } finally {
        this.inflight.delete(key);
      }
    })();

    this.inflight.set(key, promise);
    return promise;
  }

  /**
   * Background revalidation for stale-while-revalidate.
   * Errors are swallowed so they don't surface to the caller.
   */
  private async revalidate<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number,
    jitter: number,
  ): Promise<void> {
    // Avoid multiple concurrent revalidations for the same key
    if (this.inflight.has(key)) return;

    const promise = (async () => {
      try {
        const value = await fetcher();
        await this.writeToStore(key, value, ttl, jitter);
      } catch {
        // Revalidation failure is non-fatal — stale value was already returned
      } finally {
        this.inflight.delete(key);
      }
    })();

    this.inflight.set(key, promise);
    await promise;
  }

  private async writeToStore<T>(
    key: string,
    value: T,
    ttl: number,
    jitter: number,
  ): Promise<void> {
    const jitteredTtl = this.applyJitter(ttl, jitter);
    const now = Date.now();
    const entry: CacheEntry<T> = {
      value,
      expiresAt: now + jitteredTtl,
      staleUntil: now + jitteredTtl + this.staleTtl,
    };
    this.localCache.set(key, entry);
    await this.store.set(key, JSON.stringify(entry), jitteredTtl + this.staleTtl);
  }

  /** Apply ±jitter% randomness to TTL to spread out expirations */
  private applyJitter(ttl: number, jitter: number): number {
    const delta = ttl * jitter;
    return Math.round(ttl + (Math.random() * 2 - 1) * delta);
  }

  private validateJitter(jitter: number): number {
    if (jitter < 0 || jitter > 1) {
      throw new RangeError(`[rezilia/cache] jitterFactor must be between 0 and 1, got ${jitter}`);
    }
    return jitter;
  }

  private validateKey(key: string): void {
    if (!key || typeof key !== 'string') {
      throw new TypeError(`[rezilia/cache] Cache key must be a non-empty string`);
    }
    if (key.length > 512) {
      throw new RangeError(`[rezilia/cache] Cache key too long (max 512 chars)`);
    }
  }
}
