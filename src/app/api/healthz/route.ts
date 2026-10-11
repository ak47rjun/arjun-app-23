import { json } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { redisPing } from '@/lib/redis';

export const dynamic = 'force-dynamic';

/** Public liveness/readiness probe for load balancers and uptime monitors. */
export async function GET() {
  const started = Date.now();
  const services: Record<string, { ok: boolean; detail?: string }> = {};

  try {
    await prisma.$queryRaw`SELECT 1`;
    services.database = { ok: true, detail: `${Date.now() - started}ms` };
  } catch (e) {
    services.database = { ok: false, detail: e instanceof Error ? e.message : 'unreachable' };
  }

  try {
    const ok = await redisPing();
    services.redis = ok ? { ok: true } : { ok: false, detail: 'unreachable (running with in-memory fallback)' };
  } catch {
    services.redis = { ok: false, detail: 'unreachable (running with in-memory fallback)' };
  }

  const ok = services.database.ok;
  return json({ status: ok ? 'ok' : 'degraded', services }, ok ? 200 : 503);
}
