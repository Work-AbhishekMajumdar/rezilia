import type { CircuitBreakerOptions, CircuitState } from './types.js';

/**
 * Circuit Breaker — protects your app from cascading failures.
 *
 * States:
 * - **CLOSED** (normal): requests flow through; failures are counted.
 * - **OPEN** (tripped): all requests fail fast — no upstream calls made.
 * - **HALF_OPEN** (testing): a limited number of requests probe if recovery happened.
 *
 * @example
 * const breaker = new CircuitBreaker({ threshold: 5, resetAfter: 30_000 });
 * await breaker.execute(() => fetch('/api/payments'));
 */
export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private openedAt = 0;

  private readonly threshold: number;
  private readonly resetAfter: number;
  private readonly halfOpenSuccesses: number;

  constructor(options: CircuitBreakerOptions = {}) {
    this.threshold = options.threshold ?? 5;
    this.resetAfter = options.resetAfter ?? 30_000;
    this.halfOpenSuccesses = options.halfOpenSuccesses ?? 2;
  }

  /** Current state of the circuit */
  get currentState(): CircuitState {
    return this.state;
  }

  /**
   * Execute `fn` through the circuit breaker.
   * Throws `CircuitOpenError` when the circuit is OPEN.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.transitionIfNeeded();

    if (this.state === 'OPEN') {
      throw new CircuitOpenError(
        `Circuit is OPEN — upstream failures: ${this.failureCount}. ` +
        `Will retry after ${Math.round((this.resetAfter - (Date.now() - this.openedAt)) / 1000)}s.`,
      );
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /** Reset the circuit to CLOSED (useful in tests or manual recovery) */
  reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  private onSuccess(): void {
    this.failureCount = 0;
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.halfOpenSuccesses) {
        this.state = 'CLOSED';
        this.successCount = 0;
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    if (this.state === 'HALF_OPEN') {
      // Probe failed — reopen immediately
      this.trip();
    } else if (this.failureCount >= this.threshold) {
      this.trip();
    }
  }

  private trip(): void {
    this.state = 'OPEN';
    this.openedAt = Date.now();
    this.successCount = 0;
  }

  private transitionIfNeeded(): void {
    if (this.state === 'OPEN' && Date.now() - this.openedAt >= this.resetAfter) {
      this.state = 'HALF_OPEN';
      this.failureCount = 0;
    }
  }
}

/**
 * Thrown when a call is rejected because the circuit is open.
 */
export class CircuitOpenError extends Error {
  override readonly name = 'CircuitOpenError';
  constructor(message: string) {
    super(message);
  }
}
