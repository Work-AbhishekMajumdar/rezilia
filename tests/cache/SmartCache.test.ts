import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SmartCache } from '../../src/cache/SmartCache.js';

describe('SmartCache', () => {
  let cache: SmartCache;

  beforeEach(() => {
    cache = new SmartCache({ defaultTtl: 1_000, jitterFactor: 0 });
  });

  describe('Basic get/set', () => {
    it('should call fetcher on cache miss', async () => {
      const fetcher = vi.fn().mockResolvedValue({ name: 'Abhishek' });
      const result = await cache.get('user:1', fetcher);
      expect(result).toEqual({ name: 'Abhishek' });
      expect(fetcher).toHaveBeenCalledOnce();
    });

    it('should return cached value on second call', async () => {
      const fetcher = vi.fn().mockResolvedValue(42);
      await cache.get('key', fetcher);
      await cache.get('key', fetcher);
      expect(fetcher).toHaveBeenCalledOnce(); // only once!
    });

    it('should support explicit set', async () => {
      await cache.set('greeting', 'hello');
      const result = await cache.get('greeting', () => Promise.resolve('world'));
      expect(result).toBe('hello'); // cached value, not fetcher value
    });
  });

  describe('Singleflight — Stampede Prevention', () => {
    it('should only call fetcher ONCE for concurrent requests', async () => {
      let callCount = 0;
      const slowFetcher = async (): Promise<string> => {
        callCount++;
        await new Promise((r) => setTimeout(r, 50));
        return 'data';
      };

      // 100 concurrent calls — only 1 DB call should happen
      const results = await Promise.all(
        Array.from({ length: 100 }, () => cache.get('hot-key', slowFetcher)),
      );

      expect(callCount).toBe(1); // Singleflight working!
      expect(results.every((r) => r === 'data')).toBe(true);
    });

    it('should allow new fetches after the first completes', async () => {
      const fetcher = vi.fn().mockResolvedValue('fresh');
      await cache.get('key', fetcher);
      await cache.invalidate('key');
      await cache.get('key', fetcher);
      expect(fetcher).toHaveBeenCalledTimes(2);
    });
  });

  describe('Invalidation & clear', () => {
    it('should remove key on invalidate', async () => {
      const fetcher = vi.fn().mockResolvedValue('v1').mockResolvedValueOnce('v1').mockResolvedValueOnce('v2');
      await cache.get('k', fetcher);
      await cache.invalidate('k');
      const second = await cache.get('k', fetcher);
      expect(second).toBe('v2');
    });

    it('should clear all keys', async () => {
      const fetcher = vi.fn().mockResolvedValue('x');
      await cache.get('a', fetcher);
      await cache.get('b', fetcher);
      await cache.clear();
      await cache.get('a', fetcher);
      await cache.get('b', fetcher);
      expect(fetcher).toHaveBeenCalledTimes(4);
    });
  });

  describe('Validation', () => {
    it('should throw on empty key', async () => {
      await expect(cache.get('', () => Promise.resolve(1))).rejects.toThrow(TypeError);
    });

    it('should throw on key longer than 512 chars', async () => {
      const longKey = 'x'.repeat(513);
      await expect(cache.get(longKey, () => Promise.resolve(1))).rejects.toThrow(RangeError);
    });

    it('should throw on invalid jitterFactor', () => {
      expect(() => new SmartCache({ jitterFactor: 1.5 })).toThrow(RangeError);
      expect(() => new SmartCache({ jitterFactor: -0.1 })).toThrow(RangeError);
    });
  });
});
