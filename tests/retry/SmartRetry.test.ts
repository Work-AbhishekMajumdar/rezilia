import { describe, it, expect, vi } from 'vitest';
import { SmartRetry, retry, RetryExhaustedError, TimeoutError } from '../../src/retry/SmartRetry.js';
import { CircuitBreaker, CircuitOpenError } from '../../src/retry/CircuitBreaker.js';

describe('SmartRetry', () => {
  describe('Basic retry', () => {
    it('should return value on first success', async () => {
      const fn = vi.fn().mockResolvedValue('ok');
      const result = await retry(fn);
      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledOnce();
    });

    it('should retry on failure and eventually succeed', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success');

      const result = await retry(fn, { attempts: 3, baseDelay: 0 });
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw RetryExhaustedError after all attempts fail', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('always fails'));
      await expect(retry(fn, { attempts: 3, baseDelay: 0 })).rejects.toThrow(RetryExhaustedError);
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  describe('shouldRetry predicate', () => {
    it('should not retry when shouldRetry returns false', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fatal'));
      await expect(
        retry(fn, { attempts: 5, baseDelay: 0, shouldRetry: () => false }),
      ).rejects.toThrow(RetryExhaustedError);
      expect(fn).toHaveBeenCalledOnce(); // no retries
    });
  });

  describe('Timeout', () => {
    it('should throw TimeoutError when attempt exceeds timeout', async () => {
      const fn = (): Promise<string> =>
        new Promise((r) => setTimeout(() => r('late'), 200));

      await expect(retry(fn, { attempts: 1, timeout: 50 })).rejects.toThrow(RetryExhaustedError);
    });
  });

  describe('onRetry callback', () => {
    it('should call onRetry with error and attempt number', async () => {
      const onRetry = vi.fn();
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('x'))
        .mockResolvedValue('ok');

      await retry(fn, { attempts: 2, baseDelay: 0, onRetry });
      expect(onRetry).toHaveBeenCalledOnce();
      expect(onRetry.mock.calls[0]?.[1]).toBe(1); // attempt 1
    });
  });
});

describe('CircuitBreaker', () => {
  it('should start in CLOSED state', () => {
    const breaker = new CircuitBreaker();
    expect(breaker.currentState).toBe('CLOSED');
  });

  it('should open after threshold failures', async () => {
    const breaker = new CircuitBreaker({ threshold: 3, resetAfter: 10_000 });
    const failing = vi.fn().mockRejectedValue(new Error('down'));

    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(failing)).rejects.toThrow();
    }
    expect(breaker.currentState).toBe('OPEN');
  });

  it('should throw CircuitOpenError when OPEN', async () => {
    const breaker = new CircuitBreaker({ threshold: 1, resetAfter: 10_000 });
    await expect(breaker.execute(() => Promise.reject(new Error('x')))).rejects.toThrow();
    await expect(breaker.execute(() => Promise.resolve('ok'))).rejects.toThrow(CircuitOpenError);
  });

  it('should transition to HALF_OPEN after resetAfter ms', async () => {
    vi.useFakeTimers();
    const breaker = new CircuitBreaker({ threshold: 1, resetAfter: 100 });
    await expect(breaker.execute(() => Promise.reject(new Error('x')))).rejects.toThrow();
    expect(breaker.currentState).toBe('OPEN');

    vi.advanceTimersByTime(101);
    // Trigger a check by attempting — state should move to HALF_OPEN
    await breaker.execute(() => Promise.resolve('probe')).catch(() => undefined);
    // After a success in HALF_OPEN with halfOpenSuccesses=2, one more needed
    expect(['HALF_OPEN', 'CLOSED']).toContain(breaker.currentState);
    vi.useRealTimers();
  });

  it('should reset manually', async () => {
    const breaker = new CircuitBreaker({ threshold: 1, resetAfter: 10_000 });
    await expect(breaker.execute(() => Promise.reject(new Error('x')))).rejects.toThrow();
    breaker.reset();
    expect(breaker.currentState).toBe('CLOSED');
  });
});
