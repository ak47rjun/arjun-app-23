import { prisma } from '@/lib/prisma';
import { redisPing } from '@/lib/redis';
import { json, withApi } from '@/lib/api';
import { env, mt5BridgeConfigured, livekitConfigured, googleAuthConfigured, smtpConfigured, s3Configured } from '@/lib/env';
import { getMarketProvider } from '@/lib/market/provider';
import { getStorage } from '@/lib/storage';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

/** System health: real checks against DB, Redis, storage and integrations. */
export const GET = withApi(
  async () => {
    let dbOk = false;
    let dbLatencyMs = 0;
    try {
      const t0 = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      dbOk = true;
      dbLatencyMs = Date.now() - t0;
    } catch {
      dbOk = false;
    }
    const redisOk = await redisPing();
    let storageOk = false;
    try {
      getStorage();
      storageOk = true;
    } catch {
      storageOk = false;
    }
    const counts = {
      users: await prisma.user.count(),
      trades: await prisma.trade.count(),
      messages: await prisma.message.count(),
      meetings: await prisma.meeting.count(),
      pendingJobs: await prisma.syncJob.count({ where: { status: 'PENDING' } }),
      failedJobs: await prisma.syncJob.count({ where: { status: 'FAILED' } }),
      openReports: await prisma.report.count({ where: { status: 'PENDING' } }),
    };
    return json({
      status: dbOk ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        database: { ok: dbOk, latencyMs: dbLatencyMs },
        redis: { ok: redisOk, mode: redisOk ? 'connected' : 'in-memory fallback' },
        storage: { ok: storageOk, provider: env.STORAGE_PROVIDER, s3Configured },
      },
      integrations: {
        marketData: getMarketProvider().status(),
        mt5Bridge: { configured: mt5BridgeConfigured },
        livekit: { configured: livekitConfigured },
        googleOAuth: { configured: googleAuthConfigured },
        smtp: { configured: smtpConfigured },
      },
      counts,
    });
  },
  { roles: ['ADMIN'] },
);
