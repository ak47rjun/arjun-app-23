import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { json, parseBody, withApi } from '@/lib/api';
import { markAllRead } from '@/lib/notifications/service';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

export const GET = withApi(async (req, _ctx, user) => {
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 30), 100);
  const unreadOnly = url.searchParams.get('unreadOnly') === 'true';
  const notifications = await prisma.notification.findMany({
    where: { userId: user.id, ...(unreadOnly ? { readAt: null } : {}) },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  const unreadCount = await prisma.notification.count({ where: { userId: user.id, readAt: null } });
  return json({ notifications, unreadCount });
});

const patchSchema = z.object({
  ids: z.array(z.string()).optional(),
  all: z.boolean().optional(),
});

export const PATCH = withApi(async (req, _ctx, user) => {
  const body = await parseBody(req, patchSchema);
  if (body.all) {
    await markAllRead(user.id);
  } else if (body.ids && body.ids.length > 0) {
    await prisma.notification.updateMany({
      where: { id: { in: body.ids }, userId: user.id },
      data: { readAt: new Date() },
    });
  }
  return json({ ok: true });
});
