import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { json, parseBody, withApi } from '@/lib/api';
import { assertConversationMember } from '@/lib/messenger/service';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

export const GET = withApi(async (_req, _ctx, user) => {
  const bookmarks = await prisma.messageBookmark.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    include: {
      message: {
        include: {
          sender: { select: { id: true, displayName: true, avatarUrl: true } },
          conversation: { select: { id: true, name: true, type: true } },
        },
      },
    },
  });
  return json({ saved: bookmarks.map((b) => b.message) });
});

const schema = z.object({ messageId: z.string() });

export const POST = withApi(async (req, _ctx, user) => {
  const body = await parseBody(req, schema);
  const message = await prisma.message.findUnique({ where: { id: body.messageId } });
  if (!message) return json({ error: 'NOT_FOUND', message: 'Message not found' }, 404);
  await assertConversationMember(message.conversationId, user.id);
  await prisma.messageBookmark.upsert({
    where: { messageId_userId: { messageId: message.id, userId: user.id } },
    create: { messageId: message.id, userId: user.id },
    update: {},
  });
  return json({ saved: true });
});

export const DELETE = withApi(async (req, _ctx, user) => {
  const messageId = new URL(req.url).searchParams.get('messageId');
  if (messageId) await prisma.messageBookmark.deleteMany({ where: { messageId, userId: user.id } });
  return json({ saved: false });
});
