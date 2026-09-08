# rezilia 🛡️

> The ultimate backend resilience toolkit for Node.js — Cache Stampede Prevention, Async-Context Logger, and Circuit Breaker Retry in one package.

[![npm version](https://img.shields.io/npm/v/rezilia.svg?style=flat-square)](https://www.npmjs.com/package/rezilia)
[![npm downloads](https://img.shields.io/npm/dm/rezilia.svg?style=flat-square)](https://www.npmjs.com/package/rezilia)
[![CI](https://github.com/Work-AbhishekMajumdar/rezilia/actions/workflows/ci.yml/badge.svg)](https://github.com/Work-AbhishekMajumdar/rezilia/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg?style=flat-square)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-brightgreen?style=flat-square)](https://nodejs.org)

---

## Why rezilia?

Every production Node.js backend hits the same three walls:

| Problem | What happens without it | rezilia's solution |
|---------|------------------------|-------------------|
| **Cache Stampede** | 1,000 requests hit DB simultaneously when cache expires | **Singleflight** — only 1 fetcher runs, all callers share the result |
| **Lost Log Context** | Request ID disappears across `async/await` boundaries | **AsyncLocalStorage** auto-propagation — no manual passing |
| **Cascading Failures** | One slow API brings down your whole backend | **Circuit Breaker** + Exponential Backoff with jitter |

**Zero dependencies. Full TypeScript. Works with npm, yarn, pnpm, and bun.**

---

## Install

```bash
npm install rezilia
yarn add rezilia
pnpm add rezilia
bun add rezilia
```

> **Redis support** (optional — for distributed caching):
> ```bash
> npm install ioredis
> ```

---

## Quick Start

```typescript
import { SmartCache, SmartLogger, retry } from 'rezilia';

// ─── Cache: 1000 concurrent requests → only 1 DB call ──────────────────
const cache = new SmartCache({ defaultTtl: 60_000 });
const user = await cache.get('user:42', () => db.findUser(42));

// ─── Logger: requestId flows through all async calls automatically ───────
const logger = new SmartLogger({ serviceName: 'api' });
logger.runWithContext({ requestId: req.id }, async () => {
  logger.info('Processing payment');   // → includes requestId automatically
  await processPayment();
  logger.info('Payment done');         // → requestId still here ✓
});

// ─── Retry: exponential backoff + circuit breaker ───────────────────────
const data = await retry(() => fetch('/api/data').then(r => r.json()), {
  attempts: 3,
  timeout: 5_000,
  circuitBreaker: { threshold: 5, resetAfter: 30_000 },
});
```

---

## Modules

### 📦 SmartCache — Singleflight + SWR + Two-Layer Cache

The **#1 missing primitive in the JS ecosystem**. When your cache expires under high load, only 1 fetcher runs — all concurrent callers wait and share the single result. No thundering herd. No DB meltdown.

```typescript
import { SmartCache } from 'rezilia/cache';

const cache = new SmartCache({
  defaultTtl: 60_000,         // 1 minute
  jitterFactor: 0.1,          // ±10% TTL randomness (prevents mass simultaneous expiry)
  staleWhileRevalidate: true, // serve stale data instantly while refreshing in background
  staleTtl: 5_000,            // serve stale for up to 5s
});

// Singleflight in action — 100 concurrent callers, fetcher runs exactly ONCE
const results = await Promise.all(
  Array.from({ length: 100 }, () => cache.get('hot-key', expensiveFetcher))
);
// fetcher was called: 1 time ✓

// With custom TTL per key
const session = await cache.get('session:abc', fetchSession, { ttl: 3_600_000 });

// Manual set / invalidate
await cache.set('config', appConfig, { ttl: 86_400_000 });
await cache.invalidate('product:123');
await cache.clear();
```

#### Redis Store

```typescript
import Redis from 'ioredis';
import { SmartCache, RedisStore } from 'rezilia/cache';

const cache = new SmartCache({
  store: new RedisStore(new Redis({ host: 'localhost', port: 6379 })),
  defaultTtl: 60_000,
});
```

---

### 📝 SmartLogger — Async Context Propagation

Structured JSON logging with **automatic requestId propagation** through the entire async call chain. No more passing `logger` or `requestId` through every function parameter.

```typescript
import { SmartLogger } from 'rezilia/logger';

const logger = new SmartLogger({
  serviceName: 'payment-api',
  level: 'info',          // 'debug' | 'info' | 'warn' | 'error' | 'silent'
  prettyPrint: false,     // true in dev, false in prod
  redactFields: ['ssn'],  // extend the built-in redacted fields
});

logger.info('Server started', { port: 3000 });
logger.warn('High memory usage', { heapUsed: '512MB' });
logger.error('DB connection failed', new Error('ECONNREFUSED'));

// Auto-redaction — sensitive fields are NEVER logged
logger.info('Login', { username: 'user@example.com', password: 'secret123' });
// → {"data":{"username":"user@example.com","password":"[REDACTED]"}}

// Scoped child logger
const reqLogger = logger.child({ requestId: 'abc-123', userId: '42' });
reqLogger.info('Payment started'); // always includes requestId + userId
```

**Built-in redacted fields**: `password`, `token`, `accessToken`, `refreshToken`, `secret`, `authorization`, `cookie`, `apiKey`, `privateKey`, `cvv`, `cardNumber`

#### Express / Fastify Middleware

```typescript
import express from 'express';
import { SmartLogger, requestLogger } from 'rezilia/logger';

const app = express();
const logger = new SmartLogger({ serviceName: 'api' });

app.use(requestLogger(logger));

app.get('/users/:id', async (req, res) => {
  logger.info('Fetching user'); // requestId here automatically — no passing needed!
  res.json(await db.getUser(req.params.id));
});
```

**Sample output:**
```json
{
  "level": "info",
  "message": "Fetching user",
  "timestamp": "2026-09-08T10:00:00.000Z",
  "context": {
    "service": "api",
    "requestId": "a3f8e2b1-...",
    "method": "GET",
    "path": "/users/42"
  }
}
```

---

### 🔄 SmartRetry — Circuit Breaker + Exponential Backoff

Production-grade retry logic with per-attempt timeouts, jitter to avoid thundering herd, and an integrated circuit breaker.

```typescript
import { SmartRetry, retry, CircuitBreaker } from 'rezilia/retry';

// One-liner for simple use cases
const data = await retry(() => api.getData(), { attempts: 3, baseDelay: 500 });

// Full control
const retrier = new SmartRetry({
  attempts: 5,
  baseDelay: 500,       // ms — doubles each attempt: 500 → 1000 → 2000 → 4000
  maxDelay: 30_000,     // never wait more than 30s
  jitter: 0.2,          // ±20% randomness — prevents synchronized retries
  timeout: 10_000,      // fail each attempt after 10s

  shouldRetry: (err, attempt) => {
    if (err instanceof HttpError && err.status < 500) return false;
    return true;
  },

  onRetry: (err, attempt, delay) => {
    logger.warn(`Attempt ${attempt} failed, retrying in ${delay}ms`);
  },

  circuitBreaker: {
    threshold: 5,          // open after 5 consecutive failures
    resetAfter: 30_000,    // probe again after 30s
    halfOpenSuccesses: 2,  // need 2 successes to fully close
  },
});

const result = await retrier.execute(() => paymentGateway.charge(order));

console.log(retrier.circuitState); // 'CLOSED' | 'OPEN' | 'HALF_OPEN'
retrier.resetCircuit();             // manual reset (useful in tests)
```

**Circuit Breaker States:**

```
[CLOSED] —5 failures→ [OPEN] —30s timeout→ [HALF_OPEN] —2 successes→ [CLOSED]
                          ↑                       |
                          └──────failure───────────┘
```

---

## Tree-shakeable Imports

```typescript
import { SmartCache } from 'rezilia/cache';    // cache only
import { SmartLogger } from 'rezilia/logger';  // logger only
import { retry } from 'rezilia/retry';         // retry only
import { SmartCache, SmartLogger, retry } from 'rezilia'; // everything
```

Works with **ESM** and **CommonJS**:
```javascript
import { SmartCache } from 'rezilia/cache';       // ESM
const { SmartCache } = require('rezilia/cache');  // CommonJS
```

---

## Why not X?

| Feature | rezilia | node-cache | winston | axios-retry |
|---------|---------|-----------|---------|-------------|
| Singleflight / stampede prevention | ✅ | ❌ | ❌ | ❌ |
| Stale-While-Revalidate | ✅ | ❌ | ❌ | ❌ |
| TTL jitter | ✅ | ❌ | ❌ | ❌ |
| Async context propagation | ✅ | ❌ | ❌ | ❌ |
| Auto secret redaction | ✅ | ❌ | ❌ | ❌ |
| Circuit breaker | ✅ | ❌ | ❌ | ⚠️ partial |
| Per-attempt timeout | ✅ | ❌ | ❌ | ❌ |
| Zero runtime dependencies | ✅ | ✅ | ❌ | ❌ |
| Works with Bun | ✅ | ✅ | ✅ | ✅ |

---

## Requirements

| Runtime | Version |
|---------|---------|
| Node.js | ≥ 18.0.0 |
| Bun | ≥ 1.0.0 |
| TypeScript | ≥ 5.0 (optional) |

---

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

```bash
git clone https://github.com/Work-AbhishekMajumdar/rezilia.git
cd rezilia
npm install
npm test
npm run build
```

---

## License

[MIT](LICENSE) © 2026 [Abhishek Majumdar](https://github.com/Work-AbhishekMajumdar)
