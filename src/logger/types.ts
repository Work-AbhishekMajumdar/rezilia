export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

export const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

export interface LogContext {
  requestId?: string;
  userId?: string;
  traceId?: string;
  [key: string]: unknown;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context: LogContext;
  error?: SerializedError;
  data?: Record<string, unknown>;
}

export interface SerializedError {
  name: string;
  message: string;
  stack: string | undefined;
  code: string | number | undefined;
}

export interface Transport {
  write(entry: LogEntry): void;
}

export interface SmartLoggerOptions {
  /** Minimum log level to output (default: 'info') */
  level?: LogLevel;
  /** Service/app name added to every log entry */
  serviceName?: string;
  /** Custom transports (default: console JSON transport) */
  transports?: Transport[];
  /**
   * Fields to automatically redact from log output.
   * Values are replaced with '[REDACTED]'.
   * Default: ['password', 'token', 'secret', 'authorization', 'cookie', 'apiKey', 'api_key']
   */
  redactFields?: string[];
  /** Pretty-print logs (useful in development, never in production) */
  prettyPrint?: boolean;
}
