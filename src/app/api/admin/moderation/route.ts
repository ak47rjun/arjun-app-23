import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { audit } from '@/lib/audit';
import { json, parseBody, withApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

const schema = z.object({
  action: z.enum(['WARN', 'BAN', 'UNBAN', 'DELETE_CONTENT', 'VERIFY_TRADER']),
  targetUserId: z.string().min(1),
  note: z.string().max(1000).optional(),
});

export const POST = withApi(
  async (req, _ctx, user) => {
    const body = await parseBody(req, schema);
    if (body.action === 'BAN') {
      await prisma.user.update({ where: { id: body.targetUserId }, data: { isBanned: true } });
      const { destroyAllSessions } = await import('@/lib/auth/session');
      await destroyAllSessions(body.targetUserId);
    }
    if (body.action === 'UNBAN') {
      await prisma.user.update({ where: { id: body.targetUserId }, data: { isBanned: false } });
    }
    await prisma.moderationAction.create({
      data: {
        moderatorId: user.id,
        action: body.action,
        targetUserId: body.targetUserId,
        details: { note: body.note ?? null },
      },
    });
    await audit(user.id, `MODERATION_${body.action}`, {
      entity: 'User',
      entityId: body.targetUserId,
      metadata: { note: body.note },
    });
    return json({ ok: true });
  },
  { roles: ['MODERATOR', 'ADMIN'] },
);

export const GET = withApi(
  async (req, _ctx, user) => {
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200);
    const actions = await prisma.moderationAction.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        moderator: { select: { id: true, displayName: true } },
      },
    });
    return json({ actions });
  },
  { roles: ['MODERATOR', 'ADMIN'] },
);
