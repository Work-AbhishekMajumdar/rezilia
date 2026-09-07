import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SmartLogger } from '../../src/logger/SmartLogger.js';
import type { LogEntry, Transport } from '../../src/logger/types.js';

/** Test transport that captures log entries */
function createTestTransport(): { entries: LogEntry[]; transport: Transport } {
  const entries: LogEntry[] = [];
  return { entries, transport: { write: (e) => entries.push(e) } };
}

describe('SmartLogger', () => {
  let logger: SmartLogger;
  let entries: LogEntry[];
  let transport: Transport;

  beforeEach(() => {
    ({ entries, transport } = createTestTransport());
    logger = new SmartLogger({ transports: [transport], level: 'debug' });
  });

  describe('Basic logging', () => {
    it('should log info messages', () => {
      logger.info('Hello world');
      expect(entries).toHaveLength(1);
      expect(entries[0]?.level).toBe('info');
      expect(entries[0]?.message).toBe('Hello world');
    });

    it('should include timestamp in ISO format', () => {
      logger.info('test');
      expect(entries[0]?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should respect log level — suppress below threshold', () => {
      const warnLogger = new SmartLogger({ transports: [transport], level: 'warn' });
      warnLogger.debug('debug msg');
      warnLogger.info('info msg');
      warnLogger.warn('warn msg');
      expect(entries).toHaveLength(1);
      expect(entries[0]?.level).toBe('warn');
    });
  });

  describe('Async context propagation', () => {
    it('should automatically include requestId in nested async calls', async () => {
      await logger.runWithContext({ requestId: 'req-abc-123' }, async () => {
        await Promise.resolve(); // simulate async work
        logger.info('Inside async handler');
      });

      expect(entries[0]?.context.requestId).toBe('req-abc-123');
    });

    it('should isolate context between concurrent requests', async () => {
      const results: Array<string | undefined> = [];

      await Promise.all([
        logger.runWithContext({ requestId: 'req-001' }, async () => {
          await new Promise((r) => setTimeout(r, 10));
          logger.info('Request 1');
          results.push(logger.currentContext.requestId as string);
        }),
        logger.runWithContext({ requestId: 'req-002' }, async () => {
          logger.info('Request 2');
          results.push(logger.currentContext.requestId as string);
        }),
      ]);

      expect(results).toContain('req-001');
      expect(results).toContain('req-002');
    });
  });

  describe('Sensitive data redaction', () => {
    it('should redact password fields', () => {
      logger.info('User login', { username: 'abhishek', password: 'super-secret-123' });
      expect(entries[0]?.data?.['password']).toBe('[REDACTED]');
      expect(entries[0]?.data?.['username']).toBe('abhishek');
    });

    it('should redact nested secret fields', () => {
      logger.info('API call', { headers: { authorization: 'Bearer token123', accept: 'application/json' } });
      const headers = entries[0]?.data?.['headers'] as Record<string, string>;
      expect(headers['authorization']).toBe('[REDACTED]');
      expect(headers['accept']).toBe('application/json');
    });

    it('should redact custom fields', () => {
      const customLogger = new SmartLogger({
        transports: [transport],
        redactFields: ['ssn'],
      });
      customLogger.info('Form submit', { ssn: '123-45-6789', name: 'Abhishek' });
      expect(entries[0]?.data?.['ssn']).toBe('[REDACTED]');
    });
  });

  describe('Error serialization', () => {
    it('should serialize Error objects', () => {
      const err = new Error('Something broke');
      logger.error('Operation failed', err);
      expect(entries[0]?.error?.name).toBe('Error');
      expect(entries[0]?.error?.message).toBe('Something broke');
      expect(entries[0]?.error?.stack).toBeDefined();
    });

    it('should handle non-Error throws', () => {
      logger.error('Failed', 'string error');
      expect(entries[0]?.error?.name).toBe('UnknownError');
      expect(entries[0]?.error?.message).toBe('string error');
    });
  });

  describe('Child logger', () => {
    it('should merge parent and child context', () => {
      const child = logger.child({ service: 'payment', version: '2' });
      child.info('Payment processed');
      expect(entries[0]?.context['service']).toBe('payment');
    });
  });
});
