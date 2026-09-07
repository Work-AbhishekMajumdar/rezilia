import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type {
  LogLevel,
  LogContext,
  LogEntry,
  SerializedError,
  SmartLoggerOptions,
  Transport,
} from './types.js';
import { LOG_LEVELS } from './types.js';

// Default fields to redact — prevent secrets from leaking into logs
const DEFAULT_REDACT_FIELDS = [
  'password',
  'passwd',
  'token',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'secret',
  'authorization',
  'cookie',
  'apiKey',
  'api_key',
  'privateKey',
  'private_key',
  'cvv',
  'cardNumber',
  'card_number',
];

/**
 * Console transport — outputs structured JSON (or pretty-printed) logs.
 */
class ConsoleTransport implements Transport {
  constructor(private readonly pretty: boolean) {}

  write(entry: LogEntry): void {
    const output = this.pretty ? JSON.stringify(entry, null, 2) : JSON.stringify(entry);
    if (entry.level === 'error' || entry.level === 'warn') {
      process.stderr.write(output + '\n');
    } else {
      process.stdout.write(output + '\n');
    }
  }
}

/**
 * SmartLogger — structured, context-aware logging for Node.js backends.
 *
 * Key features:
 * - **Async context propagation**: request ID automatically flows through
 *   all async calls without manual passing — powered by AsyncLocalStorage.
 * - **Automatic redaction**: sensitive fields (passwords, tokens, etc.) are
 *   replaced with '[REDACTED]' before writing to any transport.
 * - **Structured JSON output**: machine-parseable logs, OpenTelemetry-ready.
 * - **Child loggers**: create scoped loggers that inherit parent context.
 *
 * @example
 * const logger = new SmartLogger({ serviceName: 'api', level: 'info' });
 *
 * // In Express middleware:
 * app.use((req, res, next) => {
 *   logger.runWithContext({ requestId: req.headers['x-request-id'] ?? randomUUID() }, next);
 * });
 *
 * // Anywhere in the async call chain:
 * logger.info('User created', { userId: '123' });
 * // → {"level":"info","message":"User created","context":{"requestId":"abc-123"},"data":{"userId":"123"}}
 */
export class SmartLogger {
  private readonly level: LogLevel;
  private readonly serviceName: string | undefined;
  private readonly transports: Transport[];
  private readonly redactFields: Set<string>;
  private readonly storage = new AsyncLocalStorage<LogContext>();
  private readonly baseContext: LogContext;

  constructor(options: SmartLoggerOptions = {}) {
    this.level = options.level ?? 'info';
    this.serviceName = options.serviceName;
    this.transports =
      options.transports ?? [new ConsoleTransport(options.prettyPrint ?? false)];
    this.redactFields = new Set([
      ...DEFAULT_REDACT_FIELDS,
      ...(options.redactFields ?? []),
    ]);
    this.baseContext = this.serviceName ? { service: this.serviceName } : {};
  }

  // ─── Context management ─────────────────────────────────────────────────────

  /**
   * Run `fn` with the given context available to all nested async calls.
   * Use this in middleware to inject requestId, userId, traceId, etc.
   */
  runWithContext<T>(context: LogContext, fn: () => T): T {
    const merged = { ...this.currentContext, ...context };
    return this.storage.run(merged, fn);
  }

  /**
   * Generate a new requestId and run `fn` within that context.
   * Convenience wrapper for runWithContext.
   */
  withRequestId<T>(fn: () => T, extraContext: LogContext = {}): T {
    return this.runWithContext({ requestId: randomUUID(), ...extraContext }, fn);
  }

  /** Get the context bound to the current async scope */
  get currentContext(): LogContext {
    return this.storage.getStore() ?? this.baseContext;
  }

  // ─── Logging methods ─────────────────────────────────────────────────────────

  debug(message: string, data?: Record<string, unknown>): void {
    this.write('debug', message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.write('info', message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.write('warn', message, data);
  }

  error(message: string, error?: unknown, data?: Record<string, unknown>): void {
    const serialized = error ? this.serializeError(error) : undefined;
    this.write('error', message, data, serialized);
  }

  // ─── Child logger ────────────────────────────────────────────────────────────

  /**
   * Create a child logger that merges `context` into every log entry.
   * The child shares the parent's transports and settings.
   *
   * @example
   * const reqLogger = logger.child({ requestId: req.id, userId: req.user.id });
   * reqLogger.info('Payment started'); // includes requestId + userId automatically
   */
  child(context: LogContext): SmartLogger {
    const childOpts: SmartLoggerOptions = {
      level: this.level,
      transports: this.transports,
      redactFields: [...this.redactFields],
    };
    if (this.serviceName !== undefined) childOpts.serviceName = this.serviceName;
    const child = new SmartLogger(childOpts);
    // Bind the extra context into the child by hijacking currentContext
    Object.assign(child.baseContext, this.currentContext, context);
    return child;
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  private write(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
    error?: SerializedError,
  ): void {
    if (LOG_LEVELS[level] < LOG_LEVELS[this.level]) return;

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context: { ...this.baseContext, ...this.currentContext },
      ...(error ? { error } : {}),
      ...(data ? { data: this.redact(data) } : {}),
    };

    for (const transport of this.transports) {
      transport.write(entry);
    }
  }

  private redact(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (this.redactFields.has(key)) {
        result[key] = '[REDACTED]';
      } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this.redact(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  private serializeError(error: unknown): SerializedError {
    if (error instanceof Error) {
      const nodeErr = error as NodeJS.ErrnoException;
      return {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: nodeErr.code,
      };
    }
    return { name: 'UnknownError', message: String(error), stack: undefined, code: undefined };
  }
}
