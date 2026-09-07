import type { CacheStore } from '../types.js';

/**
 * Minimal interface we need from ioredis — keeps the dependency optional.
 * If you use ioredis, pass the client directly; it satisfies this interface.
 */
export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ex: 'PX', ttl: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
  flushdb(): Promise<unknown>;
}

/**
 * Redis-backed cache store using ioredis (peer dependency).
 *
 * @example
 * import Redis from 'ioredis';
 * import { SmartCache, RedisStore } from 'rezilia/cache';
 *
 * const client = new Redis({ host: 'localhost', port: 6379 });
 * const cache = new SmartCache({ store: new RedisStore(client) });
 */
export class RedisStore implements CacheStore {
  constructor(private readonly client: RedisClient) {}

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlMs: number): Promise<void> {
    if (ttlMs <= 0) throw new Error(`[rezilia/cache] TTL must be positive, got ${ttlMs}`);
    await this.client.set(key, value, 'PX', ttlMs);
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  async clear(): Promise<void> {
    await this.client.flushdb();
  }
}
