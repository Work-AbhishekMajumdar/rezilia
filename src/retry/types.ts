export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface RetryOptions {
  /** Maximum number of attempts (default: 3) */
  attempts?: number;
  /** Base delay between retries in ms (default: 500) */
  baseDelay?: number;
  /** Maximum delay cap in ms (default: 30_000) */
  maxDelay?: number;
  /** Jitter factor 0–1 to randomise delays (default: 0.2) */
  jitter?: number;
  /** Timeout per attempt in ms — 0 = no timeout (default: 0) */
  timeout?: number;
  /**
   * Which errors should trigger a retry.
   * Return true to retry, false to throw immediately.
   * Default: retry on all errors.
   */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Called after each failed attempt */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

export interface CircuitBreakerOptions {
  /** Failures needed to open the circuit (default: 5) */
  threshold?: number;
  /** How long the circuit stays open in ms (default: 30_000) */
  resetAfter?: number;
  /** Successes needed in HALF_OPEN to close again (default: 2) */
  halfOpenSuccesses?: number;
}

export interface SmartRetryOptions extends RetryOptions {
  /** Enable circuit breaker for this operation */
  circuitBreaker?: CircuitBreakerOptions;
}
