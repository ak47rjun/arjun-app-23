import { redisIncrWithTtl } from './redis';

export interface RateLimitOpts {
  key: string;
  limit: number;
  windowSec: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
}

/** Fixed-window rate limiter backed by Redis (in-memory fallback). */
export async function rateLimit(opts: RateLimitOpts): Promise<RateLimitResult> {
  const windowKey = `rl:${Math.floor(Date.now() / (opts.windowSec * 1000))}:${opts.key}`;
  const count = await redisIncrWithTtl(windowKey, opts.windowSec);
  const allowed = count <= opts.limit;
  return {
    allowed,
    remaining: Math.max(0, opts.limit - count),
    retryAfter: allowed ? 0 : opts.windowSec,
  };
}
