# rezilia 🛡️

> The ultimate backend resilience toolkit for Node.js — Cache Stampede Prevention, Async-Context Logger, and Circuit Breaker Retry in one package.

[![npm version](https://img.shields.io/npm/v/rezilia.svg)](https://www.npmjs.com/package/rezilia)
[![CI](https://github.com/Work-AbhishekMajumdar/rezilia/actions/workflows/ci.yml/badge.svg)](https://github.com/Work-AbhishekMajumdar/rezilia/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg)](https://www.typescriptlang.org/)

## Why rezilia?

Every production Node.js backend hits the same three walls:

| Problem | What happens | rezilia's solution |
|---------|-------------|-------------------|
| **Cache Stampede** | 10,000 requests hit DB when cache expires | Singleflight — only 1 fetcher runs |
| **Lost Log Context** | Request ID disappears across async/await | AsyncLocalStorage auto-propagation |
| **Cascading Failures** | One slow API brings down your whole app | Circuit Breaker + Exponential Backoff |

No other npm package solves all three. rezilia does — with zero config defaults and full TypeScript support.

---

## Install

```bash
npm install rezilia
yarn add rezilia
pnpm add rezilia
bun add rezilia
```

> **Optional**: For Redis-backed cache, also install `ioredis`:
> ```bash
> npm install ioredis
> ```

---

## Quick Start

```typescript
import { SmartCache, SmartLogger, retry } from 'rezilia';

// ─── Cache ─────────────────────────────────────────────────────────────
const cache = new SmartCache({ defaultTtl: 60_000 });

// 1000 concurrent requests → only 1 DB call (singleflight magic)
const user = await cache.get('user:42', () => db.findUser(42));

// ─── Logger ────────────────────────────────────────────────────────────
const logger = new SmartLogger({ serviceName: 'api' });

// requestId flows through ALL async calls automatically
logger.runWithContext({ requestId: req.id }, async () => {
  logger.info('Processing payment');   // → {"requestId":"abc","message":"Processing payment"}
  await processPayment();
  logger.info('Payment done');         // → {"requestId":"abc","message":"Payment done"} ✓
});

// ─── Retry ─────────────────────────────────────────────────────────────
const data = await retry(() => fetch('/api/data').then(r => r.json()), {
  attempts: 3,
  timeout: 5_000,
  circuitBreaker: { threshold: 5, resetAfter: 30_000 },
});
```

---

## Modules

### 📦 SmartCache

```typescript
import { SmartCache, MemoryStore, RedisStore } from 'rezilia/cache';

const cache = new SmartCache({
  defaultTtl: 60_000,      // 1 minute
  jitterFactor: 0.1,       // ±10% TTL randomness (prevents mass expiry)
  staleWhileRevalidate: true,
  staleTtl: 5_000,         // serve stale for 5s while refreshing
});

// Cache miss → calls fetcher once, 100 concurrent callers wait and share result
const product = await cache.get('product:123', () => db.getProduct(123));

// With custom TTL per key
const session = await cache.get('session:abc', () => db.getSession('abc'), { ttl: 3_600_000 });

// Explicit set
await cache.set('config', appConfig, { ttl: 86_400_000 });

// Invalidate
await cache.invalidate('product:123');
await cache.clear();
```

#### With Redis

```typescript
import Redis from 'ioredis';
import { SmartCache, RedisStore } from 'rezilia/cache';

const redis = new Redis({ host: 'localhost', port: 6379 });
const cache = new SmartCache({ store: new RedisStore(redis) });
```

---

### 📝 SmartLogger

```typescript
import { SmartLogger, requestLogger } from 'rezilia/logger';

const logger = new SmartLogger({
  serviceName: 'payment-api',
  level: 'info',            // 'debug' | 'info' | 'warn' | 'error' | 'silent'
  prettyPrint: false,       // true in dev, false in prod
  redactFields: ['ssn'],    // extend the default redacted fields
});

// Logs → {"level":"info","message":"...","timestamp":"...","context":{...}}
logger.info('Server started', { port: 3000 });
logger.warn('High memory usage', { heapUsed: '512MB' });
logger.error('DB connection failed', new Error('ECONNREFUSED'));

// Auto-redaction (password never appears in logs)
logger.info('Login attempt', { username: 'user@example.com', password: 'secret123' });
// → {"data":{"username":"user@example.com","password":"[REDACTED]"}}

// Child logger with persistent context
const reqLogger = logger.child({ requestId: 'abc', userId: '42' });
reqLogger.info('Request received'); // always includes requestId + userId
```

#### Express Middleware

```typescript
import express from 'express';
import { SmartLogger, requestLogger } from 'rezilia/logger';

const app = express();
const logger = new SmartLogger({ serviceName: 'api' });

app.use(requestLogger(logger)); // injects requestId, logs req start/end

app.get('/users/:id', async (req, res) => {
  logger.info('Fetching user'); // requestId is here automatically!
  const user = await db.getUser(req.params.id);
  res.json(user);
});
```

---

### 🔄 SmartRetry

```typescript
import { SmartRetry, retry, CircuitBreaker } from 'rezilia/retry';

// One-liner
const data = await retry(() => api.getData(), { attempts: 3, baseDelay: 500 });

// Full control
const retrier = new SmartRetry({
  attempts: 5,
  baseDelay: 500,          // ms — doubles each attempt (exponential)
  maxDelay: 30_000,        // never wait more than 30s
  jitter: 0.2,             // ±20% randomness to avoid thundering herd
  timeout: 10_000,         // fail each attempt after 10s
  shouldRetry: (err, attempt) => {
    // Don't retry on 4xx errors
    if (err instanceof HttpError && err.status < 500) return false;
    return true;
  },
  onRetry: (err, attempt, delay) => {
    logger.warn(`Attempt ${attempt} failed, retrying in ${delay}ms`, err);
  },
  circuitBreaker: {
    threshold: 5,           // open after 5 consecutive failures
    resetAfter: 30_000,     // try again after 30s
    halfOpenSuccesses: 2,   // need 2 successes to close
  },
});

const result = await retrier.execute(() => paymentGateway.charge(order));

// Check circuit state
console.log(retrier.circuitState); // 'CLOSED' | 'OPEN' | 'HALF_OPEN'
```

---

## Tree-shakeable imports

Import only what you need — each sub-module is independently bundled:

```typescript
import { SmartCache } from 'rezilia/cache';   // ~3KB
import { SmartLogger } from 'rezilia/logger'; // ~4KB
import { retry } from 'rezilia/retry';        // ~2KB
import { SmartCache, SmartLogger } from 'rezilia'; // everything
```

---

## Requirements

| Runtime | Minimum version |
|---------|----------------|
| Node.js | 18.0.0+ |
| Bun     | 1.0.0+ |
| TypeScript | 5.0+ (optional) |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). PRs are welcome!

---

## License

[MIT](LICENSE) © 2026 [Abhishek Majumdar](https://github.com/Work-AbhishekMajumdar)
