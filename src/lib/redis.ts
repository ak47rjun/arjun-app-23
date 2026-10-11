/** Redis client with graceful in-memory fallback (app keeps working if Redis is down). */
import Redis from 'ioredis';
import { env } from './env';

let client: Redis | null = null;
let failed = false;

export function getRedis(): Redis | null {
  if (failed) return null;
  if (client) return client;
  try {
    client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000)),
    });
    client.on('error', () => {
      /* logged by callers when an op fails */
    });
    client.on('close', () => {
      /* will reconnect on next command via retryStrategy */
    });
    return client;
  } catch {
    failed = true;
    return null;
  }
}

export async function redisGet(key: string): Promise<string | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    return await r.get(key);
  } catch {
    return null;
  }
}

export async function redisSet(key: string, value: string, ttlSec?: number): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    if (ttlSec) await r.set(key, value, 'EX', ttlSec);
    else await r.set(key, value);
  } catch {
    /* non-fatal */
  }
}

export async function redisDel(key: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.del(key);
  } catch {
    /* non-fatal */
  }
}

export async function redisIncrWithTtl(key: string, ttlSec: number): Promise<number> {
  const r = getRedis();
  if (!r) return memoryIncr(key, ttlSec);
  try {
    const n = await r.incr(key);
    if (n === 1) await r.expire(key, ttlSec);
    return n;
  } catch {
    return memoryIncr(key, ttlSec);
  }
}

export async function redisSAdd(key: string, member: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.sadd(key, member);
  } catch {
    /* non-fatal */
  }
}

export async function redisSRem(key: string, member: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.srem(key, member);
  } catch {
    /* non-fatal */
  }
}

export async function redisSMembers(key: string): Promise<string[]> {
  const r = getRedis();
  if (!r) return [];
  try {
    return await r.smembers(key);
  } catch {
    return [];
  }
}

export async function redisPing(): Promise<boolean> {
  const r = getRedis();
  if (!r) return false;
  try {
    return (await r.ping()) === 'PONG';
  } catch {
    return false;
  }
}

// ── in-memory fallback (single process) ──
const memoryStore = new Map<string, { value: number; expiresAt: number }>();
function memoryIncr(key: string, ttlSec: number): number {
  const now = Date.now();
  const entry = memoryStore.get(key);
  if (!entry || entry.expiresAt < now) {
    memoryStore.set(key, { value: 1, expiresAt: now + ttlSec * 1000 });
    return 1;
  }
  entry.value += 1;
  return entry.value;
}
