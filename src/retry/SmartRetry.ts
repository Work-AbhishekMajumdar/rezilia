import { CircuitBreaker } from './CircuitBreaker.js';
import type { SmartRetryOptions } from './types.js';

/**
 * Error thrown when all retry attempts are exhausted.
 */
export class RetryExhaustedError extends Error {
  override readonly name = 'RetryExhaustedError';
  readonly attempts: number;
  readonly lastError: unknown;

  constructor(attempts: number, lastError: unknown) {
    const msg = lastError instanceof Error ? lastError.message : String(lastError);
    super(`All ${attempts} attempt(s) failed. Last error: ${msg}`);
    this.attempts = attempts;
    this.lastError = lastError;
  }
}

/**
 * Error thrown when a single attempt exceeds the configured timeout.
 */
export class TimeoutError extends Error {
  override readonly name = 'TimeoutError';
  constructor(timeoutMs: number) {
    super(`Operation timed out after ${timeoutMs}ms`);
  }
}

/**
 * SmartRetry — production-grade retry logic with exponential backoff, jitter,
 * per-attempt timeouts, and an optional circuit breaker.
 *
 * @example
 * // Simple: 3 attempts, exponential backoff
 * const data = await retry(() => fetch('/api/data').then(r => r.json()));
 *
 * // Advanced: with circuit breaker
 * const retry = new SmartRetry({
 *   attempts: 5,
 *   timeout: 5_000,
 *   circuitBreaker: { threshold: 5, resetAfter: 30_000 },
 * });
 * const result = await retry.execute(() => callExternalApi());
 */
export class SmartRetry {
  private readonly attempts: number;
  private readonly baseDelay: number;
  private readonly maxDelay: number;
  private readonly jitter: number;
  private readonly timeout: number;
  private readonly shouldRetry: (error: unknown, attempt: number) => boolean;
  private readonly onRetry: ((error: unknown, attempt: number, delayMs: number) => void) | undefined;
  private readonly breaker: CircuitBreaker | undefined;

  constructor(options: SmartRetryOptions = {}) {
    this.attempts = options.attempts ?? 3;
    this.baseDelay = options.baseDelay ?? 500;
    this.maxDelay = options.maxDelay ?? 30_000;
    this.jitter = options.jitter ?? 0.2;
    this.timeout = options.timeout ?? 0;
    this.shouldRetry = options.shouldRetry ?? (() => true);
    this.onRetry = options.onRetry;
    this.breaker = options.circuitBreaker
      ? new CircuitBreaker(options.circuitBreaker)
      : undefined;
  }

  /**
   * Execute `fn` with retry logic applied.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.attempts; attempt++) {
      try {
        const result = await this.runWithTimeout(
          this.breaker ? () => this.breaker!.execute(fn) : fn,
        );
        return result;
      } catch (error) {
        lastError = error;

        const isLastAttempt = attempt === this.attempts;
        if (isLastAttempt || !this.shouldRetry(error, attempt)) {
          break;
        }

        const delay = this.calculateDelay(attempt);
        this.onRetry?.(error, attempt, delay);
        await this.sleep(delay);
      }
    }

    throw new RetryExhaustedError(this.attempts, lastError);
  }

  /** Current circuit breaker state (undefined if no breaker configured) */
  get circuitState(): string | undefined {
    return this.breaker?.currentState;
  }

  /** Manually reset the circuit breaker */
  resetCircuit(): void {
    this.breaker?.reset();
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  private async runWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.timeout) return fn();

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new TimeoutError(this.timeout)),
        this.timeout,
      );

      fn().then(
        (value) => { clearTimeout(timer); resolve(value); },
        (error: unknown) => { clearTimeout(timer); reject(error); },
      );
    });
  }

  /**
   * Exponential backoff with jitter:
   * delay = clamp(baseDelay * 2^(attempt-1) ± jitter%, 0, maxDelay)
   */
  private calculateDelay(attempt: number): number {
    const exponential = this.baseDelay * Math.pow(2, attempt - 1);
    const capped = Math.min(exponential, this.maxDelay);
    const delta = capped * this.jitter;
    const jittered = capped + (Math.random() * 2 - 1) * delta;
    return Math.max(0, Math.round(jittered));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Convenience function for one-off retries.
 *
 * @example
 * const data = await retry(() => api.getData(), { attempts: 3, timeout: 5000 });
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: SmartRetryOptions = {},
): Promise<T> {
  return new SmartRetry(options).execute(fn);
}
