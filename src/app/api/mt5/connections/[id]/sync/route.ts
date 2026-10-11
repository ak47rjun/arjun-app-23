import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { forbidden, json, notFound, parseBody, withApi } from '@/lib/api';
import { enqueueMt5Sync } from '@/lib/mt5/sync';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

const schema = z.object({ type: z.enum(['MT5_SYNC', 'MT5_HISTORY']).default('MT5_SYNC') });

/** Manually trigger a synchronization (queued as a background job). */
export const POST = withApi(async (req, ctx, user) => {
  const connection = await prisma.mt5Connection.findUnique({ where: { id: ctx.params.id } });
  if (!connection) throw notFound('Connection not found');
  if (connection.userId !== user.id) throw forbidden('This connection belongs to another user');
  const body = await parseBody(req, schema).catch(() => ({ type: 'MT5_SYNC' as const }));
  const job = await enqueueMt5Sync(user.id, connection.id, body.type);
  return json({ jobId: job.id, status: job.status });
});

/** Recent sync jobs for this connection (status, errors, retries). */
export const GET = withApi(async (_req, ctx, user) => {
  const connection = await prisma.mt5Connection.findUnique({ where: { id: ctx.params.id } });
  if (!connection) throw notFound('Connection not found');
  if (connection.userId !== user.id) throw forbidden('This connection belongs to another user');
  const jobs = await prisma.syncJob.findMany({
    where: { connectionId: connection.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  return json({ jobs });
});
