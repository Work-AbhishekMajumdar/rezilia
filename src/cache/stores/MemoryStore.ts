import type { CacheStore } from '../types.js';

interface MemoryEntry {
  value: string;
  expiresAt: number;
}

/**
 * In-memory cache store with automatic TTL expiry.
 * Uses a simple Map — no external dependencies required.
 */
export class MemoryStore implements CacheStore {
  private readonly store = new Map<string, MemoryEntry>();
  private sweepInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly sweepIntervalMs = 30_000) {
    // Periodic cleanup of expired entries to prevent memory leaks
    this.sweepInterval = setInterval(() => this.sweep(), sweepIntervalMs).unref();
  }

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlMs: number): Promise<void> {
    if (ttlMs <= 0) throw new Error(`[rezilia/cache] TTL must be positive, got ${ttlMs}`);
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  /** Number of entries currently in store (including possibly expired) */
  get size(): number {
    return this.store.size;
  }

  /** Stop the background sweep timer — call when you no longer need this store */
  destroy(): void {
    if (this.sweepInterval) {
      clearInterval(this.sweepInterval);
      this.sweepInterval = null;
    }
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(key);
    }
  }
}
