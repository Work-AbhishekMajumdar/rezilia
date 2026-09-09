/**
 * BrowserLogger — lightweight structured logger for browser environments.
 * Drop-in for SmartLogger when running in plain HTML/JS.
 * Uses console APIs instead of process.stdout/stderr.
 * No AsyncLocalStorage — uses a simple Map-based context store.
 *
 * @example
 * const logger = new BrowserLogger({ service: 'my-app' });
 * logger.setContext({ requestId: 'abc-123', userId: 'u_42' });
 * logger.info('User fetched', { endpoint: '/api/user' });
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  requestId?: string;
  userId?: string;
  tenantId?: string;
  [key: string]: unknown;
}

export interface BrowserLoggerOptions {
  service?: string;
  level?: LogLevel;
  pretty?: boolean;
  redact?: string[];
}

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export class BrowserLogger {
  private readonly service: string;
  private readonly minLevel: number;
  private readonly pretty: boolean;
  private readonly redactFields: Set<string>;
  private context: LogContext = {};

  constructor(options: BrowserLoggerOptions = {}) {
    this.service = options.service ?? 'app';
    this.minLevel = LEVELS[options.level ?? 'info'];
    this.pretty = options.pretty ?? false;
    this.redactFields = new Set(options.redact ?? ['password', 'token', 'secret', 'authorization']);
  }

  setContext(ctx: LogContext): void { this.context = { ...this.context, ...ctx }; }
  clearContext(): void { this.context = {}; }
  getContext(): Readonly<LogContext> { return { ...this.context }; }

  debug(msg: string, f?: Record<string, unknown>): void { this.emit('debug', msg, f); }
  info(msg: string, f?: Record<string, unknown>): void { this.emit('info', msg, f); }
  warn(msg: string, f?: Record<string, unknown>): void { this.emit('warn', msg, f); }
  error(msg: string, f?: Record<string, unknown>): void { this.emit('error', msg, f); }

  private emit(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
    if (LEVELS[level] < this.minLevel) return;
    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(), level,
      service: this.service, message,
      ...this.redact(this.context), ...this.redact(fields ?? {}),
    };
    if (this.pretty) {
      const pre = `[${entry.timestamp}] [${level.toUpperCase()}] [${this.service}]`;
      const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : level === 'debug' ? console.debug : console.info;
      fn(pre, message, fields ?? '');
    } else {
      (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(JSON.stringify(entry));
    }
  }

  private redact(obj: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = this.redactFields.has(k.toLowerCase()) ? '***' : v;
    return out;
  }
}
