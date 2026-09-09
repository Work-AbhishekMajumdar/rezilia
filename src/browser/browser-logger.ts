/**
 * BrowserLogger — lightweight structured logger for browser environments.
 *
 * Drop-in for SmartLogger when running in plain HTML/JS.
 * Uses console APIs instead of process.stdout, and a simple
 * Map-based context store instead of AsyncLocalStorage.
 *
 * @example
 * const logger = new BrowserLogger({ service: 'my-app', pretty: true, timeFormat: 'full' });
 * logger.setContext({ requestId: 'abc-123', userId: 'u_42' });
 * logger.info('User fetched', { endpoint: '/api/user' });
 * // → [09 Sep 2026, 10:22:27] [INFO] [my-app] User fetched
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  requestId?: string;
  userId?: string;
  tenantId?: string;
  [key: string]: unknown;
}

export interface BrowserLoggerOptions {
  /** Service name stamped on every log entry */
  service?: string;
  /** Minimum level to emit (default: 'info') */
  level?: LogLevel;
  /** If true, emit pretty-printed output (default: false = JSON) */
  pretty?: boolean;
  /** Fields to redact from logs (replaced with '***') */
  redact?: string[];
  /**
   * Time format for pretty output (default: 'iso')
   * - 'iso'  → 2026-09-09T10:22:27.013Z
   * - 'full' → 09 Sep 2026, 10:22:27
   * - 'time' → 10:22:27 AM
   */
  timeFormat?: 'iso' | 'full' | 'time';
}

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export class BrowserLogger {
  private readonly service: string;
  private readonly minLevel: number;
  private readonly pretty: boolean;
  private readonly redactFields: Set<string>;
  private readonly timeFormat: 'iso' | 'full' | 'time';
  private context: LogContext = {};

  constructor(options: BrowserLoggerOptions = {}) {
    this.service = options.service ?? 'app';
    this.minLevel = LEVELS[options.level ?? 'info'];
    this.pretty = options.pretty ?? false;
    this.redactFields = new Set(options.redact ?? ['password', 'token', 'secret', 'authorization']);
    this.timeFormat = options.timeFormat ?? 'iso';
  }

  private formatTime(date: Date): string {
    if (this.timeFormat === 'full') {
      const day = String(date.getDate()).padStart(2, '0');
      const month = date.toLocaleString('en', { month: 'short' });
      const year = date.getFullYear();
      const hh = String(date.getHours()).padStart(2, '0');
      const mm = String(date.getMinutes()).padStart(2, '0');
      const ss = String(date.getSeconds()).padStart(2, '0');
      return `${day} ${month} ${year}, ${hh}:${mm}:${ss}`;
    }
    if (this.timeFormat === 'time') {
      return date.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
    return date.toISOString();
  }

  /**
   * Set shared context fields that appear on every subsequent log.
   * Call this at request start (e.g. in a fetch interceptor or middleware).
   */
  setContext(ctx: LogContext): void {
    this.context = { ...this.context, ...ctx };
  }

  /** Clear all context fields */
  clearContext(): void {
    this.context = {};
  }

  /** Get current context (read-only snapshot) */
  getContext(): Readonly<LogContext> {
    return { ...this.context };
  }

  debug(message: string, fields?: Record<string, unknown>): void {
    this.emit('debug', message, fields);
  }

  info(message: string, fields?: Record<string, unknown>): void {
    this.emit('info', message, fields);
  }

  warn(message: string, fields?: Record<string, unknown>): void {
    this.emit('warn', message, fields);
  }

  error(message: string, fields?: Record<string, unknown>): void {
    this.emit('error', message, fields);
  }

  private emit(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
    if (LEVELS[level] < this.minLevel) return;

    const now = new Date();
    const entry: Record<string, unknown> = {
      timestamp: now.toISOString(),
      level,
      service: this.service,
      message,
      ...this.redactObject(this.context),
      ...this.redactObject(fields ?? {}),
    };

    if (this.pretty) {
      const prefix = `[${this.formatTime(now)}] [${level.toUpperCase()}] [${this.service}]`;
      const consoleFn = level === 'error' ? console.error
        : level === 'warn' ? console.warn
        : level === 'debug' ? console.debug
        : console.info;
      consoleFn(prefix, message, fields ?? '');
    } else {
      const consoleFn = level === 'error' ? console.error
        : level === 'warn' ? console.warn
        : console.log;
      consoleFn(JSON.stringify(entry));
    }
  }

  private redactObject(obj: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = this.redactFields.has(k.toLowerCase()) ? '***' : v;
    }
    return out;
  }
}
