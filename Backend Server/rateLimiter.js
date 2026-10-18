const https = require('https');
const crypto = require('crypto');

function clampInt(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(num)));
}

class MemoryRateLimiter {
  constructor({ maxEntries = 10000, cleanupIntervalMs = 5 * 60 * 1000 } = {}) {
    this.maxEntries = Math.max(100, Number(maxEntries) || 10000);
    this.entries = new Map();
    this.cleanupTimer = setInterval(() => this.cleanup(), cleanupIntervalMs);
    this.cleanupTimer.unref?.();
  }

  consume(key, { limit, windowMs }) {
    const safeLimit = Math.max(1, Number(limit) || 1);
    const safeWindow = Math.max(1000, Number(windowMs) || 60_000);
    const now = Date.now();
    const previous = this.entries.get(key);
    if (!previous || now - previous.start >= safeWindow) {
      this.ensureCapacity();
      this.entries.set(key, { start: now, count: 1 });
      return { limited: false, remaining: Math.max(0, safeLimit - 1), resetAt: now + safeWindow };
    }
    previous.count += 1;
    return {
      limited: previous.count > safeLimit,
      remaining: Math.max(0, safeLimit - previous.count),
      resetAt: previous.start + safeWindow,
    };
  }

  ensureCapacity() {
    if (this.entries.size < this.maxEntries) return;
    const target = Math.floor(this.maxEntries * 0.9);
    const iterator = this.entries.keys();
    while (this.entries.size > target) {
      const next = iterator.next();
      if (next.done) break;
      this.entries.delete(next.value);
    }
  }

  cleanup() {
    const now = Date.now();
    for (const [key, value] of this.entries) {
      if (now - value.start > 10 * 60_000) this.entries.delete(key);
    }
    this.ensureCapacity();
  }

  stop() {
    clearInterval(this.cleanupTimer);
  }
}

function requestUpstash({ url, token, command, timeoutMs = 2500 }) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const body = JSON.stringify(command);
    const request = https.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || 443,
      path: `${target.pathname || '/'}${target.search || ''}`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        Accept: 'application/json',
      },
      timeout: timeoutMs,
      rejectUnauthorized: true,
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const status = Number(response.statusCode || 0);
        const raw = Buffer.concat(chunks).toString('utf8');
        if (status < 200 || status >= 300) {
          return reject(new Error(`Upstash Redis returned HTTP ${status}.`));
        }
        try {
          const parsed = JSON.parse(raw || '{}');
          if (parsed.error) return reject(new Error(String(parsed.error)));
          resolve(parsed.result);
        } catch (error) {
          reject(new Error(`Invalid Upstash response: ${error.message}`));
        }
      });
    });
    request.on('timeout', () => request.destroy(new Error(`Upstash request timed out after ${timeoutMs}ms.`)));
    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

class UpstashRedisRateLimiter {
  constructor({ url, token, namespace = 'nexus:ratelimit', timeoutMs = 2500 } = {}) {
    this.url = String(url || '').trim().replace(/\/$/, '');
    this.token = String(token || '').trim();
    this.namespace = String(namespace || 'nexus:ratelimit').replace(/[^A-Za-z0-9:_-]/g, '_');
    this.timeoutMs = clampInt(timeoutMs, 500, 10000, 2500);
    if (!this.url || !this.token) throw new Error('Upstash Redis URL and token are required.');
    const parsed = new URL(this.url);
    if (parsed.protocol !== 'https:') throw new Error('Upstash Redis URL must use HTTPS.');
  }

  keyFor(key, windowMs) {
    const hash = crypto.createHash('sha256').update(String(key)).digest('hex').slice(0, 32);
    const window = Math.max(1000, Number(windowMs) || 60_000);
    const bucket = Math.floor(Date.now() / window);
    return `${this.namespace}:${window}:${bucket}:${hash}`;
  }

  async consume(key, { limit, windowMs }) {
    const safeLimit = Math.max(1, Number(limit) || 1);
    const safeWindow = Math.max(1000, Number(windowMs) || 60_000);
    const redisKey = this.keyFor(key, safeWindow);
    const result = await requestUpstash({
      url: `${this.url}/pipeline`,
      token: this.token,
      command: [
        ['INCR', redisKey],
        ['EXPIRE', redisKey, Math.ceil(safeWindow / 1000) + 1],
      ],
      timeoutMs: this.timeoutMs,
    });
    const count = Number(Array.isArray(result) ? result[0]?.result : NaN);
    if (!Number.isFinite(count)) throw new Error('Invalid distributed rate-limit counter response.');
    const now = Date.now();
    const resetAt = (Math.floor(now / safeWindow) + 1) * safeWindow;
    return { limited: count > safeLimit, remaining: Math.max(0, safeLimit - count), resetAt };
  }

  stop() {}
}

function createRateLimiter({ purpose = 'general' } = {}) {
  const url = String(process.env.UPSTASH_REDIS_REST_URL || '').trim();
  const token = String(process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
  const useRedis = Boolean(url && token);
  if (useRedis) {
    console.log(`🗄️ ${purpose} rate limiter: Upstash Redis`);
    return new UpstashRedisRateLimiter({
      url,
      token,
      namespace: process.env.NEXUS_RATE_LIMIT_NAMESPACE || `nexus:${purpose}`,
      timeoutMs: process.env.NEXUS_REDIS_TIMEOUT_MS,
    });
  }

  console.warn(`⚠️ ${purpose} rate limiter: in-memory fallback. Configure UPSTASH_REDIS_REST_URL/TOKEN before horizontal scaling.`);
  return new MemoryRateLimiter({ maxEntries: 20_000 });
}

module.exports = { MemoryRateLimiter, UpstashRedisRateLimiter, createRateLimiter };
