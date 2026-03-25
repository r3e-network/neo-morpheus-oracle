import { incrementFixedWindowCounter, isUpstashConfigured } from './upstash';

interface RateLimitOptions {
  windowMs?: number;
  maxRequests?: number;
  keyGenerator?: (request: Request) => string;
  scope?: string;
}

interface RateLimitRecord {
  count: number;
  windowStart: number;
  lastAccessed: number;
}

const DEFAULT_WINDOW_MS = 60 * 1000;
const DEFAULT_MAX_REQUESTS = 100;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const MAX_AGE_MS = 10 * 60 * 1000;

const PRIVATE_IPS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^::1$/,
  /^[fF][cCdD][0-9a-fA-F]{2}:/,
];

let rateLimitMap = new Map<string, RateLimitRecord>();
let lastCleanup = Date.now();

function incrementLocalCounter(key: string, windowMs: number, now: number) {
  cleanupStaleEntries();
  const windowStart = now - windowMs;

  let record = rateLimitMap.get(key);
  if (!record || record.windowStart < windowStart) {
    record = { count: 0, windowStart: now, lastAccessed: now };
    rateLimitMap.set(key, record);
  } else {
    record.lastAccessed = now;
  }

  record.count += 1;

  return {
    count: record.count,
    resetAt: record.windowStart + windowMs,
  };
}

function cleanupStaleEntries(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, record] of rateLimitMap.entries()) {
    if (now - record.lastAccessed > MAX_AGE_MS) {
      rateLimitMap.delete(key);
    }
  }
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const ip = forwarded.split(',')[0].trim();
    return ip;
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }
  return 'unknown';
}

export function isPrivateIp(ip: string): boolean {
  if (!ip || ip === 'unknown') return true;
  return PRIVATE_IPS.some((regex) => regex.test(ip));
}

export function ipKeyGenerator(request: Request): string {
  const ip = getClientIp(request);
  return isPrivateIp(ip) ? 'internal' : ip;
}

export function rateLimit(options: RateLimitOptions = {}) {
  const windowMs = options.windowMs || DEFAULT_WINDOW_MS;
  const maxRequests = options.maxRequests || DEFAULT_MAX_REQUESTS;
  const keyGenerator = options.keyGenerator || ipKeyGenerator;
  const scope = String(options.scope || 'default').trim() || 'default';

  return async function rateLimitMiddleware(
    request: Request,
    next: (request: Request) => Promise<Response>
  ): Promise<Response> {
    const key = keyGenerator(request);
    const now = Date.now();
    let count = 0;
    let resetAt = now + windowMs;

    if (isUpstashConfigured()) {
      try {
        const shared = await incrementFixedWindowCounter(
          `morpheus:web-rate-limit:${scope}:${windowMs}:${key}`,
          windowMs
        );
        count = shared.current;
        resetAt = now + Math.max(shared.ttlMs, 0);
      } catch {
        const local = incrementLocalCounter(key, windowMs, now);
        count = local.count;
        resetAt = local.resetAt;
      }
    } else {
      const local = incrementLocalCounter(key, windowMs, now);
      count = local.count;
      resetAt = local.resetAt;
    }

    const remaining = Math.max(0, maxRequests - count);
    const resetTime = new Date(resetAt).toISOString();

    if (count > maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));
      return new Response(
        JSON.stringify({
          error: 'Too many requests',
          retryAfter: retryAfterSeconds,
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'X-RateLimit-Limit': String(maxRequests),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': resetTime,
            'Retry-After': String(retryAfterSeconds),
          },
        }
      );
    }

    const response = await next(request);
    const newHeaders = new Headers(response.headers);
    newHeaders.set('X-RateLimit-Limit', String(maxRequests));
    newHeaders.set('X-RateLimit-Remaining', String(remaining));
    newHeaders.set('X-RateLimit-Reset', resetTime);

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  };
}

export function createRateLimitedHandler(
  handler: (request: Request) => Promise<Response>,
  options: RateLimitOptions = {}
) {
  const limiter = rateLimit(options);
  return async function limitedHandler(request: Request): Promise<Response> {
    return limiter(request, () => handler(request));
  };
}

export function resetRateLimitMap(): void {
  rateLimitMap = new Map<string, RateLimitRecord>();
  lastCleanup = Date.now();
}
